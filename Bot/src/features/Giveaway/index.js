const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { createEmbed } = require("../../utils/embed");

const GW_ACTIVE_KEY = (gid) => `giveaway_active_${gid}`;
const GW_HISTORY_KEY = (gid) => `giveaway_history_${gid}`;
const JOIN_BUTTON_ID = "gw:join";
const LEAVE_CONFIRM_PREFIX = "gw:leave:yes";
const LEAVE_CANCEL_PREFIX = "gw:leave:no";
const MAX_HISTORY = 150;
const MAX_WINNERS = 20;
const EMBED_DIVIDER = "────୨ৎ────────୨ৎ────";
const ANNOUNCE_DIVIDER = "───୨ৎ─────୨ৎ─────୨ৎ───";

const timers = new Map();
const locks = new Map();
const storageLocks = new Map();

function logSuppressedError(context, err) {
  if (!err) return;
  console.warn(`[Giveaway] ${context}:`, err?.message || err);
}

function safeInteractionReply(interaction, payload, context) {
  return interaction.reply(payload).catch((err) => {
    logSuppressedError(`interaction.reply ${context}`, err);
  });
}

function safeInteractionUpdate(interaction, payload, context) {
  return interaction.update(payload).catch((err) => {
    logSuppressedError(`interaction.update ${context}`, err);
  });
}

function normalizeSnowflake(value) {
  const id = String(value || "").trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function normalizeParticipants(arr) {
  const input = Array.isArray(arr) ? arr : [];
  const out = [];
  const seen = new Set();
  for (const item of input) {
    const id = normalizeSnowflake(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function normalizeGiveawayRow(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const messageId = normalizeSnowflake(src.messageId);
  const channelId = normalizeSnowflake(src.channelId);
  const guildId = normalizeSnowflake(src.guildId);
  const hostId = normalizeSnowflake(src.hostId);
  const prize = String(src.prize || "").trim().slice(0, 250);
  const winnerCount = Math.max(1, Math.min(MAX_WINNERS, Number(src.winnerCount || 1) || 1));
  const endAt = Number(src.endAt || 0);
  const createdAt = Number(src.createdAt || Date.now());
  const participantIds = normalizeParticipants(src.participantIds);
  const winnerIds = normalizeParticipants(src.winnerIds);
  const endedAt = Number(src.endedAt || 0) || null;

  if (!messageId || !channelId || !guildId || !hostId || !prize) return null;
  if (!Number.isFinite(endAt) || endAt <= 0) return null;

  return {
    messageId,
    channelId,
    guildId,
    hostId,
    prize,
    winnerCount,
    endAt,
    createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : Date.now(),
    participantIds,
    winnerIds,
    endedAt,
  };
}

function normalizeMap(raw) {
  const out = {};
  const entries = raw && typeof raw === "object" ? Object.entries(raw) : [];
  for (const [key, value] of entries) {
    const messageId = normalizeSnowflake(key);
    if (!messageId) continue;
    const row = normalizeGiveawayRow({ ...(value || {}), messageId });
    if (!row) continue;
    out[messageId] = row;
  }
  return out;
}

async function getActive(db, guildId) {
  const raw = await db.get(GW_ACTIVE_KEY(guildId)).catch((err) => {
    logSuppressedError(`getActive get ${guildId}`, err);
    return null;
  });
  const map = normalizeMap(raw);
  if (!raw || JSON.stringify(raw) !== JSON.stringify(map)) {
    await db.set(GW_ACTIVE_KEY(guildId), map).catch((err) => {
      logSuppressedError(`getActive normalize set ${guildId}`, err);
    });
  }
  return map;
}

async function setActive(db, guildId, map) {
  const normalized = normalizeMap(map);
  await db.set(GW_ACTIVE_KEY(guildId), normalized).catch((err) => {
    logSuppressedError(`setActive ${guildId}`, err);
  });
  return normalized;
}

async function getHistory(db, guildId) {
  const raw = await db.get(GW_HISTORY_KEY(guildId)).catch((err) => {
    logSuppressedError(`getHistory get ${guildId}`, err);
    return null;
  });
  const map = normalizeMap(raw);
  if (!raw || JSON.stringify(raw) !== JSON.stringify(map)) {
    await db.set(GW_HISTORY_KEY(guildId), map).catch((err) => {
      logSuppressedError(`getHistory normalize set ${guildId}`, err);
    });
  }
  return map;
}

async function setHistory(db, guildId, map) {
  const normalized = normalizeMap(map);
  const keys = Object.keys(normalized).sort((a, b) => {
    const aa = Number(normalized[a]?.endedAt || normalized[a]?.endAt || 0);
    const bb = Number(normalized[b]?.endedAt || normalized[b]?.endAt || 0);
    return bb - aa;
  });
  const trimmed = {};
  for (const key of keys.slice(0, MAX_HISTORY)) {
    trimmed[key] = normalized[key];
  }
  await db.set(GW_HISTORY_KEY(guildId), trimmed).catch((err) => {
    logSuppressedError(`setHistory ${guildId}`, err);
  });
  return trimmed;
}

function buildJoinRow(disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(JOIN_BUTTON_ID)
        .setLabel("Katil")
        .setStyle(ButtonStyle.Success)
        .setDisabled(Boolean(disabled))
    ),
  ];
}

function formatDateTr(timestampMs) {
  const raw = Number(timestampMs || Date.now());
  const date = new Date(Number.isFinite(raw) ? raw : Date.now());
  if (!Number.isFinite(date.getTime())) return "-";

  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Istanbul",
  }).format(date);
}

function winnerLabel(count) {
  return Number(count || 0) > 1 ? "Kazananlar" : "Kazanan";
}

function buildAnnouncementContent(row, winners, opts = {}) {
  const reroll = Boolean(opts.reroll);
  const title = reroll ? "Giveaway Yeniden Cekildi" : "Giveaway Bitti";
  const label = winnerLabel(Array.isArray(winners) ? winners.length : 0);
  const winnerText = Array.isArray(winners) && winners.length
    ? winners.map((x) => `<@${x}>`).join(", ")
    : "Yok (katilim olmadi).";

  return [
    ANNOUNCE_DIVIDER,
    `**${title}**`,
    `・Odul: ${row.prize}`,
    `・${label}: ${winnerText}`,
  ].join("\n");
}

function buildLeaveConfirmRow(messageId) {
  const id = normalizeSnowflake(messageId);
  if (!id) return [];

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${LEAVE_CONFIRM_PREFIX}:${id}`)
        .setLabel("Evet, cik")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${LEAVE_CANCEL_PREFIX}:${id}`)
        .setLabel("Vazgec")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function parseButtonAction(customId) {
  const id = String(customId || "");
  if (!id) return null;
  if (id === JOIN_BUTTON_ID) return { type: "join", messageId: null };

  if (id.startsWith(`${LEAVE_CONFIRM_PREFIX}:`)) {
    const messageId = normalizeSnowflake(id.slice(`${LEAVE_CONFIRM_PREFIX}:`.length));
    return messageId ? { type: "leave_confirm", messageId } : null;
  }

  if (id.startsWith(`${LEAVE_CANCEL_PREFIX}:`)) {
    const messageId = normalizeSnowflake(id.slice(`${LEAVE_CANCEL_PREFIX}:`.length));
    return messageId ? { type: "leave_cancel", messageId } : null;
  }

  return null;
}

function buildGiveawayEmbed(row, opts = {}) {
  const ended = Boolean(opts.ended);
  const winners = normalizeParticipants(opts.winners || row?.winnerIds || []);
  const participantCount = Array.isArray(row?.participantIds) ? row.participantIds.length : 0;
  const displayDate = ended
    ? formatDateTr(Number(row.endedAt || Date.now()))
    : formatDateTr(Number(row.endAt || Date.now()));
  const statusLine = ended ? "Bitti" : "Devam ediyor";

  const lines = [
    EMBED_DIVIDER,
    `・Odul: **${row.prize}**`,
    `・Çekilişi Kuran: <@${row.hostId}>`,
    `・Kazanan sayisi: **${row.winnerCount}**`,
    `・Katilimci: **${participantCount}**`,
    `・Tarih: **${displayDate}**`,
    `・Durum: **${statusLine}**`,
    EMBED_DIVIDER,
  ];

  if (ended) {
    lines.push(
      winners.length
        ? `${winnerLabel(winners.length)}: ${winners.map((x) => `<@${x}>`).join(", ")}`
        : "Kazanan: Yok (katilim olmadi)."
    );
  }

  return createEmbed()
    .setTitle("Giveaway")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Mesaj ID: ${row.messageId}` });
}

function pickRandomWinners(participantIds, winnerCount) {
  const pool = normalizeParticipants(participantIds);
  const count = Math.max(1, Math.min(MAX_WINNERS, Number(winnerCount || 1) || 1));
  if (!pool.length) return [];

  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }

  return pool.slice(0, Math.min(pool.length, count));
}

function timerKey(guildId, messageId) {
  return `${guildId}:${messageId}`;
}

function clearGiveawayTimer(guildId, messageId) {
  const key = timerKey(guildId, messageId);
  const timer = timers.get(key);
  if (timer) {
    clearTimeout(timer);
    timers.delete(key);
  }
}

function withLock(key, task) {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev
    .catch((err) => {
      logSuppressedError(`withLock previous task ${key}`, err);
    })
    .then(task)
    .finally(() => {
      if (locks.get(key) === next) locks.delete(key);
    });
  locks.set(key, next);
  return next;
}

function withGuildStorageLock(guildId, task) {
  const key = normalizeSnowflake(guildId) || String(guildId || "").trim();
  const prev = storageLocks.get(key) || Promise.resolve();
  const next = prev
    .catch((err) => {
      logSuppressedError(`withGuildStorageLock previous task ${key}`, err);
    })
    .then(task)
    .finally(() => {
      if (storageLocks.get(key) === next) storageLocks.delete(key);
    });
  storageLocks.set(key, next);
  return next;
}

async function resolveGuildChannelMessage(client, row) {
  const guild =
    client.guilds?.cache?.get?.(row.guildId) ||
    await (client.guilds?.fetch?.(row.guildId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!guild) return { guild: null, channel: null, message: null };

  const channel =
    guild.channels?.cache?.get?.(row.channelId) ||
    await (guild.channels?.fetch?.(row.channelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!channel?.isTextBased?.()) return { guild, channel: null, message: null };

  const message = await (channel.messages?.fetch?.(row.messageId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  return { guild, channel, message };
}

async function editGiveawayMessage(client, row, opts = {}) {
  const { message } = await resolveGuildChannelMessage(client, row);
  if (!message) return false;
  await message.edit({
    embeds: [buildGiveawayEmbed(row, opts)],
    components: buildJoinRow(Boolean(opts.ended)),
  }).catch((err) => {
    logSuppressedError(`editGiveawayMessage ${row.guildId}:${row.messageId}`, err);
  });
  return true;
}

async function announceGiveawayResult(client, row, winners, opts = {}) {
  const { channel } = await resolveGuildChannelMessage(client, row);
  if (!channel?.isTextBased?.()) return false;

  const content = buildAnnouncementContent(row, winners, opts);
  await channel.send({ content }).catch((err) => {
    logSuppressedError(`announceGiveawayResult ${row.guildId}:${row.messageId}`, err);
  });
  return true;
}

async function finalizeGiveaway(client, guildId, messageId, opts = {}) {
  const gid = normalizeSnowflake(guildId);
  const mid = normalizeSnowflake(messageId);
  if (!client?.db || !gid || !mid) return null;

  const lockKey = timerKey(gid, mid);
  return withLock(lockKey, async () => {
    const outcome = await withGuildStorageLock(gid, async () => {
      const active = await getActive(client.db, gid);
      const row = active[mid];
      if (!row) {
        clearGiveawayTimer(gid, mid);
        return { type: "missing", row: null, winners: [] };
      }

      const now = Date.now();
      if (!opts?.force && Number(row.endAt || 0) > now + 1000) {
        return { type: "scheduled", row, winners: [] };
      }

      const winners = pickRandomWinners(row.participantIds, opts?.winnerCount || row.winnerCount);
      row.winnerIds = winners;
      row.endedAt = now;

      delete active[mid];
      await setActive(client.db, gid, active);

      const history = await getHistory(client.db, gid);
      history[mid] = row;
      await setHistory(client.db, gid, history);

      clearGiveawayTimer(gid, mid);
      return { type: "finalized", row, winners };
    });

    if (outcome.type === "missing") {
      return null;
    }

    if (outcome.type === "scheduled") {
      scheduleGiveaway(client, outcome.row);
      return outcome.row;
    }

    await editGiveawayMessage(client, outcome.row, { ended: true, winners: outcome.winners });
    await announceGiveawayResult(client, outcome.row, outcome.winners, { reroll: false });
    return outcome.row;
  });
}

function scheduleGiveaway(client, row) {
  const gid = normalizeSnowflake(row?.guildId);
  const mid = normalizeSnowflake(row?.messageId);
  if (!gid || !mid) return;

  clearGiveawayTimer(gid, mid);
  const delay = Number(row.endAt || 0) - Date.now();
  const waitMs = delay > 1000 ? Math.min(delay, 2_147_483_647) : 500;

  const timer = setTimeout(() => {
    finalizeGiveaway(client, gid, mid).catch((err) => {
      console.error("Giveaway finalize error:", err);
    });
  }, waitMs);

  if (typeof timer.unref === "function") timer.unref();
  timers.set(timerKey(gid, mid), timer);
}

async function createGiveaway(client, payload) {
  if (!client?.db) throw new Error("Veritabani bulunamadi.");

  const guildId = normalizeSnowflake(payload?.guildId);
  const channelId = normalizeSnowflake(payload?.channelId);
  const hostId = normalizeSnowflake(payload?.hostId);
  const prize = String(payload?.prize || "").trim().slice(0, 250);
  const durationMs = Math.max(10_000, Number(payload?.durationMs || 0));
  const winnerCount = Math.max(1, Math.min(MAX_WINNERS, Number(payload?.winnerCount || 1) || 1));
  if (!guildId || !channelId || !hostId || !prize) {
    throw new Error("Giveaway verisi gecersiz.");
  }

  const guild =
    client.guilds?.cache?.get?.(guildId) ||
    await (client.guilds?.fetch?.(guildId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!guild) throw new Error("Sunucu bulunamadi.");

  const channel =
    guild.channels?.cache?.get?.(channelId) ||
    await (guild.channels?.fetch?.(channelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!channel?.isTextBased?.() || typeof channel.send !== "function") {
    throw new Error("Mesaj atilabilir kanal bulunamadi.");
  }

  const row = normalizeGiveawayRow({
    messageId: "1".repeat(18),
    guildId,
    channelId,
    hostId,
    prize,
    winnerCount,
    endAt: Date.now() + durationMs,
    createdAt: Date.now(),
    participantIds: [],
    winnerIds: [],
    endedAt: null,
  });

  const sent = await channel.send({
    embeds: [buildGiveawayEmbed(row, { ended: false })],
    components: buildJoinRow(false),
  }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!sent?.id) throw new Error("Giveaway mesaji gonderilemedi.");

  row.messageId = sent.id;
  await sent
    .edit({
      embeds: [buildGiveawayEmbed(row, { ended: false })],
      components: buildJoinRow(false),
    })
    .catch((err) => {
      logSuppressedError(`createGiveaway edit ${guildId}:${sent.id}`, err);
    });

  await withGuildStorageLock(guildId, async () => {
    const active = await getActive(client.db, guildId);
    active[row.messageId] = row;
    await setActive(client.db, guildId, active);
  });
  scheduleGiveaway(client, row);

  return {
    row,
    jumpUrl: sent.url,
    messageId: sent.id,
  };
}

async function joinFromButton(interaction, client) {
  if (!interaction?.isButton?.()) return false;
  const action = parseButtonAction(interaction.customId);
  if (!action) return false;
  if (!interaction.guildId || !client?.db) return true;

  if (interaction.user?.bot) {
    await safeInteractionReply(interaction, { content: "Botlar katilamaz.", ephemeral: true }, "user_bot");
    return true;
  }

  const guildId = normalizeSnowflake(interaction.guildId);
  const messageId =
    action.type === "join"
      ? normalizeSnowflake(interaction.message?.id)
      : normalizeSnowflake(action.messageId);
  if (!guildId || !messageId) return true;

  if (action.type === "leave_cancel") {
    await safeInteractionUpdate(
      interaction,
      {
        content: "Cikma islemi iptal edildi.",
        components: [],
      },
      "leave_cancel"
    );
    return true;
  }

  const lockKey = timerKey(guildId, messageId);
  await withLock(lockKey, async () => {
    const userId = normalizeSnowflake(interaction.user.id);
    if (!userId) return;

    const outcome = await withGuildStorageLock(guildId, async () => {
      const active = await getActive(client.db, guildId);
      const row = active[messageId];
      if (!row) return { type: "inactive", row: null };
      if (Date.now() >= Number(row.endAt || 0)) return { type: "ended", row };

      const has = row.participantIds.includes(userId);
      if (action.type === "join" && has) return { type: "already_joined", row };

      if (action.type === "leave_confirm") {
        if (!has) return { type: "not_participant", row };
        row.participantIds = row.participantIds.filter((x) => x !== userId);
      } else {
        row.participantIds = normalizeParticipants([...row.participantIds, userId]);
      }

      active[messageId] = row;
      await setActive(client.db, guildId, active);
      return {
        type: action.type === "leave_confirm" ? "left" : "joined",
        row,
      };
    });

    if (outcome.type === "inactive") {
      const payload = { content: "Bu giveaway artik aktif degil.", components: [] };
      if (action.type === "join") {
        await safeInteractionReply(interaction, { ...payload, ephemeral: true }, "inactive_join");
      } else {
        await safeInteractionUpdate(interaction, payload, "inactive_update");
      }
      return;
    }

    if (outcome.type === "ended") {
      const payload = { content: "Bu giveaway bitmis. Sonuc aciklanacak.", components: [] };
      if (action.type === "join") {
        await safeInteractionReply(interaction, { ...payload, ephemeral: true }, "ended_join");
      } else {
        await safeInteractionUpdate(interaction, payload, "ended_update");
      }
      finalizeGiveaway(client, guildId, messageId, { force: true }).catch((err) => {
        logSuppressedError(`joinFromButton finalize ${guildId}:${messageId}`, err);
      });
      return;
    }

    if (outcome.type === "already_joined") {
      await safeInteractionReply(
        interaction,
        {
          content: "Giveaway'e zaten katildin. Cikmak istiyor musun?",
          components: buildLeaveConfirmRow(messageId),
          ephemeral: true,
        },
        "already_joined"
      );
      return;
    }

    if (outcome.type === "not_participant") {
      await safeInteractionUpdate(
        interaction,
        {
          content: "Zaten giveaway katilimcisi degilsin.",
          components: [],
        },
        "not_participant"
      );
      return;
    }

    if (outcome.type === "left") {
      await safeInteractionUpdate(
        interaction,
        {
          content: "Giveaway'den ayrildin.",
          components: [],
        },
        "left"
      );
      await editGiveawayMessage(client, outcome.row, { ended: false });
      return;
    }

    if (outcome.type === "joined") {
      await safeInteractionReply(
        interaction,
        {
          content: "Giveaway'e katildin.",
          ephemeral: true,
        },
        "joined"
      );
      await editGiveawayMessage(client, outcome.row, { ended: false });
    }
  });

  return true;
}

async function getActiveRow(db, guildId, messageId) {
  const map = await getActive(db, guildId);
  return map[String(messageId || "")] || null;
}

async function getHistoryRow(db, guildId, messageId) {
  const map = await getHistory(db, guildId);
  return map[String(messageId || "")] || null;
}

async function findLatestActiveInChannel(db, guildId, channelId) {
  const active = await getActive(db, guildId);
  const list = Object.values(active).filter((row) => row.channelId === String(channelId));
  if (!list.length) return null;
  list.sort((a, b) => Number(a.endAt || 0) - Number(b.endAt || 0));
  return list[0];
}

async function endGiveawayNow(client, guildId, messageId) {
  return finalizeGiveaway(client, guildId, messageId, { force: true });
}

async function rerollGiveaway(client, guildId, messageId, winnerCount) {
  const gid = normalizeSnowflake(guildId);
  const mid = normalizeSnowflake(messageId);
  if (!client?.db || !gid || !mid) throw new Error("Gecersiz giveaway.");

  const outcome = await withGuildStorageLock(gid, async () => {
    const history = await getHistory(client.db, gid);
    const row = history[mid];
    if (!row) throw new Error("Bu mesaj id icin bitmis giveaway kaydi yok.");

    const winners = pickRandomWinners(row.participantIds, winnerCount || row.winnerCount);
    row.winnerIds = winners;
    row.endedAt = Number(row.endedAt || Date.now());
    history[mid] = row;
    await setHistory(client.db, gid, history);
    return { row, winners };
  });

  await editGiveawayMessage(client, outcome.row, { ended: true, winners: outcome.winners });
  await announceGiveawayResult(client, outcome.row, outcome.winners, { reroll: true });
  return outcome.row;
}

async function onReady(client) {
  if (!client?.db) return;
  const guilds = [...(client.guilds?.cache?.values?.() || [])];
  for (const guild of guilds) {
    const active = await getActive(client.db, guild.id).catch((err) => {
      logSuppressedError(`onReady getActive ${guild.id}`, err);
      return {};
    });
    for (const row of Object.values(active)) {
      if (!row?.messageId) continue;
      if (Date.now() >= Number(row.endAt || 0)) {
        finalizeGiveaway(client, guild.id, row.messageId, { force: true }).catch((err) => {
          logSuppressedError(`onReady finalize ${guild.id}:${row.messageId}`, err);
        });
        continue;
      }
      scheduleGiveaway(client, row);
    }
  }
}

function init() {}

module.exports = {
  init,
  onReady,
  createGiveaway,
  getActiveRow,
  getHistoryRow,
  findLatestActiveInChannel,
  endGiveawayNow,
  rerollGiveaway,
  joinFromButton,
  __private: {
    normalizeGiveawayRow,
    normalizeParticipants,
    pickRandomWinners,
    parseButtonAction,
    winnerLabel,
    formatDateTr,
    buildAnnouncementContent,
    withLock,
    withGuildStorageLock,
  },
};
