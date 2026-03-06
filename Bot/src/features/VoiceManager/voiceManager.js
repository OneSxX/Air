/**
 * voiceManager.js — MULTI-SUNUCU (GUILD) DESTEKLİ
 * VS / Node / discord.js v14 UYUMLU (stabil)
 *
 * RULE ✅ (VOICE CHAT ONLY):
 * - /panel: SADECE voice kanal chat'inde çalışır (başka yerde asla çalışmaz)
 * - /setup: 2 mod
 *   - Eğer "kanal" parametresi YOKSA => SADECE voice kanal chat'inde kullanılabilir.
 *   - Eğer "kanal" parametresi VARSA => her yerden kullanılabilir (hedef voice'a kurar).
 */

const {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { isCommandHandledBy } = require("../externalCommands");
const {
  checkCommandChannelRestriction,
  buildCommandChannelBlockedMessage,
} = require("../../utils/commandChannel");

// -------------------- DB Keys --------------------
const VC_KEY = (id) => `vc_${id}`;
const TEMP_TEMPLATE_KEY = (gid) => `temp_template_${gid}`;
const USER_TPL_KEY = (gid, userId) => `user_tpl_${gid}_${userId}`;
const GUILD_CFG_KEY = (gid) => `guild_cfg_${gid}`;
const USER_ID_RE = /^\d{15,25}$/;

// -------------------- Helpers --------------------
const uniq = (arr) => Array.from(new Set(arr || []));

function isServerOwnerOrAdmin(member) {
  if (!member?.guild) return false;
  if (member.id === member.guild.ownerId) return true;
  return Boolean(
    member.permissions?.has?.(PermissionFlagsBits.Administrator) ||
      member.permissions?.has?.(PermissionFlagsBits.ManageGuild)
  );
}
function isRoomOwner(memberId, data) {
  return data?.ownerId === memberId;
}
function isRoomMod(memberId, data) {
  const mods = Array.isArray(data?.mods) ? data.mods : [];
  return mods.includes(memberId);
}
function getMemberId(member) {
  const direct = String(member?.id || "").trim();
  if (USER_ID_RE.test(direct)) return direct;

  const fromUser = String(member?.user?.id || "").trim();
  if (USER_ID_RE.test(fromUser)) return fromUser;

  return "";
}
function resolveActorId(member, fallbackUserId = "") {
  const memberId = getMemberId(member);
  if (memberId) return memberId;

  const fallback = String(fallbackUserId || "").trim();
  return USER_ID_RE.test(fallback) ? fallback : "";
}
function canManageRoom(member, data, fallbackUserId = "") {
  const memberId = resolveActorId(member, fallbackUserId);
  if (!memberId) return false;
  return isServerOwnerOrAdmin(member) || isRoomOwner(memberId, data);
}
function canEditAllowDeny(member, data, fallbackUserId = "") {
  const memberId = resolveActorId(member, fallbackUserId);
  if (!memberId) return false;
  return (
    isServerOwnerOrAdmin(member) ||
    isRoomOwner(memberId, data) ||
    isRoomMod(memberId, data)
  );
}

async function safeReply(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) return await interaction.editReply(payload);
    return await interaction.reply(payload);
  } catch (e) {
    if (e?.code === 10062) return;
    if (e?.code === 40060) return;
    console.error("safeReply error:", e);
  }
}
async function safeFollowUp(interaction, payload) {
  try {
    return await interaction.followUp(payload);
  } catch (e) {
    if (e?.code === 10062) return;
    if (e?.code === 40060) return;
    console.error("safeFollowUp error:", e);
  }
}

// -------------------- Voice perms --------------------
async function applyVoicePerms(guild, voice, data) {
  const everyoneId = guild.roles.everyone.id;

  const previouslyManaged = new Set(data.managedPermIds || []);
  const desiredManaged = new Set(
    [data.ownerId, ...(data.mods || []), ...(data.allow || []), ...(data.deny || [])].filter(Boolean)
  );

  // ✅ stale cleanup
  for (const id of previouslyManaged) {
    if (!desiredManaged.has(id) && id !== everyoneId) {
      await (voice.permissionOverwrites.delete(id) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  }

  // @everyone base visibility/connect
  await voice.permissionOverwrites
    .edit(everyoneId, {
      Connect: data.locked ? false : true,
      ViewChannel: data.hidden ? false : true,
    })
    .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

  // deny list
  for (const id of data.deny || []) {
    await (voice.permissionOverwrites.edit(id, { Connect: false }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  // allow list
  for (const id of data.allow || []) {
    await (voice.permissionOverwrites.edit(id, { Connect: true, ViewChannel: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  // owner + mods always connect/see
  if (data.ownerId) {
    await (voice.permissionOverwrites.edit(data.ownerId, { Connect: true, ViewChannel: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }
  for (const id of data.mods || []) {
    await (voice.permissionOverwrites.edit(id, { Connect: true, ViewChannel: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  data.managedPermIds = Array.from(desiredManaged);
}

function resetRoomState(data, fallbackOwnerId = "") {
  const currentOwner = String(data?.ownerId || "").trim();
  const safeFallbackOwner = String(fallbackOwnerId || "").trim();
  const ownerId = USER_ID_RE.test(currentOwner)
    ? currentOwner
    : USER_ID_RE.test(safeFallbackOwner)
      ? safeFallbackOwner
      : "";

  if (ownerId) data.ownerId = ownerId;
  data.mods = [];
  data.allow = [];
  data.deny = [];
  data.locked = false;
  data.hidden = false;
  data.userLimit = 0;
  data.managedPermIds = ownerId ? [ownerId] : [];
}

// -------------------- SYNC: channel -> data --------------------
async function syncDataFromChannel(guild, voice, data) {
  const everyoneId = guild.roles.everyone.id;

  data.userLimit = Number.isInteger(voice.userLimit) ? voice.userLimit : 0;

  const everyoneOw = voice.permissionOverwrites.cache.get(everyoneId);
  const everyoneDenied = !!everyoneOw?.deny?.has?.(PermissionFlagsBits.Connect);
  const everyoneHidden = !!everyoneOw?.deny?.has?.(PermissionFlagsBits.ViewChannel);
  data.locked = everyoneDenied;
  data.hidden = everyoneHidden;

  const modsSet = new Set(data.mods || []);
  const ownerId = data.ownerId;

  const allow = [];
  const deny = [];

  for (const [id, ow] of voice.permissionOverwrites.cache) {
    if (id === everyoneId) continue;
    if (typeof ow.type !== "undefined" && ow.type === 0) continue; // role overwrite ignore

    const allowConnect = !!ow.allow?.has?.(PermissionFlagsBits.Connect);
    const denyConnect = !!ow.deny?.has?.(PermissionFlagsBits.Connect);

    if (allowConnect && !denyConnect) {
      if (id !== ownerId && !modsSet.has(id)) allow.push(id);
    } else if (denyConnect && !allowConnect) {
      if (id !== ownerId && !modsSet.has(id)) deny.push(id);
    }
  }

  data.allow = uniq(allow);
  data.deny = uniq(deny);
  data.managedPermIds = uniq([ownerId, ...(data.mods || []), ...(data.allow || []), ...(data.deny || [])].filter(Boolean));
}

// -------------------- Voice-chat guards --------------------
async function getVoiceFromInteractionChannel(interaction) {
  const ch = await (interaction.guild.channels.fetch(interaction.channelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!ch || ch.type !== ChannelType.GuildVoice) return null;
  return ch;
}

// -------------------- Panel UI --------------------
function buildPanelComponents(data, targetChannelId) {
  const ownerDefault = USER_ID_RE.test(String(data?.ownerId || "").trim())
    ? [String(data.ownerId).trim()]
    : [];
  const modsDefault = uniq((data?.mods || [])
    .map((id) => String(id || "").trim())
    .filter((id) => USER_ID_RE.test(id))).slice(0, 10);
  const allowDefault = uniq((data?.allow || [])
    .map((id) => String(id || "").trim())
    .filter((id) => USER_ID_RE.test(id))).slice(0, 25);
  const denyDefault = uniq((data?.deny || [])
    .map((id) => String(id || "").trim())
    .filter((id) => USER_ID_RE.test(id))).slice(0, 25);

  const ownerMenu = new UserSelectMenuBuilder()
    .setCustomId(`sel_owner:${targetChannelId}`)
    .setPlaceholder("Oda sahibi sec")
    .setMinValues(1)
    .setMaxValues(1);
  if (ownerDefault.length) ownerMenu.addDefaultUsers(...ownerDefault);
  const ownerSel = new ActionRowBuilder().addComponents(ownerMenu);

  const modsMenu = new UserSelectMenuBuilder()
    .setCustomId(`sel_mods:${targetChannelId}`)
    .setPlaceholder("Oda yetkilileri sec")
    .setMinValues(0)
    .setMaxValues(10);
  if (modsDefault.length) modsMenu.addDefaultUsers(...modsDefault);
  const modsSel = new ActionRowBuilder().addComponents(modsMenu);

  const allowMenu = new UserSelectMenuBuilder()
    .setCustomId(`sel_allow:${targetChannelId}`)
    .setPlaceholder("Odaya girebilecek kullanicilar")
    .setMinValues(0)
    .setMaxValues(25);
  if (allowDefault.length) allowMenu.addDefaultUsers(...allowDefault);
  const allowSel = new ActionRowBuilder().addComponents(allowMenu);

  const denyMenu = new UserSelectMenuBuilder()
    .setCustomId(`sel_deny:${targetChannelId}`)
    .setPlaceholder("Reddedilecek kullanicilar")
    .setMinValues(0)
    .setMaxValues(25);
  if (denyDefault.length) denyMenu.addDefaultUsers(...denyDefault);
  const denySel = new ActionRowBuilder().addComponents(denyMenu);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_lock_toggle:${targetChannelId}`)
      .setEmoji(data.locked ? "🔓" : "🔒")
      .setStyle(data.locked ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`btn_limit:${targetChannelId}`).setEmoji("👥").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`btn_rename:${targetChannelId}`).setEmoji("✏️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`btn_visibility:${targetChannelId}`)
      .setEmoji("👁️")
      .setStyle(data.hidden ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`btn_reset:${targetChannelId}`).setEmoji("🧹").setStyle(ButtonStyle.Secondary)
  );

  return [ownerSel, modsSel, allowSel, denySel, buttons];
}

const panelTimers = new Map();

/**
 * ✅ VS UYUMLU PANEL:
 * - Voice channel "chat" kapalıysa mesaj atılamaz => sessiz çık.
 * - Panel mesajı varsa editler, yoksa yenisini basar.
 */
async function upsertPanel(panelChannel, data, db) {
  // Voice kanalı normalde "textBased" değildir.
  // Ama Discord voice chat açık ise discord.js bunu message-capable gösterebiliyor.
  // Yine de güvenli kontrol:
  if (!panelChannel?.messages?.fetch || !panelChannel?.send) return;

  const doEdit = async () => {
    const roomName = String(panelChannel?.name || "Voice Oda");
    const content =
      `┆✏️• ${roomName} ` +
      `┆${data.locked ? "🔒" : "🔓"}• ${data.locked ? "Kilitli" : "Açık"} ` +
      `┆🔎• ${data.hidden ? "Görünmez" : "Görünür"} ` +
      `┆👥• Limit: **${data.userLimit ?? 0}**`;
    const components = buildPanelComponents(data, panelChannel.id);

    let msg = null;

    if (data.panelMessageId) {
      msg = await (panelChannel.messages.fetch(data.panelMessageId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    }

    // Eğer panelMessageId var ama mesaj silindiyse -> msg null -> yeni bas
    if (!msg) {
      msg = await (panelChannel.send({ content, components }) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
      if (!msg) return;

      data.panelMessageId = msg.id;
      await db.set(VC_KEY(panelChannel.id), data);

      // pin dene (voice chat’te pin her zaman desteklenmeyebilir)
      try {
        if (msg.pin) await (msg.pin() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      } catch (err) {
        globalThis.__airWarnSuppressedError?.(err);
      }
    } else {
      await (msg.edit({ content, components }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      try {
        if (msg.pin && !msg.pinned) await (msg.pin() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      } catch (err) {
        globalThis.__airWarnSuppressedError?.(err);
      }
    }
  };

  clearTimeout(panelTimers.get(panelChannel.id));
  return new Promise((resolve) => {
    const t = setTimeout(async () => {
      panelTimers.delete(panelChannel.id);
      await doEdit();
      resolve();
    }, 350);
    panelTimers.set(panelChannel.id, t);
  });
}

async function autoUpdateTempTemplateFromChannel(db, guildId, voice, data) {
  if (!data || data.persistent) return;
  await db.set(TEMP_TEMPLATE_KEY(guildId), {
    mods: uniq(data.mods || []),
    allow: uniq(data.allow || []),
    deny: uniq(data.deny || []),
    locked: !!data.locked,
    hidden: !!data.hidden,
    userLimit: Number.isInteger(data.userLimit) ? data.userLimit : voice.userLimit ?? 0,
  });
}

async function afterChange(db, guild, voice, data, panelChannel) {
  await applyVoicePerms(guild, voice, data);
  await db.set(VC_KEY(panelChannel.id), data);
  await upsertPanel(panelChannel, data, db);
  await autoUpdateTempTemplateFromChannel(db, guild.id, voice, data);
}

// -------------------- Interaction helpers --------------------
function extractTargetChannelIdFromCustomId(customId) {
  if (!customId || typeof customId !== "string") return null;
  const parts = customId.split(":");
  if (parts.length < 2) return null;
  const maybeId = parts[1];
  return /^\d{15,25}$/.test(maybeId) ? maybeId : null;
}

async function getManaged(db, interaction) {
  const panelChannel = await (interaction.guild.channels.fetch(interaction.channelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!panelChannel || panelChannel.type !== ChannelType.GuildVoice) {
    return { error: "Panel sadece voice kanal chat'inde kullanılabilir." };
  }

  const hintedId = extractTargetChannelIdFromCustomId(interaction.customId || "");
  if (hintedId && hintedId !== panelChannel.id) {
    // eski panel / kopya panel => ignore
  }

  const voice = panelChannel;

  const data = await db.get(VC_KEY(panelChannel.id));
  if (!data) return { error: "Bu voice kanal bot tarafindan yonetilmiyor." };

  if (!Array.isArray(data.mods)) data.mods = [];
  if (!Array.isArray(data.allow)) data.allow = [];
  if (!Array.isArray(data.deny)) data.deny = [];
  if (!Array.isArray(data.managedPermIds)) data.managedPermIds = [];
  data.hidden = !!data.hidden;
  return { voice, panelChannel, data };
}

// ==================== EXPORT: REGISTER ====================
module.exports = function registerVoiceManager(client, db) {
  client.on("voiceStateUpdate", async (oldState, newState) => {
    try {
      if (!newState.guild || !newState.member) return;

      const gcfg = await db.get(GUILD_CFG_KEY(newState.guild.id));
      const createId = gcfg?.createChannelId;

      if (createId && newState.channelId === createId) {
        const guild = newState.guild;
        const parentId = newState.channel?.parentId ?? null;

        let baseTpl = await db.get(TEMP_TEMPLATE_KEY(guild.id));
        if (!baseTpl) {
          baseTpl = { mods: [], allow: [], deny: [], locked: false, hidden: false, userLimit: 0 };
          await db.set(TEMP_TEMPLATE_KEY(guild.id), baseTpl);
        }

        const displayName = newState.member.displayName || newState.member.user.username;
        const userTpl = await db.get(USER_TPL_KEY(guild.id, newState.member.id));
        const channelName =
          userTpl?.name && String(userTpl.name).trim().length > 0
            ? String(userTpl.name).trim()
            : `📍・${displayName} Odası`;

        const voice = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildVoice,
          parent: parentId,
        });

        await (newState.member.voice.setChannel(voice) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

        const limit = Number.isInteger(baseTpl?.userLimit) ? baseTpl.userLimit : 0;
        await (voice.setUserLimit(limit) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

        const data = {
          ownerId: newState.member.id,
          mods: uniq(baseTpl?.mods || []),
          allow: uniq(baseTpl?.allow || []),
          deny: uniq(baseTpl?.deny || []),
          locked: !!baseTpl?.locked,
          hidden: !!baseTpl?.hidden,
          userLimit: limit,
          persistent: false,
          panelMessageId: null,
          managedPermIds: [],
        };

        await db.set(VC_KEY(voice.id), data);

        applyVoicePerms(guild, voice, data).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        upsertPanel(voice, data, db).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      // temp oda boşsa sil
      if (oldState.channel) {
        const data = await db.get(VC_KEY(oldState.channel.id));
        if (data && !data.persistent && oldState.channel.members.size === 0) {
          await db.delete(VC_KEY(oldState.channel.id));
          await (oldState.channel.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }
      }
    } catch (e) {
      console.error("[VoiceManager voiceStateUpdate]", e);
    }
  });

  client.on("channelUpdate", async (_oldChannel, newChannel) => {
    try {
      if (!newChannel || newChannel.type !== ChannelType.GuildVoice) return;

      const data = await db.get(VC_KEY(newChannel.id));
      if (!data) return;

      if (!Array.isArray(data.managedPermIds)) data.managedPermIds = [];
      data.hidden = !!data.hidden;

      await syncDataFromChannel(newChannel.guild, newChannel, data);
      await db.set(VC_KEY(newChannel.id), data);
      await upsertPanel(newChannel, data, db);
      await autoUpdateTempTemplateFromChannel(db, newChannel.guild.id, newChannel, data);
    } catch (e) {
      console.error("[VoiceManager channelUpdate]", e);
    }
  });

  client.on("interactionCreate", async (interaction) => {
    const slashCommandName = interaction?.isChatInputCommand?.()
      ? String(interaction.commandName || "").toLowerCase()
      : "";
    const isVoiceSlash = isCommandHandledBy(slashCommandName, "voiceManager");
    const slashStartedAt = isVoiceSlash ? Date.now() : 0;
    let slashAuditLogged = false;

    const recordSlashAudit = async (ok, error = null) => {
      if (!isVoiceSlash || slashAuditLogged) return;
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
      // Ticket butonlarını es geç
      if (interaction.isButton()) {
        const id = interaction.customId || "";
        if (id.startsWith("t_")) return;
      }

      if (!interaction?.inGuild?.()) {
        if (isVoiceSlash) {
          return auditedReply(
            {
              content: "Bu komut sadece sunucuda kullanilabilir.",
              ephemeral: true,
            },
            { ok: false, error: "dm_not_supported" }
          );
        }
        return;
      }

      // -------- SLASH --------
      if (interaction.isChatInputCommand()) {
        const commandName = slashCommandName;
        if (!isCommandHandledBy(commandName, "voiceManager")) return;
        const voiceSub = commandName === "voice"
          ? String(interaction.options?.getSubcommand?.(false) || "").toLowerCase()
          : null;

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

        const channelGate = await checkCommandChannelRestriction(interaction, client, {
          bypassCommands: ["komutoda", "panel"],
        });
        if (!channelGate.allowed) {
          return auditedReply(
            {
              content: buildCommandChannelBlockedMessage(channelGate.channelId),
              ephemeral: true,
            },
            { ok: false, error: "command_channel_restricted" }
          );
        }

        // /setcreate
        if (commandName === "setcreate") {
          await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
          if (!isServerOwnerOrAdmin(interaction.member)) {
            return auditedReply( { content: "Bu komutu sadece admin/sunucu sahibi kullanabilir.", ephemeral: true });
          }

          const ch = interaction.options.getChannel("kanal", true);
          if (ch.type !== ChannelType.GuildVoice) {
            return auditedReply( { content: "Lütfen bir **VOICE kanal** seç.", ephemeral: true });
          }

          await db.set(GUILD_CFG_KEY(interaction.guildId), { createChannelId: ch.id });

          const tpl = await db.get(TEMP_TEMPLATE_KEY(interaction.guildId));
          if (!tpl) {
            await db.set(TEMP_TEMPLATE_KEY(interaction.guildId), {
              mods: [],
              allow: [],
              deny: [],
              locked: false,
              hidden: false,
              userLimit: 0,
            });
          }

          return auditedReply( { content: `✅ Join-to-create ayarlandı: **${ch.name}**`, ephemeral: true });
        }

        let optCh = null;
        try {
          optCh = interaction.options?.getChannel?.("kanal", false) ?? null;
        } catch (err) {
          globalThis.__airWarnSuppressedError?.(err);
          optCh = null;
        }
        await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

        // ---------- /panel (VOICE CHAT ONLY) ----------
        if (commandName === "panel") {
          try {
            const voiceChat = await getVoiceFromInteractionChannel(interaction);
            if (!voiceChat) {
              return auditedReply( {
                content: "Bu komut bu kanalda calismaz. **/panel** komutunu sahip oldugun voice kanalinin sohbetinde kullan.",
                ephemeral: true,
              });
            }

            const voice = voiceChat;
            const data = await db.get(VC_KEY(voice.id));
            if (!data || typeof data !== "object") {
              return auditedReply( { content: "Bu kanal yonetilmiyor. Once **/setup** ile kur.", ephemeral: true });
            }

            if (!Array.isArray(data.mods)) data.mods = [];
            if (!Array.isArray(data.allow)) data.allow = [];
            if (!Array.isArray(data.deny)) data.deny = [];
            if (!Array.isArray(data.managedPermIds)) data.managedPermIds = [];
            const actorId = resolveActorId(interaction.member, interaction.user?.id);
            if (!USER_ID_RE.test(String(data.ownerId || "").trim())) {
              data.ownerId = actorId;
            }

            let hasRoomManagePermission = false;
            if (actorId) {
              try {
                hasRoomManagePermission = Boolean(
                  voice.permissionsFor(interaction.member || actorId)?.has?.(PermissionFlagsBits.ManageChannels) ||
                  voice.permissionsFor(actorId)?.has?.(PermissionFlagsBits.ManageChannels)
                );
              } catch (err) {
                globalThis.__airWarnSuppressedError?.(err);
              }
            }

            if (!canEditAllowDeny(interaction.member, data, actorId) && !hasRoomManagePermission) {
              return auditedReply( { content: "Paneli sadece oda sahibi/yetkili veya admin guncelleyebilir.", ephemeral: true });
            }

            // /panel her zaman eski paneli silip yeni panel basar.
            try {
              if (voice?.messages?.fetch && data.panelMessageId) {
                const oldMsg = await (voice.messages.fetch(data.panelMessageId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
                if (oldMsg) {
                  await (oldMsg.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
                }
              }
            } catch (err) {
              globalThis.__airWarnSuppressedError?.(err);
            }
            data.panelMessageId = null;

            // sync + panel bas
            await syncDataFromChannel(interaction.guild, voice, data);
            await db.set(VC_KEY(voice.id), data);
            await upsertPanel(voice, data, db);

            return auditedReply( { content: `Panel yenilendi: **${voice.name}**`, ephemeral: true });
          } catch (panelErr) {
            console.error("[VoiceManager /panel]", panelErr);
            return auditedReply(
              { content: "Panel yenilenemedi. Odanin sohbetinde tekrar dene.", ephemeral: true },
              { ok: false, error: panelErr?.message || "panel_refresh_failed" }
            );
          }
        }

        // ---------- /setup & /voice kapat ----------
        let voice = null;

        if (!optCh) {
          if (commandName === "setup") {
            const voiceChat = await getVoiceFromInteractionChannel(interaction);
            if (!voiceChat) {
              return auditedReply( {
                content:
                  "❌ **/setup** (kanal parametresi olmadan) sadece **voice kanal chat’inde** kullanılabilir.\n" +
                  "Başka yerde kullanacaksan: **/setup kanal:** seç.",
                ephemeral: true,
              });
            }
            voice = voiceChat;
          } else {
            voice = (await getVoiceFromInteractionChannel(interaction)) ?? interaction.member?.voice?.channel ?? null;
          }
        } else {
          voice = optCh;
        }

        if (!voice) return auditedReply( { content: "Hedef voice seç veya bir voice kanala gir.", ephemeral: true });
        if (voice.type !== ChannelType.GuildVoice) return auditedReply( { content: "Lütfen bir **VOICE kanal** seç.", ephemeral: true });

        // /setup guard
        if (commandName === "setup") {
          if (!isServerOwnerOrAdmin(interaction.member)) {
            return auditedReply( { content: "Bu komutu sadece admin/sunucu sahibi kullanabilir.", ephemeral: true });
          }

          const existing = await db.get(VC_KEY(voice.id));
          if (existing) {
            return auditedReply( {
              content: `⚠️ Bu voice zaten yönetiliyor: **${voice.name}**\nPaneli tekrar görmek için: **/panel** (voice chat’te)`,
              ephemeral: true,
            });
          }

          const data = {
            ownerId: interaction.member.id,
            mods: [],
            allow: [],
            deny: [],
            locked: false,
            hidden: false,
            userLimit: voice.userLimit ?? 0,
            persistent: true,
            panelMessageId: null,
            managedPermIds: [],
          };

          await applyVoicePerms(interaction.guild, voice, data);
          await db.set(VC_KEY(voice.id), data);
          await upsertPanel(voice, data, db);

          return auditedReply( { content: `✅ Kalıcı panel kuruldu: **${voice.name}**`, ephemeral: true });
        }

        // /voice kapat full reset
        if (commandName === "voice" && voiceSub === "kapat") {
          if (!isServerOwnerOrAdmin(interaction.member)) {
            return auditedReply( { content: "Bu komutu sadece admin/sunucu sahibi kullanabilir.", ephemeral: true });
          }

          const data = await db.get(VC_KEY(voice.id));
          if (!data) return auditedReply( { content: "Bu kanal yönetilmiyor.", ephemeral: true });

          // panel msg sil
          try {
            if (voice?.messages?.fetch && data.panelMessageId) {
              const msg = await (voice.messages.fetch(data.panelMessageId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
              if (msg) await (msg.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
            }
          } catch (err) {
            globalThis.__airWarnSuppressedError?.(err);
          }

          await (voice.setUserLimit(0) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
          await (voice.permissionOverwrites.set([]) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
          await db.delete(VC_KEY(voice.id));

          return auditedReply( { content: `🧼 Kanal sıfırlandı (isim korunur) ve yönetim kapatıldı: **${voice.name}**`, ephemeral: true });
        }

        if (commandName === "voice") {
          return auditedReply( { content: "Gecersiz alt komut. `/voice kapat` kullan.", ephemeral: true });
        }

        await recordSlashAudit(false, "unsupported_voice_command");
        return;
      }

      // -------- SELECT MENUS --------
      if (interaction.isUserSelectMenu()) {
        if (!interaction.customId?.startsWith("sel_")) return;

        const pack = await getManaged(db, interaction);
        if (pack.error) return auditedReply( { content: pack.error, ephemeral: true });

        const { voice, panelChannel, data } = pack;
        await (interaction.deferUpdate() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

        const base = interaction.customId.split(":")[0];

        if (base === "sel_owner") {
          if (!canManageRoom(interaction.member, data, interaction.user?.id)) return safeFollowUp(interaction, { content: "Sahibi sadece owner veya admin değiştirebilir.", ephemeral: true });
          data.ownerId = interaction.values[0];
          await afterChange(db, interaction.guild, voice, data, panelChannel);
          return safeFollowUp(interaction, { content: "👑 Sahip güncellendi.", ephemeral: true });
        }

        if (base === "sel_mods") {
          if (!canManageRoom(interaction.member, data, interaction.user?.id)) return safeFollowUp(interaction, { content: "Yetkilileri sadece owner veya admin değiştirebilir.", ephemeral: true });
          data.mods = uniq(interaction.values).slice(0, 10);
          await afterChange(db, interaction.guild, voice, data, panelChannel);
          return safeFollowUp(interaction, { content: "🛠️ Yetkililer güncellendi.", ephemeral: true });
        }

        if (base === "sel_allow") {
          if (!canEditAllowDeny(interaction.member, data, interaction.user?.id)) return safeFollowUp(interaction, { content: "Allow listesini sadece owner/yetkili veya admin değiştirebilir.", ephemeral: true });
          data.allow = uniq(interaction.values).slice(0, 25);
          data.deny = (data.deny || []).filter((x) => !data.allow.includes(x));
          await afterChange(db, interaction.guild, voice, data, panelChannel);
          return safeFollowUp(interaction, { content: "✅ Girebilenler güncellendi.", ephemeral: true });
        }

        if (base === "sel_deny") {
          if (!canEditAllowDeny(interaction.member, data, interaction.user?.id)) return safeFollowUp(interaction, { content: "Deny listesini sadece owner/yetkili veya admin değiştirebilir.", ephemeral: true });
          data.deny = uniq(interaction.values).slice(0, 25);
          data.allow = (data.allow || []).filter((x) => !data.deny.includes(x));

          for (const id of data.deny) {
            const m = await (interaction.guild.members.fetch(id) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
            if (m && m.voice.channelId === voice.id) await (m.voice.disconnect() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
          }

          await afterChange(db, interaction.guild, voice, data, panelChannel);
          return safeFollowUp(interaction, { content: "⛔ Giremeyenler güncellendi.", ephemeral: true });
        }

        return;
      }

      // -------- BUTTONS --------
      if (interaction.isButton()) {
        const id = interaction.customId || "";
        if (id.startsWith("t_")) return;
        if (!id.startsWith("btn_")) return;

        const pack = await getManaged(db, interaction);
        if (pack.error) return auditedReply( { content: pack.error, ephemeral: true });

        const { voice, panelChannel, data } = pack;
        const base = id.split(":")[0];

        if (base === "btn_limit") {
          if (!canManageRoom(interaction.member, data, interaction.user?.id)) return auditedReply( { content: "Sadece owner/admin.", ephemeral: true });

          const modal = new ModalBuilder().setCustomId(`m_limit:${voice.id}`).setTitle("Kullanıcı Limiti");
          const input = new TextInputBuilder()
            .setCustomId("limit")
            .setLabel("Limit (0 = sınırsız)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(2);

          modal.addComponents(new ActionRowBuilder().addComponents(input));
          return interaction.showModal(modal);
        }

        if (base === "btn_rename") {
          if (!canManageRoom(interaction.member, data, interaction.user?.id)) return auditedReply( { content: "Sadece owner/admin.", ephemeral: true });

          const modal = new ModalBuilder().setCustomId(`m_rename:${voice.id}`).setTitle("Oda İsmi");
          const input = new TextInputBuilder()
            .setCustomId("name")
            .setLabel("Yeni oda ismi")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50);

          modal.addComponents(new ActionRowBuilder().addComponents(input));
          return interaction.showModal(modal);
        }

        await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        if (!canManageRoom(interaction.member, data, interaction.user?.id)) return auditedReply( { content: "Bu butonları sadece owner/admin kullanabilir.", ephemeral: true });

        if (base === "btn_lock") {
          data.locked = true;
          await afterChange(db, interaction.guild, voice, data, panelChannel);
          return auditedReply( { content: "🔒 Kilitlendi.", ephemeral: true });
        }

        if (base === "btn_unlock") {
          data.locked = false;
          await afterChange(db, interaction.guild, voice, data, panelChannel);
          return auditedReply( { content: "🔓 Açıldı.", ephemeral: true });
        }

        if (base === "btn_lock_toggle") {
          data.locked = !data.locked;
          await afterChange(db, interaction.guild, voice, data, panelChannel);
          return auditedReply( { content: data.locked ? "🔒 Kilitlendi." : "🔓 Açıldı.", ephemeral: true });
        }

        if (base === "btn_visibility") {
          data.hidden = !data.hidden;
          await afterChange(db, interaction.guild, voice, data, panelChannel);
          return auditedReply( {
            content: data.hidden ? "Oda gorunmez yapildi." : "Oda gorunur yapildi.",
            ephemeral: true,
          });
        }

        if (base === "btn_reset") {
          await (voice.setUserLimit(0) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
          await (voice.permissionOverwrites.set([]) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
          resetRoomState(data, interaction.user?.id);
          await afterChange(db, interaction.guild, voice, data, panelChannel);
          return auditedReply( {
            content: "🧹 Oda ayarlari sifirlandi. Kanal ismi korunarak ilk acilis haline donduruldu.",
            ephemeral: true,
          });
        }

        return;
      }

      // -------- MODALS --------
      if (interaction.isModalSubmit()) {
        const id = interaction.customId || "";
        if (!id.startsWith("m_")) return;

        await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

        const pack = await getManaged(db, interaction);
        if (pack.error) return auditedReply( { content: pack.error, ephemeral: true });

        const { voice, panelChannel, data } = pack;
        if (!canManageRoom(interaction.member, data, interaction.user?.id)) return auditedReply( { content: "Sadece owner/admin.", ephemeral: true });

        const base = id.split(":")[0];

        if (base === "m_limit") {
          const limit = parseInt((interaction.fields.getTextInputValue("limit") || "").trim(), 10);
          if (Number.isNaN(limit) || limit < 0 || limit > 99) return auditedReply( { content: "0-99 arası sayı gir.", ephemeral: true });

          data.userLimit = limit;
          await (voice.setUserLimit(limit) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
          await afterChange(db, interaction.guild, voice, data, panelChannel);
          return auditedReply( { content: `👥 Limit: ${limit}`, ephemeral: true });
        }

        if (base === "m_rename") {
          const name = (interaction.fields.getTextInputValue("name") || "").trim();
          if (!name) return auditedReply( { content: "İsim boş olamaz.", ephemeral: true });

          await (voice.setName(name) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
          await db.set(USER_TPL_KEY(interaction.guildId, data.ownerId), { name });
          await afterChange(db, interaction.guild, voice, data, panelChannel);
          return auditedReply( { content: `✏️ İsim: ${name}`, ephemeral: true });
        }

        return;
      }
    } catch (e) {
      await recordSlashAudit(false, e?.message || "voice_manager_error");
      console.error("[VoiceManager interactionCreate fatal]", e);
      if (interaction?.isRepliable?.()) {
        const shortErr = String(e?.message || e || "unknown_error")
          .replace(/[`]/g, "'")
          .slice(0, 180);
        await safeReply(interaction, {
          content: `Hata oldu: \`${shortErr}\``,
          ephemeral: true,
        });
      }
    }
  });
};

// dışa açmak istersen:
module.exports.applyVoicePerms = applyVoicePerms;
module.exports.upsertPanel = upsertPanel;
module.exports.VC_KEY = VC_KEY;
module.exports.TEMP_TEMPLATE_KEY = TEMP_TEMPLATE_KEY;
module.exports.__private = {
  isServerOwnerOrAdmin,
  canManageRoom,
  canEditAllowDeny,
};
