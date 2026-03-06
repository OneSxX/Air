const { EmbedBuilder } = require("discord.js");

const WELCOME_CFG_KEY = (gid) => `welcome_cfg_${gid}`;
const MAX_TOP_MESSAGE_LEN = 1800;
const MAX_TITLE_LEN = 256;
const MAX_DESCRIPTION_LEN = 3500;
const HUMAN_COUNT_CACHE_TTL_MS = Math.max(
  15_000,
  parseInt(process.env.WELCOME_HUMAN_COUNT_CACHE_TTL_MS || "300000", 10) || 300000
);

const DEFAULT_CONFIG = {
  enabled: true,
  channelId: null,
  topMessageTemplate: "Hos geldin [user]",
  embedTitle: "Sunucumuza hos geldin",
  embedDescription: "Umarim keyifli vakit gecirirsin! [satir]Iyi eglenceler.",
  embedColor: 0x000000,
  embedImageUrl: null,
  updatedAt: 0,
  updatedBy: null,
};

const humanCountCache = new Map();

function sanitizeText(input, maxLen) {
  const text = String(input || "").trim();
  if (!text) return "";
  return text.slice(0, maxLen);
}

function normalizeImageUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (/^(sil|kaldir|remove|none)$/i.test(raw)) return null;
  if (!/^https?:\/\/\S+/i.test(raw)) return null;
  return raw.slice(0, 1500);
}

function normalizeEmbedColor(input) {
  if (Number.isFinite(Number(input))) {
    const value = Math.floor(Number(input));
    if (value >= 0x000000 && value <= 0xFFFFFF) return value;
    return null;
  }

  const raw = String(input || "").trim();
  if (!raw) return null;
  if (/^(default|varsayilan|varsayılan|sifirla|sıfırla|black|siyah)$/i.test(raw)) {
    return 0x000000;
  }

  const hexMatch = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i) || raw.match(/^0x([0-9a-f]{6})$/i);
  if (!hexMatch?.[1]) return null;

  let hex = hexMatch[1];
  if (hex.length === 3) {
    hex = hex.split("").map((ch) => ch + ch).join("");
  }

  const parsed = Number.parseInt(hex, 16);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0x000000 || parsed > 0xFFFFFF) return null;
  return parsed;
}

function normalizeConfig(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const topMessageTemplate = sanitizeText(src.topMessageTemplate, MAX_TOP_MESSAGE_LEN) || DEFAULT_CONFIG.topMessageTemplate;
  const embedTitle = sanitizeText(src.embedTitle, MAX_TITLE_LEN) || DEFAULT_CONFIG.embedTitle;
  const embedDescription = sanitizeText(src.embedDescription, MAX_DESCRIPTION_LEN) || DEFAULT_CONFIG.embedDescription;
  const embedColor = normalizeEmbedColor(src.embedColor);
  const channelId = /^\d{15,25}$/.test(String(src.channelId || "").trim()) ? String(src.channelId).trim() : null;

  return {
    enabled: src.enabled !== false,
    channelId,
    topMessageTemplate,
    embedTitle,
    embedDescription,
    embedColor: embedColor == null ? DEFAULT_CONFIG.embedColor : embedColor,
    embedImageUrl: normalizeImageUrl(src.embedImageUrl),
    updatedAt: Number(src.updatedAt || 0) || 0,
    updatedBy: src.updatedBy ? String(src.updatedBy) : null,
  };
}

function applyWelcomeTokens(template, member) {
  const base = String(template || "");
  return base
    .replace(/\[user\]/gi, `<@${member.id}>`)
    .replace(/\[(satir|satır)\]/giu, "\n");
}

function formatClockTimeAmPm(date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(date)
    .toUpperCase();
}

function cleanupHumanCountCache(now = Date.now()) {
  for (const [guildId, item] of humanCountCache.entries()) {
    const at = Number(item?.at || 0);
    if (!at || now - at > HUMAN_COUNT_CACHE_TTL_MS) {
      humanCountCache.delete(guildId);
    }
  }
}

function getCachedHumanCount(guildId, now = Date.now()) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  const cached = humanCountCache.get(gid);
  if (!cached) return null;
  if (now - cached.at > HUMAN_COUNT_CACHE_TTL_MS) {
    humanCountCache.delete(gid);
    return null;
  }
  const count = Number(cached.count);
  if (!Number.isFinite(count) || count <= 0) return null;
  return Math.floor(count);
}

function setCachedHumanCount(guildId, count, now = Date.now()) {
  const gid = String(guildId || "").trim();
  const normalized = Number(count);
  if (!gid || !Number.isFinite(normalized) || normalized <= 0) return;
  cleanupHumanCountCache(now);
  humanCountCache.set(gid, {
    count: Math.floor(normalized),
    at: now,
  });
}

function clearHumanCountCache() {
  humanCountCache.clear();
}

function countCachedBots(guild) {
  const cache = guild?.members?.cache;
  if (!cache?.size) return 0;

  if (typeof cache.filter === "function") {
    return cache.filter((m) => m?.user?.bot).size || 0;
  }

  let total = 0;
  if (typeof cache.values === "function") {
    for (const member of cache.values()) {
      if (member?.user?.bot) total += 1;
    }
  }
  return total;
}

async function resolveHumanMemberCount(guild, opts = {}) {
  if (!guild) return 1;
  const guildId = String(guild.id || "").trim();
  const now = Date.now();
  const forceRefresh = opts.forceRefresh === true;

  if (!forceRefresh && guildId) {
    const cached = getCachedHumanCount(guildId, now);
    if (cached) return cached;
  }

  const fallbackEstimate = Math.max(1, Number(guild.memberCount || 1) - countCachedBots(guild));
  if (!forceRefresh) {
    if (guildId) setCachedHumanCount(guildId, fallbackEstimate, now);
    return fallbackEstimate;
  }

  const fetchedMembers = await (guild.members.fetch() || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (fetchedMembers?.size) {
    const humans = Math.max(1, fetchedMembers.filter((m) => !m.user?.bot).size);
    if (guildId) setCachedHumanCount(guildId, humans, now);
    return humans;
  }

  if (guildId) setCachedHumanCount(guildId, fallbackEstimate, now);
  return fallbackEstimate;
}

function buildWelcomePayload(member, cfg, options = {}) {
  const guildIcon =
    member.guild.iconURL({ forceStatic: false, size: 512 }) ||
    member.guild.iconURL({ forceStatic: true, size: 512 }) ||
    null;
  const userAvatar = member.user.displayAvatarURL({ forceStatic: false, size: 256 });
  const now = new Date();
  const humanCount = Math.max(1, Number(options.humanCount || member.guild.memberCount || 1));

  const topContent = applyWelcomeTokens(cfg.topMessageTemplate, member);
  const embedDescription = applyWelcomeTokens(cfg.embedDescription, member);
  const embedTitle = applyWelcomeTokens(cfg.embedTitle, member);

  const embed = new EmbedBuilder()
    .setColor(Number.isFinite(Number(cfg.embedColor)) ? Number(cfg.embedColor) : DEFAULT_CONFIG.embedColor)
    .setAuthor({
      name: member.user.username,
      iconURL: userAvatar,
    })
    .setTitle(embedTitle)
    .setDescription(embedDescription)
    .setFooter({
      text: `Seninle birlikte ${humanCount} üyeyiz! • bugün saat ${formatClockTimeAmPm(now)}`,
    });

  if (guildIcon) {
    embed.setThumbnail(guildIcon);
  }
  if (cfg.embedImageUrl) {
    embed.setImage(cfg.embedImageUrl);
  }

  return {
    content: topContent,
    embeds: [embed],
    allowedMentions: {
      parse: [],
      users: [member.id],
      roles: [],
      repliedUser: false,
    },
  };
}

async function getConfig(db, guildId) {
  const raw = await (db.get(WELCOME_CFG_KEY(guildId)) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  const cfg = normalizeConfig(raw);

  if (!raw || JSON.stringify(cfg) !== JSON.stringify(raw)) {
    await (db.set(WELCOME_CFG_KEY(guildId), cfg) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  return cfg;
}

async function setConfig(db, guildId, patch = {}) {
  const current = await getConfig(db, guildId);
  const next = normalizeConfig({
    ...current,
    ...(patch || {}),
    updatedAt: Date.now(),
    updatedBy: patch?.updatedBy ? String(patch.updatedBy) : current.updatedBy,
  });
  await (db.set(WELCOME_CFG_KEY(guildId), next) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  return next;
}

async function onGuildMemberAdd(member, client) {
  if (!member?.guild || member.user?.bot || !client?.db) return;

  const cfg = await getConfig(client.db, member.guild.id);
  if (!cfg.enabled || !cfg.channelId) return;

  const channel =
    member.guild.channels.cache.get(cfg.channelId) ||
    await (member.guild.channels.fetch(cfg.channelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!channel?.isTextBased?.() || typeof channel.send !== "function") return;

  const humanCount = await resolveHumanMemberCount(member.guild);
  const payload = buildWelcomePayload(member, cfg, { humanCount });
  await (channel.send(payload) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
}

function init() {}

module.exports = {
  init,
  getConfig,
  setConfig,
  onGuildMemberAdd,
  __private: {
    normalizeConfig,
    normalizeImageUrl,
    normalizeEmbedColor,
    applyWelcomeTokens,
    resolveHumanMemberCount,
    buildWelcomePayload,
    clearHumanCountCache,
    getCachedHumanCount,
    setCachedHumanCount,
  },
};
