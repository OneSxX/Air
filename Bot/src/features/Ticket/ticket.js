const {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { createEmbed } = require("../../utils/embed");
const { isCommandHandledBy } = require("../externalCommands");

// DB keys
const TCFG = (gid) => `ticket_cfg_${gid}`;
const TDATA = (channelId) => `ticket_data_${channelId}`;
const TCOUNT = (gid) => `ticket_counter_${gid}`;
const ticketCounterLocks = new Map();

function withGuildLock(guildId, task) {
  const key = String(guildId || "").trim();
  const prev = ticketCounterLocks.get(key) || Promise.resolve();

  const next = prev
    .catch((err) => { globalThis.__airWarnSuppressedError?.(err); })
    .then(task)
    .finally(() => {
      if (ticketCounterLocks.get(key) === next) {
        ticketCounterLocks.delete(key);
      }
    });

  ticketCounterLocks.set(key, next);
  return next;
}

async function reserveNextTicketNumber(db, guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) throw new Error("Gecersiz sunucu id.");

  return withGuildLock(gid, async () => {
    let n = Number((await db.get(TCOUNT(gid))) || 0);
    if (!Number.isFinite(n) || n < 0) n = 0;
    n += 1;
    await db.set(TCOUNT(gid), n);
    return n;
  });
}

// Helpers
function pad(num, len = 4) {
  return String(num).padStart(len, "0");
}

function isServerOwnerOrManager(interaction) {
  if (!interaction?.inGuild?.()) return false;
  if (interaction.user?.id === interaction.guild?.ownerId) return true;
  return Boolean(
    interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild) ||
      interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator)
  );
}

async function safeReply(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) return await interaction.editReply(payload);
    return await interaction.reply(payload);
  } catch (e) {
    if (e?.code === 10062) return; // Unknown interaction
    if (e?.code === 40060) return; // already acknowledged
    console.error("ticket safeReply error:", e);
  }
}

async function safeFollowUp(interaction, payload) {
  try {
    return await interaction.followUp(payload);
  } catch (e) {
    if (e?.code === 10062) return;
    if (e?.code === 40060) return;
    console.error("ticket safeFollowUp error:", e);
  }
}

// ===== Panel UI =====
function panelEmbed() {
  return createEmbed()
    .setTitle("Ticket")
    .setDescription("Ticket açmak için aşağıdaki butona tıklayabilirsiniz.");
}

function panelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("t_open_complaint")
        .setLabel("Şikayet ve bildirileriniz için")
        .setStyle(ButtonStyle.Primary)
    ),
  ];
}

function closeComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("t_close").setLabel("Ticket Kapat").setStyle(ButtonStyle.Danger)
    ),
  ];
}

// Log kanalına mesaj at (log opsiyonel)
async function sendTicketLog(guild, logChannelId, payload) {
  const sentChannelIds = [];

  if (logChannelId) {
    const logCh = await (guild.channels.fetch(logChannelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (logCh?.isTextBased?.()) {
      await (logCh.send(payload) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      sentChannelIds.push(logChannelId);
    }
  }

  const logsFeature = guild?.client?.features?.Logs;
  const db = guild?.client?.db;
  if (logsFeature?.sendTicketPayload && db) {
    await logsFeature
      .sendTicketPayload(guild, db, payload, { excludeChannelIds: sentChannelIds })
      .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }
}

// Panel kanalı izinleri: everyone görebilsin
async function ensurePanelPerms(guild, panelCh) {
  await panelCh.permissionOverwrites
    .edit(guild.roles.everyone.id, {
      ViewChannel: true,
      ReadMessageHistory: true,
    })
    .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
}

// Log kanalı izinleri: everyone göremesin, sadece yetkili rol + bot görebilsin
async function ensureLogPerms(guild, logCh, staffRoleId) {
  if (!logCh) return;

  await logCh.permissionOverwrites
    .edit(guild.roles.everyone.id, { ViewChannel: false })
    .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

  const me = guild.members.me;
  if (me) {
    await logCh.permissionOverwrites
      .edit(me.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        EmbedLinks: true,
        AttachFiles: true,
      })
      .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  if (staffRoleId) {
    await logCh.permissionOverwrites
      .edit(staffRoleId, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true,
      })
      .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }
}

// Bir mesaj "ticket panel" mi?
function isTicketPanelMessage(msg) {
  const hasTicketEmbed =
    Array.isArray(msg.embeds) &&
    msg.embeds.some((e) => (e?.title || "").toLowerCase().trim() === "ticket");

  if (!hasTicketEmbed) return false;

  const hasOpenButton =
    Array.isArray(msg.components) &&
    msg.components.some((row) => row.components?.some((c) => c?.customId === "t_open_complaint"));

  return hasOpenButton;
}

// Panel kanalda eski panel mesajlarini temizle (botun attiklari)
async function cleanupOldTicketPanels(panelCh, maxScan = 75) {
  if (!panelCh?.isTextBased?.()) return 0;

  const me = panelCh.guild.members.me;
  if (!me) return 0;

  const perms = panelCh.permissionsFor(me);
  if (!perms?.has(PermissionFlagsBits.ManageMessages)) return 0;

  const msgs = await (panelCh.messages.fetch({ limit: Math.min(maxScan, 100) }) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!msgs) return 0;

  let deleted = 0;
  const myId = me.id;

  for (const msg of msgs.values()) {
    if (msg.author?.id !== myId) continue;
    if (!isTicketPanelMessage(msg)) continue;

    await (msg.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    deleted += 1;
  }

  return deleted;
}

// Paneli tek tut: eskiyi sil + eskileri temizle + yenisini bas + pinle
async function replaceTicketPanelMessage(guild, cfg, db) {
  const panelCh = await (guild.channels.fetch(cfg.panelChannelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!panelCh?.isTextBased?.()) return { ok: false, error: "Panel kanalı bulunamadı veya yazı kanalı degil." };

  await ensurePanelPerms(guild, panelCh);

  // 1) DB'de kayıtlı panel mesajı varsa sil
  if (cfg.panelMessageId) {
    const old = await (panelCh.messages.fetch(cfg.panelMessageId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (old) await (old.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  // 2) Kanaldaki eski panel mesajlarını temizle
  await cleanupOldTicketPanels(panelCh, 75);

  // 3) Yeni panel bas
  const msg = await panelCh.send({ embeds: [panelEmbed()], components: panelComponents() });

  // 4) Pinle (izin yoksa sessiz geç)
  try {
    if (!msg.pinned) await msg.pin();
  } catch (err) {
    globalThis.__airWarnSuppressedError?.(err);
  }

  // 5) cfg güncelle
  cfg.panelMessageId = msg.id;
  await db.set(TCFG(guild.id), cfg);

  return { ok: true, panelChannel: panelCh, message: msg };
}

module.exports = function registerTicket(client, db) {
  client.on("interactionCreate", async (interaction) => {
    const slashCommandName = interaction?.isChatInputCommand?.()
      ? String(interaction.commandName || "").toLowerCase()
      : "";
    const isTicketSlash = isCommandHandledBy(slashCommandName, "ticket");
    const slashStartedAt = isTicketSlash ? Date.now() : 0;
    let slashAuditLogged = false;

    const recordSlashAudit = async (ok, error = null) => {
      if (!isTicketSlash || slashAuditLogged) return;
      slashAuditLogged = true;
      const systemOps = client.features?.SystemOps;
      if (!systemOps?.recordCommandAudit) return;
      await systemOps.recordCommandAudit(interaction, client, {
        ok: ok !== false,
        durationMs: Math.max(0, Date.now() - slashStartedAt),
        error: error ? String(error).slice(0, 300) : null,
      }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    };

    const auditedReply = async (payload, opts = {}) => {
      const out = await safeReply(interaction, payload);
      await recordSlashAudit(opts.ok !== false, opts.error || null);
      return out;
    };

    try {
      // -------- SLASH --------
      if (interaction.isChatInputCommand()) {
        const commandName = slashCommandName;
        if (!isCommandHandledBy(commandName, "ticket")) return;

        if (!interaction.inGuild()) {
          return auditedReply( {
            content: "Bu komut sadece sunucuda kullanilabilir.",
            ephemeral: true,
          });
        }

        const systemOps = client.features?.SystemOps;
        if (systemOps?.checkCommandRateLimit) {
          const rate = systemOps.checkCommandRateLimit(interaction, client);
          if (rate?.limited) {
            const retrySec = Math.max(1, Math.ceil(Number(rate.retryMs || 0) / 1000));
            return auditedReply( {
              content: `Cok hizli komut kullaniyorsun. ${retrySec} sn sonra tekrar dene.`,
              ephemeral: true,
            }, { ok: false, error: "rate_limited" });
          }
        }

        await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        const sub = interaction.options.getSubcommand();
        const adminSubcommands = new Set(["setup", "panel", "off"]);
        if (adminSubcommands.has(sub) && !isServerOwnerOrManager(interaction)) {
          return auditedReply( {
            content: "Bu alt komutlari sadece yonetici veya sunucu sahibi kullanabilir.",
            ephemeral: true,
          });
        }

        // /ticket setup  (sıra: kategori -> log -> panel)
        if (sub === "setup") {
          const kategori = interaction.options.getChannel("kategori", true);
          const logCh = interaction.options.getChannel("log", false); // opsiyonel
          const panelCh = interaction.options.getChannel("panel", true);
          const yetkiliRol = interaction.options.getRole("yetkili_rol", false);

          if (kategori.type !== ChannelType.GuildCategory) {
            return auditedReply( { content: "Ticket kategorisi bir **kategori** olmalı.", ephemeral: true });
          }

          const isTextOrNews = (ch) =>
            ch?.type === ChannelType.GuildText || ch?.type === ChannelType.GuildAnnouncement;

          if (!isTextOrNews(panelCh)) {
            return auditedReply( { content: "Panel kanalı bir **yazı kanalı** olmalı.", ephemeral: true });
          }

          if (logCh && !isTextOrNews(logCh)) {
            return auditedReply( { content: "Log kanalı bir **yazı kanalı** olmalı.", ephemeral: true });
          }

          await ensurePanelPerms(interaction.guild, panelCh);
          if (logCh) await ensureLogPerms(interaction.guild, logCh, yetkiliRol?.id || null);

          const cfg = {
            panelChannelId: panelCh.id,
            categoryId: kategori.id,
            staffRoleId: yetkiliRol?.id || null,
            logChannelId: logCh?.id || null,
            panelMessageId: null,
          };

          await db.set(TCFG(interaction.guildId), cfg);

          return auditedReply( {
            content:
              `Ticket sistemi kuruldu.\n` +
              `- Kategori: <#${kategori.id}>\n` +
              `- Log: ${logCh ? `<#${logCh.id}>` : "**Kapali (secilmedi)**"}\n` +
              `- Panel: <#${panelCh.id}>\n` +
              `- Yetkili rol: ${yetkiliRol ? `<@&${yetkiliRol.id}>` : "Yok"}\n\n` +
              `Paneli basmak/yenilemek icin: **/ticket panel** (eski panelleri de temizler).`,
            ephemeral: true,
          });
        }

        // /ticket panel
        if (sub === "panel") {
          const cfg = await db.get(TCFG(interaction.guildId));
          if (!cfg?.panelChannelId || !cfg?.categoryId) {
            return auditedReply( { content: "Once `/ticket setup` yap.", ephemeral: true });
          }

          const res = await replaceTicketPanelMessage(interaction.guild, cfg, db);
          if (!res.ok) {
            return auditedReply( {
              content: "Panel basılamadı: " + (res.error || "Bilinmeyen hata"),
              ephemeral: true,
            });
          }

          return auditedReply( { content: "Ticket panel yenilendi (eski paneller temizlendi).", ephemeral: true });
        }

        // /ticket off
        if (sub === "off") {
          await db.delete(TCFG(interaction.guildId));
          return auditedReply( { content: "Ticket sistemi kapatildi.", ephemeral: true });
        }

        await recordSlashAudit(false, "unsupported_subcommand");
        return;
      }

      // -------- BUTTONS --------
      if (interaction.isButton()) {
        if (!interaction.customId?.startsWith("t_")) return;

        const cfg = await db.get(TCFG(interaction.guildId));
        if (!cfg) {
          return auditedReply( { content: "Ticket sistemi kurulu degil. `/ticket setup` yap.", ephemeral: true });
        }

        // Açma butonu -> modal
        if (interaction.customId === "t_open_complaint") {
          const modal = new ModalBuilder()
            .setCustomId("t_modal_open")
            .setTitle("Lütfen sorununuzu detaylı anlatın");

          const input = new TextInputBuilder()
            .setCustomId("complaint")
            .setLabel("Şikayet / Bildiri")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000);

          modal.addComponents(new ActionRowBuilder().addComponents(input));
          return interaction.showModal(modal);
        }

        // Kapat butonu -> modal
        if (interaction.customId === "t_close") {
          const modal = new ModalBuilder().setCustomId("t_modal_close").setTitle("Ticket Kapat");

          const input = new TextInputBuilder()
            .setCustomId("close_reason")
            .setLabel("Kapatma nedeni")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(800);

          modal.addComponents(new ActionRowBuilder().addComponents(input));
          return interaction.showModal(modal);
        }

        return;
      }

      // -------- MODALS --------
      if (interaction.isModalSubmit()) {
        if (!interaction.customId?.startsWith("t_modal_")) return;

        const cfg = await db.get(TCFG(interaction.guildId));
        if (!cfg) {
          return auditedReply( { content: "Ticket sistemi kurulu degil. `/ticket setup` yap.", ephemeral: true });
        }

        // Modal: ticket aç
        if (interaction.customId === "t_modal_open") {
          await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

          const complaint = (interaction.fields.getTextInputValue("complaint") || "").trim();
          if (!complaint) return auditedReply( { content: "Sikayet bos olamaz.", ephemeral: true });

          const n = await reserveNextTicketNumber(db, interaction.guildId);

          const ticketId = pad(n);
          const name = `ticket-${ticketId}`;

          const overwrites = [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            {
              id: interaction.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
          ];

          if (cfg.staffRoleId) {
            overwrites.push({
              id: cfg.staffRoleId,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            });
          }

          const ch = await interaction.guild.channels.create({
            name,
            type: ChannelType.GuildText,
            parent: cfg.categoryId || null,
            permissionOverwrites: overwrites,
            topic: `Ticket ⬢ Açan: ${interaction.user.tag} (${interaction.user.id})`,
          });

          await db.set(TDATA(ch.id), {
            id: ticketId,
            openedById: interaction.user.id,
            openedByTag: interaction.user.tag,
            complaint,
            openedAt: Date.now(),
          });

          const embed = createEmbed()
            .setTitle("Ticket Acildi")
            .setDescription(
              `**Açan:** <@${interaction.user.id}>\n` +
              `**Ticket ID:** ${ticketId}\n\n` +
              `**Şikayet / Bildiri:**\n${complaint}`
            );

          await ch.send({ embeds: [embed], components: closeComponents() });

          // Acilis logu (opsiyonel)
          await sendTicketLog(interaction.guild, cfg.logChannelId, {
            embeds: [
              createEmbed()
                .setTitle("Ticket Acildi")
                .setDescription(
                  `**Ticket ID:** ${ticketId}\n` +
                  `**Kategori:** Şikayet ve bildirileriniz için\n` +
                  `**Açan:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
                  `**Kanal:** <#${ch.id}>\n` +
                  `**Acilis:** <t:${Math.floor(Date.now() / 1000)}:f>\n\n` +
                  `**Şikayet / Bildiri:**\n${complaint}`
                ),
            ],
          });

          return auditedReply( { content: `Ticket acildi: <#${ch.id}>`, ephemeral: true });
        }

        // Modal: ticket kapat + LOG (opsiyonel)
        if (interaction.customId === "t_modal_close") {
          await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

          const closeReason = (interaction.fields.getTextInputValue("close_reason") || "").trim();
          if (!closeReason) return auditedReply( { content: "Kapatma nedeni bos olamaz.", ephemeral: true });

          const data = await db.get(TDATA(interaction.channelId));
          if (!data) {
            return auditedReply( { content: "Bu kanal ticket gibi görünmüyor (DB kaydı yok).", ephemeral: true });
          }

          const openedAtText = `<t:${Math.floor(data.openedAt / 1000)}:f>`;
          const closedAt = Date.now();
          const closedAtText = `<t:${Math.floor(closedAt / 1000)}:f>`;

          const logEmbed = createEmbed()
            .setTitle("Ticket Kapatildi")
            .setDescription(
              `**Ticket ID:** ${data.id}\n` +
              `**Kategori:** Şikayet ve bildirileriniz için\n` +
              `**Açan:** <@${data.openedById}> (${data.openedByTag})\n` +
              `**Kapatan:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
              `**Acilis:** ${openedAtText}\n` +
              `**Kapanis:** ${closedAtText}\n\n` +
              `**Şikayet / Bildiri:**\n${data.complaint}\n\n` +
              `**Kapatma Nedeni:**\n${closeReason}`
            );

          await sendTicketLog(interaction.guild, cfg.logChannelId, { embeds: [logEmbed] });

          await db.delete(TDATA(interaction.channelId));
          await safeReply(interaction, { content: "Ticket kapatiliyor...", ephemeral: true });

          await (interaction.channel.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        return;
      }
    } catch (e) {
      await recordSlashAudit(false, e?.message || "ticket_error");
      console.error("TICKET ERROR:", e);
      if (interaction?.isRepliable?.()) {
        await safeReply(interaction, { content: "Hata oldu (konsola bak).", ephemeral: true });
      }
    }
  });
};

module.exports.__private = {
  reserveNextTicketNumber,
  withGuildLock,
};

