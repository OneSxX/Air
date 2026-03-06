const { PermissionFlagsBits, AuditLogEvent, ChannelType } = require("discord.js");
const { renderPanels, renderCombinedPanel } = require("./panel");
const { handleLimitUI } = require("./uiLimits");
const { getConfig, setConfig } = require("./database");
const { syncLinkAutoModRule } = require("./autoModLinks");
const { syncInviteAutoModRule } = require("./autoModInvite");
const { syncProfanityAutoModRule } = require("./autoModProfanity");
const { syncMentionsAutoModRule } = require("./autoModMentions");
const { sendLog, isWhitelisted, getGuildMember } = require("./utils/audit");

const { isCapsLockViolation } = require("./guards/capsLock");
const { extractLinks, normalizeAllowedLinks, hasDisallowedLinks } = require("./guards/linkEngel");
const { extractInviteLinks } = require("./guards/inviteEngel");
const { normalizeProfanityLevel, hasProfanity } = require("./guards/kufurEngel");
const { countEmojis } = require("./guards/emojiLimit");
const { countMentions } = require("./guards/etiketLimit");
const { countEveryoneHere } = require("./guards/everyoneLimit");
const { createFloodTracker } = require("./guards/flood");

const { createRateLimiter } = require("./limits/rateLimiter");
const { onGuildBanAdd } = require("./limits/banLimit");
const { onChannelCreate } = require("./limits/channelCreate");
const { onChannelDelete } = require("./limits/channelDelete");
const { onRoleCreate } = require("./limits/roleCreate");
const { onRoleDelete } = require("./limits/roleDelete");
const { onGuildMemberRemove } = require("./limits/kickLimit");

const { onGuildMemberAdd } = require("./server/botAdd");
const { onGuildMemberUpdate } = require("./server/roleGive");
// Role izin verme korumasi panelden kaldirildi.
const { onGuildUpdate } = require("./server/vanity");

const limiter = createRateLimiter();
const floodTrackers = new Map();
const spamTrackers = new Map();
const linkTrackers = new Map();
const emojiTrackers = new Map();
const mentionTrackers = new Map();
const everyoneTrackers = new Map();
const joinTrackers = new Map();
const raidLockState = new Map();
const raidShieldState = new Map();
const panicStateTimers = new Map();
const cfgCache = new Map();
const violationLogCooldown = new Map();
const purgeCooldown = new Map();
const timeoutCooldown = new Map();
const recentUserMessages = new Map();
const recentLinkMessages = new Map();
const recentEmojiMessages = new Map();
const recentMentionMessages = new Map();
const recentEveryoneMessages = new Map();
const spamBlockUntil = new Map();
const deleteQueues = new Map();
const CFG_CACHE_TTL_MS = Math.max(
  500,
  Math.min(30_000, parseInt(process.env.PROTECTION_CFG_CACHE_TTL_MS || "5000", 10) || 5000)
);
const VIOLATION_LOG_COOLDOWN_MS = 4000;
const PURGE_COOLDOWN_MS = 1200;
const PURGE_FETCH_LIMIT = 50;
const PURGE_MAX_DELETE = 35;
const TIMEOUT_COOLDOWN_MS = 3000;
const DELETE_QUEUE_MAX_IDS = 250;
const BLOCK_MIN_MS = 6000;
const MUTE_ROLE_SYNC_COOLDOWN_MS = 3 * 60 * 1000;
const MUTE_REAPER_INTERVAL_MS = 30_000;
const RECENT_MSG_KEEP_MS = 5 * 60 * 1000;
const RECENT_MSG_MAX = 150;
const RECENT_LINK_KEEP_MS = 3 * 60 * 1000;
const RECENT_LINK_MAX = 200;
const RECENT_EMOJI_KEEP_MS = 3 * 60 * 1000;
const RECENT_EMOJI_MAX = 200;
const RECENT_MENTION_KEEP_MS = 3 * 60 * 1000;
const RECENT_MENTION_MAX = 200;
const RECENT_EVERYONE_KEEP_MS = 3 * 60 * 1000;
const RECENT_EVERYONE_MAX = 200;
const STATE_GC_INTERVAL_MS = 60_000;
const TRACKER_IDLE_TTL_MS = 30 * 60 * 1000;
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
const LINKS_FIXED_WINDOW_SECONDS = 10;
const RAID_SHIELD_MIN_MS = 60_000;
const RAID_SHIELD_MAX_MS = 24 * 60 * 60 * 1000;
const RAID_SHIELD_DEFAULT_MS = 5 * 60_000;
const RAID_YOUNG_ACCOUNT_DEFAULT_MS = 72 * 60 * 60 * 1000;
const PANIC_DEFAULT_MS = 15 * 60_000;
const PANIC_MAX_MS = 24 * 60 * 60 * 1000;
const PRISON_CATEGORY_KEY = (gid) => `mute_prison_category_${gid}`;
const PRISON_CHANNEL_KEY = (gid) => `mute_prison_channel_${gid}`;
const MUTE_ASSIGNMENTS_KEY = (gid) => `prot_mute_assignments_${gid}`;
const PANIC_STATE_KEY = (gid) => `prot_panic_state_${gid}`;
const PRISON_CATEGORY_DEFAULT_NAME = "hapis";
const PRISON_CHANNEL_DEFAULT_NAME = "hapis-odasi";
const mutedRoleSyncCooldown = new Map();
let muteReaperTimer = null;
let muteReaperRunning = false;
let lastTransientStateGcAt = 0;

const DEFAULTS = {
  caps: { minLetters: 10, ratio: 0.7 },
  links: { maxMessages: 5, perSeconds: LINKS_FIXED_WINDOW_SECONDS },
  profanity: { level: "orta" },
  emoji: { maxCount: 6, perSeconds: 5 },
  mentions: { maxCount: 5, perSeconds: 5 },
  everyone: { maxCount: 0, perSeconds: 5 },
  flood: { windowMs: 7000, maxMessages: 5 },
};
const PANIC_TOGGLE_KEYS = [
  "caps",
  "links",
  "invite",
  "profanity",
  "mentions",
  "flood",
  "spam",
  "emoji",
  "everyone",
  "bot",
  "rolegive",
  "vanity",
  "antiRaid",
  "chDel",
  "chCreate",
  "roleDel",
  "roleCreate",
  "ban",
  "kick",
  "webhook",
  "snapshot",
];

function getCapsConfig(cfg) {
  const src = cfg?.caps || {};
  const minRaw = Number(src.minLetters);
  const ratioRaw = Number(src.ratio);

  return {
    minLetters: Number.isFinite(minRaw) && minRaw >= 1 ? minRaw : DEFAULTS.caps.minLetters,
    ratio: Number.isFinite(ratioRaw) && ratioRaw >= 0.1 && ratioRaw <= 1 ? ratioRaw : DEFAULTS.caps.ratio,
  };
}

function getLinksConfig(cfg) {
  const src = cfg?.links || {};
  const maxRaw = Number(src.maxMessages);
  const allowedLinks = normalizeAllowedLinks(src.allowedLinks || src.allowList || src.allowed || []);

  const maxMessages = Number.isFinite(maxRaw)
    ? Math.max(1, Math.min(50, Math.round(maxRaw)))
    : DEFAULTS.links.maxMessages;

  const perSeconds = LINKS_FIXED_WINDOW_SECONDS;

  return { maxMessages, perSeconds, allowedLinks };
}

function getProfanityConfig(cfg) {
  const src = cfg?.profanity || {};
  const level = normalizeProfanityLevel(src.level, DEFAULTS.profanity.level);
  return { level };
}

function getEmojiConfig(cfg) {
  const src = cfg?.emoji || {};
  const maxRaw = Number(src.maxCount);
  const perRaw = Number(src.perSeconds);

  const maxCount = Number.isFinite(maxRaw)
    ? Math.max(2, Math.min(100, Math.round(maxRaw)))
    : DEFAULTS.emoji.maxCount;

  const perSeconds = Number.isFinite(perRaw)
    ? Math.max(2, Math.min(120, Math.round(perRaw)))
    : DEFAULTS.emoji.perSeconds;

  return { maxCount, perSeconds };
}

function getMentionsConfig(cfg) {
  const src = cfg?.mentions || {};
  const maxRaw = Number(src.maxCount);
  const perRaw = Number(src.perSeconds);

  const maxCount = Number.isFinite(maxRaw)
    ? Math.max(1, Math.min(100, Math.round(maxRaw)))
    : DEFAULTS.mentions.maxCount;

  const perSeconds = Number.isFinite(perRaw)
    ? Math.max(2, Math.min(120, Math.round(perRaw)))
    : DEFAULTS.mentions.perSeconds;

  return { maxCount, perSeconds };
}

function getEveryoneConfig(cfg) {
  const src = cfg?.everyone || {};
  const maxRaw = Number(src.maxCount);
  const perRaw = Number(src.perSeconds);

  const maxCount = Number.isFinite(maxRaw)
    ? Math.max(0, Math.min(20, Math.round(maxRaw)))
    : DEFAULTS.everyone.maxCount;

  const perSeconds = Number.isFinite(perRaw)
    ? Math.max(2, Math.min(120, Math.round(perRaw)))
    : DEFAULTS.everyone.perSeconds;

  return { maxCount, perSeconds };
}

function isDenseSpamContent(content, maxMessages) {
  if (!content) return false;

  const lines = String(content)
    .split(/\r?\n+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

  const minLines = Math.max(12, Number(maxMessages || 5) * 2);
  if (lines.length < minLines) return false;

  const unique = new Set(lines).size;
  const avgLen = lines.reduce((sum, line) => sum + line.length, 0) / lines.length;

  // Ornek: "a", "aa" gibi satir tekrar spamini yakala.
  return unique <= 2 && avgLen <= 4;
}

function getCollectionSize(value) {
  if (!value) return 0;
  if (typeof value.size === "number") return value.size;
  if (Array.isArray(value)) return value.length;

  if (typeof value.values === "function") {
    let n = 0;
    for (const _item of value.values()) n += 1;
    return n;
  }

  return 0;
}

function getSpamMessageUnitCount(message) {
  const attachmentCount = getCollectionSize(message?.attachments);
  const stickerCount = getCollectionSize(message?.stickers);
  const mediaCount = attachmentCount + stickerCount;

  if (mediaCount > 0) return mediaCount;
  return 1;
}

function getRecentKey(guildId, channelId, userId) {
  return `${guildId}:${channelId}:${userId}`;
}

function getUserChannelKey(guildId, channelId, userId) {
  return `${guildId}:${channelId}:${userId}`;
}

function isUserTemporarilyBlocked(guildId, channelId, userId) {
  const key = getUserChannelKey(guildId, channelId, userId);
  const until = Number(spamBlockUntil.get(key) || 0);
  if (!until) return false;
  if (until <= Date.now()) {
    spamBlockUntil.delete(key);
    return false;
  }
  return true;
}

function blockUserTemporarily(guildId, channelId, userId, windowMs) {
  const key = getUserChannelKey(guildId, channelId, userId);
  const now = Date.now();
  const durationMs = Math.max(Number(windowMs) || 0, BLOCK_MIN_MS) + 1000;
  const nextUntil = now + durationMs;
  const prevUntil = Number(spamBlockUntil.get(key) || 0);
  spamBlockUntil.set(key, Math.max(prevUntil, nextUntil));
}

async function flushDeleteQueue(key) {
  const q = deleteQueues.get(key);
  if (!q || q.flushing) return;
  q.flushing = true;

  try {
    while (true) {
      const current = deleteQueues.get(key);
      if (!current) break;

      const channel = current.channel;
      const ids = [...current.ids];
      current.ids.clear();

      if (!ids.length || !channel) break;

      const uniqueIds = [...new Set(ids)].filter(Boolean);
      if (!uniqueIds.length) break;

      if (uniqueIds.length > 1 && channel.bulkDelete) {
        for (let i = 0; i < uniqueIds.length; i += 100) {
          const chunk = uniqueIds.slice(i, i + 100);
          await channel.bulkDelete(chunk, true).catch(async () => {
            await Promise.allSettled(chunk.map((id) => (channel.messages?.delete?.(id) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); })));
          });
        }
      } else {
        await (channel.messages?.delete?.(uniqueIds[0]) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (current.ids.size === 0) break;
    }
  } finally {
    const cur = deleteQueues.get(key);
    if (!cur) return;

    cur.flushing = false;
    if (cur.ids.size === 0) {
      deleteQueues.delete(key);
    } else {
      flushDeleteQueue(key).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  }
}

function queueDeleteIds(channel, key, ids) {
  if (!channel || !Array.isArray(ids) || !ids.length) return;

  const q = deleteQueues.get(key) || { channel, ids: new Set(), flushing: false };
  q.channel = channel;
  for (const id of ids) {
    if (!id) continue;
    q.ids.add(id);
  }

  while (q.ids.size > DELETE_QUEUE_MAX_IDS) {
    const first = q.ids.values().next().value;
    if (!first) break;
    q.ids.delete(first);
  }

  deleteQueues.set(key, q);
  flushDeleteQueue(key).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
}

function rememberRecentUserMessage(message) {
  const key = getRecentKey(message.guild.id, message.channelId, message.author.id);
  const now = Date.now();
  const arr = recentUserMessages.get(key) || [];

  arr.push({
    id: message.id,
    at: message.createdTimestamp || now,
  });

  while (arr.length > RECENT_MSG_MAX) arr.shift();
  while (arr.length && now - arr[0].at > RECENT_MSG_KEEP_MS) arr.shift();

  recentUserMessages.set(key, arr);
}

function getTrackedMessageIds(guildId, channelId, userId, windowMs) {
  const key = getRecentKey(guildId, channelId, userId);
  const now = Date.now();
  const arr = recentUserMessages.get(key) || [];

  if (!arr.length) return [];

  while (arr.length && now - arr[0].at > RECENT_MSG_KEEP_MS) arr.shift();
  if (!arr.length) {
    recentUserMessages.delete(key);
    return [];
  }

  recentUserMessages.set(key, arr);

  const safeWindowMs = Math.max(Number(windowMs) || 0, 2000);
  const ids = [];
  for (const item of arr) {
    if (!item?.id || !item?.at) continue;
    if (now - item.at <= safeWindowMs) ids.push(item.id);
  }

  return [...new Set(ids)];
}

function clearTrackedMessages(guildId, channelId, userId) {
  recentUserMessages.delete(getRecentKey(guildId, channelId, userId));
}

function clearTrackedLinkMessages(guildId, channelId, userId) {
  recentLinkMessages.delete(getRecentKey(guildId, channelId, userId));
}

function rememberRecentLinkMessage(message) {
  const key = getRecentKey(message.guild.id, message.channelId, message.author.id);
  const now = Date.now();
  const arr = recentLinkMessages.get(key) || [];

  arr.push({
    id: message.id,
    at: message.createdTimestamp || now,
  });

  while (arr.length > RECENT_LINK_MAX) arr.shift();
  while (arr.length && now - arr[0].at > RECENT_LINK_KEEP_MS) arr.shift();

  recentLinkMessages.set(key, arr);
}

function getTrackedLinkMessageIds(guildId, channelId, userId, windowMs) {
  const key = getRecentKey(guildId, channelId, userId);
  const now = Date.now();
  const arr = recentLinkMessages.get(key) || [];

  if (!arr.length) return [];

  while (arr.length && now - arr[0].at > RECENT_LINK_KEEP_MS) arr.shift();
  if (!arr.length) {
    recentLinkMessages.delete(key);
    return [];
  }

  recentLinkMessages.set(key, arr);

  const safeWindowMs = Math.max(Number(windowMs) || 0, 3000);
  const ids = [];
  for (const item of arr) {
    if (!item?.id || !item?.at) continue;
    if (now - item.at <= safeWindowMs) ids.push(item.id);
  }

  return [...new Set(ids)];
}

function rememberRecentEmojiMessage(message) {
  const key = getRecentKey(message.guild.id, message.channelId, message.author.id);
  const now = Date.now();
  const arr = recentEmojiMessages.get(key) || [];

  arr.push({
    id: message.id,
    at: message.createdTimestamp || now,
  });

  while (arr.length > RECENT_EMOJI_MAX) arr.shift();
  while (arr.length && now - arr[0].at > RECENT_EMOJI_KEEP_MS) arr.shift();

  recentEmojiMessages.set(key, arr);
}

function getTrackedEmojiMessageIds(guildId, channelId, userId, windowMs) {
  const key = getRecentKey(guildId, channelId, userId);
  const now = Date.now();
  const arr = recentEmojiMessages.get(key) || [];

  if (!arr.length) return [];

  while (arr.length && now - arr[0].at > RECENT_EMOJI_KEEP_MS) arr.shift();
  if (!arr.length) {
    recentEmojiMessages.delete(key);
    return [];
  }

  recentEmojiMessages.set(key, arr);

  const safeWindowMs = Math.max(Number(windowMs) || 0, 3000);
  const ids = [];
  for (const item of arr) {
    if (!item?.id || !item?.at) continue;
    if (now - item.at <= safeWindowMs) ids.push(item.id);
  }

  return [...new Set(ids)];
}

function clearTrackedEmojiMessages(guildId, channelId, userId) {
  recentEmojiMessages.delete(getRecentKey(guildId, channelId, userId));
}

function rememberRecentMentionMessage(message) {
  const key = getRecentKey(message.guild.id, message.channelId, message.author.id);
  const now = Date.now();
  const arr = recentMentionMessages.get(key) || [];

  arr.push({
    id: message.id,
    at: message.createdTimestamp || now,
  });

  while (arr.length > RECENT_MENTION_MAX) arr.shift();
  while (arr.length && now - arr[0].at > RECENT_MENTION_KEEP_MS) arr.shift();

  recentMentionMessages.set(key, arr);
}

function getTrackedMentionMessageIds(guildId, channelId, userId, windowMs) {
  const key = getRecentKey(guildId, channelId, userId);
  const now = Date.now();
  const arr = recentMentionMessages.get(key) || [];

  if (!arr.length) return [];

  while (arr.length && now - arr[0].at > RECENT_MENTION_KEEP_MS) arr.shift();
  if (!arr.length) {
    recentMentionMessages.delete(key);
    return [];
  }

  recentMentionMessages.set(key, arr);

  const safeWindowMs = Math.max(Number(windowMs) || 0, 3000);
  const ids = [];
  for (const item of arr) {
    if (!item?.id || !item?.at) continue;
    if (now - item.at <= safeWindowMs) ids.push(item.id);
  }

  return [...new Set(ids)];
}

function clearTrackedMentionMessages(guildId, channelId, userId) {
  recentMentionMessages.delete(getRecentKey(guildId, channelId, userId));
}

function rememberRecentEveryoneMessage(message) {
  const key = getRecentKey(message.guild.id, message.channelId, message.author.id);
  const now = Date.now();
  const arr = recentEveryoneMessages.get(key) || [];

  arr.push({
    id: message.id,
    at: message.createdTimestamp || now,
  });

  while (arr.length > RECENT_EVERYONE_MAX) arr.shift();
  while (arr.length && now - arr[0].at > RECENT_EVERYONE_KEEP_MS) arr.shift();

  recentEveryoneMessages.set(key, arr);
}

function getTrackedEveryoneMessageIds(guildId, channelId, userId, windowMs) {
  const key = getRecentKey(guildId, channelId, userId);
  const now = Date.now();
  const arr = recentEveryoneMessages.get(key) || [];

  if (!arr.length) return [];

  while (arr.length && now - arr[0].at > RECENT_EVERYONE_KEEP_MS) arr.shift();
  if (!arr.length) {
    recentEveryoneMessages.delete(key);
    return [];
  }

  recentEveryoneMessages.set(key, arr);

  const safeWindowMs = Math.max(Number(windowMs) || 0, 3000);
  const ids = [];
  for (const item of arr) {
    if (!item?.id || !item?.at) continue;
    if (now - item.at <= safeWindowMs) ids.push(item.id);
  }

  return [...new Set(ids)];
}

function clearTrackedEveryoneMessages(guildId, channelId, userId) {
  recentEveryoneMessages.delete(getRecentKey(guildId, channelId, userId));
}

function pushJoin(guildId, windowMs, maxJoins) {
  const now = Date.now();
  const arr = joinTrackers.get(guildId) || [];
  const filtered = arr.filter((t) => now - t <= windowMs);
  filtered.push(now);
  joinTrackers.set(guildId, filtered);
  return {
    count: filtered.length,
    maxJoins,
    windowMs,
    violation: filtered.length > maxJoins,
  };
}

function normalizeRaidAction(value) {
  const x = String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "+");

  if (x === "ban") return { punish: "ban", lock: false };
  if (x === "kilitle" || x === "lock" || x === "lockdown") return { punish: "none", lock: true };
  if (x === "kick+kilitle" || x === "kick+lock") return { punish: "kick", lock: true };
  if (x === "ban+kilitle" || x === "ban+lock") return { punish: "ban", lock: true };
  return { punish: "kick", lock: false };
}

function toSafeDurationMs(value, { min = 0, max = PANIC_MAX_MS, fallback = 0 } = {}) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(raw)));
}

function getActiveRaidShield(guildId, now = Date.now()) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  const state = raidShieldState.get(gid);
  if (!state) return null;

  const until = Number(state.until || 0);
  if (!Number.isFinite(until) || until <= now) {
    raidShieldState.delete(gid);
    return null;
  }

  return state;
}

function activateRaidShield(guildId, durationMs, meta = {}) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  const now = Date.now();
  const safeDuration = toSafeDurationMs(durationMs, {
    min: RAID_SHIELD_MIN_MS,
    max: RAID_SHIELD_MAX_MS,
    fallback: RAID_SHIELD_DEFAULT_MS,
  });
  const next = {
    until: now + safeDuration,
    byUserId: String(meta.byUserId || "").trim() || null,
    reason: String(meta.reason || "").trim().slice(0, 120),
    triggeredAt: now,
  };
  raidShieldState.set(gid, next);
  return next;
}

function clearRaidShield(guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return;
  raidShieldState.delete(gid);
}

function resolveRaidShieldDurationMs(raidCfg) {
  const explicit = toSafeDurationMs(raidCfg?.shieldMs, {
    min: RAID_SHIELD_MIN_MS,
    max: RAID_SHIELD_MAX_MS,
    fallback: NaN,
  });
  if (Number.isFinite(explicit)) return explicit;

  const lockMs = toSafeDurationMs(raidCfg?.lockdownMs, {
    min: RAID_SHIELD_MIN_MS,
    max: RAID_SHIELD_MAX_MS,
    fallback: RAID_SHIELD_DEFAULT_MS,
  });
  return lockMs;
}

function resolveRaidYoungAccountMaxAgeMs(raidCfg) {
  const directMs = toSafeDurationMs(raidCfg?.youngAccountMaxAgeMs, {
    min: 60 * 60 * 1000,
    max: 90 * 24 * 60 * 60 * 1000,
    fallback: NaN,
  });
  if (Number.isFinite(directMs)) return directMs;

  const hoursRaw = Number(raidCfg?.youngAccountHours);
  if (Number.isFinite(hoursRaw) && hoursRaw > 0) {
    return toSafeDurationMs(hoursRaw * 60 * 60 * 1000, {
      min: 60 * 60 * 1000,
      max: 90 * 24 * 60 * 60 * 1000,
      fallback: RAID_YOUNG_ACCOUNT_DEFAULT_MS,
    });
  }

  return RAID_YOUNG_ACCOUNT_DEFAULT_MS;
}

function isYoungRaidAccount(user, maxAgeMs, now = Date.now()) {
  const createdAt = Number(user?.createdTimestamp || 0);
  if (!Number.isFinite(createdAt) || createdAt <= 0) return false;
  if (createdAt > now) return true;
  return now - createdAt <= Math.max(0, Number(maxAgeMs || 0));
}

function resolveRaidJoinAction(member, raidCfg, opts = {}) {
  const base = normalizeRaidAction(raidCfg?.action);
  const inShield = !!opts?.inShield;
  const shieldEscalate = String(raidCfg?.shieldPunish || "").trim().toLowerCase();

  if (inShield) {
    if (shieldEscalate === "ban") {
      return { ...base, punish: "ban", source: "shield" };
    }
    if (shieldEscalate === "kick") {
      return { ...base, punish: "kick", source: "shield" };
    }
  }

  const youngAction = String(raidCfg?.youngAccountAction || "ban")
    .trim()
    .toLowerCase();
  const youngAgeMs = resolveRaidYoungAccountMaxAgeMs(raidCfg);
  if (isYoungRaidAccount(member?.user, youngAgeMs)) {
    if (youngAction === "kick") return { ...base, punish: "kick", source: "young_account" };
    if (youngAction === "none") return { ...base, punish: "none", source: "young_account" };
    return { ...base, punish: "ban", source: "young_account" };
  }

  return { ...base, source: "default" };
}

async function applyRaidPunish(member, action, reasonText = "Protection: Raid Koruma") {
  if (!member || !action) return false;

  if (action.punish === "ban") {
    await (member.ban({ reason: reasonText }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    return true;
  }
  if (action.punish === "kick") {
    await (member.kick(reasonText) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    return true;
  }

  return false;
}

function normalizeOverwrites(channel) {
  const list = channel.permissionOverwrites?.cache?.map((o) => ({
    id: o.id,
    type: o.type,
    allow: String(o.allow?.bitfield || "0"),
    deny: String(o.deny?.bitfield || "0"),
  })) || [];
  return list.sort((a, b) => (a.id + a.type).localeCompare(b.id + b.type));
}

function supportsRaidLock(channel) {
  if (!channel?.isTextBased?.()) return false;
  if (channel?.isThread?.()) return false;
  if (!channel?.permissionOverwrites?.edit) return false;
  return true;
}

async function unlockRaidLock(guild, cfg) {
  const gid = guild?.id;
  if (!gid) return false;

  const state = raidLockState.get(gid);
  if (!state) return false;

  if (state.timer) clearTimeout(state.timer);

  for (const item of state.channels) {
    const ch = guild.channels.cache.get(item.channelId) || await (guild.channels.fetch(item.channelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (!supportsRaidLock(ch)) continue;

    const sendValue = item.before === 1 ? true : item.before === -1 ? false : null;
    await ch.permissionOverwrites
      .edit(guild.roles.everyone, { SendMessages: sendValue }, "Protection: Raid kilidi kaldir")
      .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  raidLockState.delete(gid);
  await sendLog(cfg, guild, "Raid kilidi kaldirildi.");
  return true;
}

function armRaidLockTimer(guild, cfg, state, durationMs) {
  if (!state) return;
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;

  if (!(durationMs > 0)) return;
  state.timer = setTimeout(() => {
    unlockRaidLock(guild, cfg).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }, durationMs);
}

async function lockRaidChannels(guild, cfg, durationMs, opts = {}) {
  const gid = guild?.id;
  if (!gid) return false;
  const safeDuration = toSafeDurationMs(durationMs, {
    min: 0,
    max: RAID_SHIELD_MAX_MS,
    fallback: 0,
  });

  const existing = raidLockState.get(gid);
  if (existing) {
    armRaidLockTimer(guild, cfg, existing, safeDuration);
    if (opts?.logOnExtend) {
      await sendLog(
        cfg,
        guild,
        `Raid kilidi suresi guncellendi.${safeDuration > 0 ? ` Sure: ${Math.round(safeDuration / 1000)}s` : " Sure: kalici"}`
      ).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
    return true;
  }

  const state = { channels: [], timer: null };
  const everyone = guild.roles.everyone;

  for (const ch of guild.channels.cache.values()) {
    if (!supportsRaidLock(ch)) continue;

    const ow = ch.permissionOverwrites.cache.get(everyone.id);
    const before = ow?.allow?.has?.(PermissionFlagsBits.SendMessages)
      ? 1
      : ow?.deny?.has?.(PermissionFlagsBits.SendMessages)
        ? -1
        : 0;

    await ch.permissionOverwrites
      .edit(everyone, { SendMessages: false }, "Protection: Raid kilidi")
      .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

    state.channels.push({ channelId: ch.id, before });
  }

  raidLockState.set(gid, state);
  await sendLog(
    cfg,
    guild,
    `Raid kilidi aktif edildi.${safeDuration > 0 ? ` Sure: ${Math.round(safeDuration / 1000)}s` : " Sure: kalici"}`
  );

  armRaidLockTimer(guild, cfg, state, safeDuration);

  return true;
}

function clearPanicTimer(guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return;
  const timer = panicStateTimers.get(gid);
  if (timer) {
    clearTimeout(timer);
    panicStateTimers.delete(gid);
  }
}

async function readPanicState(db, guildId) {
  const gid = String(guildId || "").trim();
  if (!db || !gid) return null;
  const raw = await (db.get(PANIC_STATE_KEY(gid)) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!raw || typeof raw !== "object") return null;

  const since = Number(raw.since || 0);
  const until = Number(raw.until || 0);
  if (!Number.isFinite(since) || !Number.isFinite(until) || until <= since) {
    return null;
  }

  return {
    enabled: true,
    since: Math.floor(since),
    until: Math.floor(until),
    byUserId: String(raw.byUserId || "").trim() || null,
    reason: String(raw.reason || "").trim().slice(0, 200) || null,
    restore: raw.restore && typeof raw.restore === "object" ? raw.restore : null,
  };
}

async function writePanicState(db, guildId, state) {
  const gid = String(guildId || "").trim();
  if (!db || !gid) return;
  await (db.set(PANIC_STATE_KEY(gid), state || null) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
}

async function getPanicModeState(guild, client) {
  const gid = guild?.id;
  if (!gid || !client?.db) return { enabled: false };

  const state = await readPanicState(client.db, gid);
  if (!state) return { enabled: false };

  if (state.until <= Date.now()) {
    clearPanicTimer(gid);
    await writePanicState(client.db, gid, null);
    return { enabled: false, expired: true };
  }

  return state;
}

function schedulePanicAutoDisable(guild, client, until) {
  const gid = guild?.id;
  if (!gid) return;

  clearPanicTimer(gid);
  const delay = Math.max(1_000, Number(until || 0) - Date.now());
  const timer = setTimeout(() => {
    deactivatePanicMode(guild, client, {
      auto: true,
      reason: "Panic mode suresi doldu",
    }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }, delay);
  panicStateTimers.set(gid, timer);
}

function buildPanicRestoreSnapshot(cfg) {
  const toggles = {};
  for (const key of PANIC_TOGGLE_KEYS) {
    toggles[key] = !!cfg?.toggles?.[key];
  }

  return {
    toggles,
    raid: {
      action: String(cfg?.raid?.action || "kick"),
      lockdownMs: toSafeDurationMs(cfg?.raid?.lockdownMs, {
        min: RAID_SHIELD_MIN_MS,
        max: RAID_SHIELD_MAX_MS,
        fallback: RAID_SHIELD_DEFAULT_MS,
      }),
      shieldMs: toSafeDurationMs(cfg?.raid?.shieldMs, {
        min: RAID_SHIELD_MIN_MS,
        max: RAID_SHIELD_MAX_MS,
        fallback: resolveRaidShieldDurationMs(cfg?.raid || {}),
      }),
    },
  };
}

async function activatePanicMode(guild, client, opts = {}) {
  if (!guild?.id || !client?.db) {
    return { ok: false, code: "invalid_context", state: null };
  }

  const now = Date.now();
  const durationMs = toSafeDurationMs(opts.durationMs, {
    min: RAID_SHIELD_MIN_MS,
    max: PANIC_MAX_MS,
    fallback: PANIC_DEFAULT_MS,
  });
  const requestedUntil = now + durationMs;

  const cfg = await getConfig(client.db, guild.id);
  const currentState = await readPanicState(client.db, guild.id);
  const currentUntil = Number(currentState?.until || 0);
  const until = currentUntil > now
    ? Math.max(currentUntil, requestedUntil)
    : requestedUntil;
  const restore = currentState?.restore || buildPanicRestoreSnapshot(cfg);
  const since = currentState?.since && currentState.since > 0 ? currentState.since : now;
  const reason = String(opts.reason || "").trim().slice(0, 200) || currentState?.reason || null;

  const togglesPatch = { ...(cfg?.toggles || {}) };
  for (const key of PANIC_TOGGLE_KEYS) togglesPatch[key] = true;

  const raidPatch = {
    ...(cfg?.raid || {}),
    action: "ban+kilitle",
    lockdownMs: Math.max(resolveRaidShieldDurationMs(cfg?.raid || {}), durationMs),
    shieldMs: Math.max(resolveRaidShieldDurationMs(cfg?.raid || {}), durationMs),
    youngAccountAction: "ban",
  };

  const nextCfg = await setConfig(client.db, guild.id, {
    toggles: togglesPatch,
    raid: raidPatch,
  }, { updatedBy: String(opts.actorId || "").trim() || undefined });

  const remainingMs = Math.max(RAID_SHIELD_MIN_MS, until - now);
  await lockRaidChannels(guild, nextCfg, remainingMs, {
    logOnExtend: !!currentState?.enabled,
  }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  activateRaidShield(guild.id, remainingMs, {
    byUserId: opts.actorId,
    reason: reason || "panic_mode",
  });

  const nextState = {
    enabled: true,
    since,
    until,
    byUserId: String(opts.actorId || "").trim() || null,
    reason,
    restore,
  };
  await writePanicState(client.db, guild.id, nextState);
  schedulePanicAutoDisable(guild, client, until);

    await sendLog(
      nextCfg,
      guild,
      `Panic mode ${currentState?.enabled ? "guncellendi" : "aktif edildi"}.` +
        `${nextState.reason ? ` Sebep: ${nextState.reason}` : ""} ` +
        `(Kalan sure: ${Math.round((until - now) / 1000)}s)`
    ).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

  return { ok: true, code: currentState?.enabled ? "updated" : "enabled", state: nextState };
}

async function deactivatePanicMode(guild, client, opts = {}) {
  if (!guild?.id || !client?.db) {
    return { ok: false, code: "invalid_context", state: null };
  }

  const currentState = await readPanicState(client.db, guild.id);
  clearPanicTimer(guild.id);
  clearRaidShield(guild.id);

  const cfg = await getConfig(client.db, guild.id);
  const restore = currentState?.restore;

  if (restore?.toggles || restore?.raid) {
    await setConfig(client.db, guild.id, {
      toggles: { ...(cfg?.toggles || {}), ...(restore.toggles || {}) },
      raid: { ...(cfg?.raid || {}), ...(restore.raid || {}) },
    }, { updatedBy: String(opts.actorId || "").trim() || undefined });
  }

  await writePanicState(client.db, guild.id, null);
  await (unlockRaidLock(guild, cfg) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

  if (!opts?.silentLog) {
    await sendLog(
      cfg,
      guild,
      `Panic mode kapatildi.${opts?.auto ? " (otomatik)" : ""}${opts?.reason ? ` Sebep: ${opts.reason}` : ""}`
    ).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  return { ok: true, code: "disabled", state: { enabled: false } };
}

function getTracker(map, guildId, channelId, windowMs, maxMessages) {
  const now = Date.now();
  const scopeKey = `${guildId}:${channelId || "global"}`;
  const cur = map.get(scopeKey);
  if (
    !cur ||
    cur.windowMs !== windowMs ||
    cur.maxMessages !== maxMessages
  ) {
    map.set(scopeKey, {
      windowMs,
      maxMessages,
      tracker: createFloodTracker({ windowMs, maxMessages }),
      touchedAt: now,
    });
  } else {
    cur.touchedAt = now;
  }
  return map.get(scopeKey).tracker;
}

function pruneTrackerMap(map, now = Date.now()) {
  for (const [key, value] of map.entries()) {
    const touchedAt = Number(value?.touchedAt || 0);
    const windowMs = Number(value?.windowMs || 0);
    const idleLimit = Math.max(TRACKER_IDLE_TTL_MS, windowMs * 10);
    if (!touchedAt || now - touchedAt > idleLimit) {
      map.delete(key);
    }
  }
}

function pruneRecentMessageMap(map, keepMs, now = Date.now()) {
  for (const [key, arr] of map.entries()) {
    if (!Array.isArray(arr) || !arr.length) {
      map.delete(key);
      continue;
    }

    while (arr.length && now - Number(arr[0]?.at || 0) > keepMs) {
      arr.shift();
    }

    if (!arr.length) map.delete(key);
  }
}

function pruneJoinTrackers(now = Date.now()) {
  for (const [guildId, joins] of joinTrackers.entries()) {
    if (!Array.isArray(joins) || !joins.length) {
      joinTrackers.delete(guildId);
      continue;
    }

    const filtered = joins.filter((at) => now - Number(at || 0) <= TRACKER_IDLE_TTL_MS);
    if (!filtered.length) {
      joinTrackers.delete(guildId);
      continue;
    }

    joinTrackers.set(guildId, filtered);
  }
}

function maybeCleanupTransientState(now = Date.now()) {
  if (now - lastTransientStateGcAt < STATE_GC_INTERVAL_MS) return;
  lastTransientStateGcAt = now;

  pruneTrackerMap(floodTrackers, now);
  pruneTrackerMap(spamTrackers, now);
  pruneTrackerMap(linkTrackers, now);
  pruneTrackerMap(emojiTrackers, now);
  pruneTrackerMap(mentionTrackers, now);
  pruneTrackerMap(everyoneTrackers, now);

  pruneRecentMessageMap(recentUserMessages, RECENT_MSG_KEEP_MS, now);
  pruneRecentMessageMap(recentLinkMessages, RECENT_LINK_KEEP_MS, now);
  pruneRecentMessageMap(recentEmojiMessages, RECENT_EMOJI_KEEP_MS, now);
  pruneRecentMessageMap(recentMentionMessages, RECENT_MENTION_KEEP_MS, now);
  pruneRecentMessageMap(recentEveryoneMessages, RECENT_EVERYONE_KEEP_MS, now);

  for (const [key, until] of spamBlockUntil.entries()) {
    if (!Number.isFinite(Number(until)) || Number(until) <= now) {
      spamBlockUntil.delete(key);
    }
  }

  for (const [key, queue] of deleteQueues.entries()) {
    if (!queue?.flushing && (!queue?.ids || queue.ids.size === 0)) {
      deleteQueues.delete(key);
    }
  }

  pruneJoinTrackers(now);

  for (const [key, state] of raidShieldState.entries()) {
    const until = Number(state?.until || 0);
    if (!Number.isFinite(until) || until <= now) {
      raidShieldState.delete(key);
    }
  }
}

function hasBypassRole(cfg, member) {
  const bypass = cfg?.bypassRoleIds || [];
  if (!bypass.length || !member?.roles?.cache) return false;
  return member.roles.cache.some((r) => bypass.includes(r.id));
}

function isGuildOwnerUser(guild, userId) {
  if (!guild?.ownerId || !userId) return false;
  return guild.ownerId === userId;
}

function hasRoleFromList(member, roleIds) {
  if (!Array.isArray(roleIds) || !roleIds.length) return false;
  if (!member?.roles?.cache) return false;
  return member.roles.cache.some((role) => roleIds.includes(role.id));
}

function getRuleExemptRoleIds(cfg, ruleKey) {
  const roleIds = cfg?.[ruleKey]?.exemptRoleIds;
  if (!Array.isArray(roleIds)) return [];
  return roleIds;
}

function getRuleExemptChannelIds(cfg, ruleKey) {
  const channelIds = cfg?.[ruleKey]?.exemptChannelIds;
  if (!Array.isArray(channelIds)) return [];
  return channelIds;
}

function isRuleRoleExempt(cfg, ruleKey, member) {
  return hasRoleFromList(member, getRuleExemptRoleIds(cfg, ruleKey));
}

function isRuleChannelExempt(cfg, ruleKey, channelId) {
  const channelIds = getRuleExemptChannelIds(cfg, ruleKey);
  if (!channelIds.length || !channelId) return false;
  return channelIds.includes(channelId);
}

function isRuleExempt(cfg, ruleKey, message) {
  return isRuleRoleExempt(cfg, ruleKey, message?.member) ||
    isRuleChannelExempt(cfg, ruleKey, message?.channelId);
}

function isCapsRoleExempt(cfg, member) {
  return isRuleRoleExempt(cfg, "caps", member);
}

function isCapsChannelExempt(cfg, channelId) {
  return isRuleChannelExempt(cfg, "caps", channelId);
}

function isCapsExempt(cfg, message) {
  return isRuleExempt(cfg, "caps", message);
}

function isLinkRoleExempt(cfg, member) {
  return isRuleRoleExempt(cfg, "links", member);
}

function isLinkChannelExempt(cfg, channelId) {
  return isRuleChannelExempt(cfg, "links", channelId);
}

function isLinkExempt(cfg, message) {
  return isRuleExempt(cfg, "links", message);
}

function isProfanityRoleExempt(cfg, member) {
  return isRuleRoleExempt(cfg, "profanity", member);
}

function isProfanityChannelExempt(cfg, channelId) {
  return isRuleChannelExempt(cfg, "profanity", channelId);
}

function isProfanityExempt(cfg, message) {
  return isRuleExempt(cfg, "profanity", message);
}

function isEmojiExempt(cfg, message) {
  return isRuleExempt(cfg, "emoji", message);
}

function isMentionsExempt(cfg, message) {
  return isRuleExempt(cfg, "mentions", message);
}

function isEveryoneExempt(cfg, message) {
  return isRuleExempt(cfg, "everyone", message);
}

function isFloodExempt(cfg, message) {
  return isRuleExempt(cfg, "flood", message);
}

function isSpamExempt(cfg, message) {
  return isRuleExempt(cfg, "spam", message);
}

function isBypassed(cfg, member) {
  if (!member) return false;
  if (isGuildOwnerUser(member.guild, member.id)) return true;
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  if (hasBypassRole(cfg, member)) return true;
  return isWhitelisted(cfg, member.id, member, member.guild);
}

function getSnapshots(cfg) {
  if (!cfg.snapshots || typeof cfg.snapshots !== "object") {
    cfg.snapshots = { roles: {}, channels: {} };
  }
  cfg.snapshots.roles ||= {};
  cfg.snapshots.channels ||= {};
  return cfg.snapshots;
}

async function saveConfig(db, gid, cfg) {
  await db.set(`prot_cfg_${gid}`, cfg);
}

async function snapshotRole(cfg, db, guildId, role) {
  const snaps = getSnapshots(cfg);
  snaps.roles[role.id] = {
    permissions: String(role.permissions?.bitfield || "0"),
  };
  await saveConfig(db, guildId, cfg);
}

async function snapshotChannel(cfg, db, guildId, channel) {
  const snaps = getSnapshots(cfg);
  const overwrites = normalizeOverwrites(channel);

  snaps.channels[channel.id] = { overwrites };
  await saveConfig(db, guildId, cfg);
}

function sameOverwrites(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (!x || !y) return false;
    if (x.id !== y.id || x.type !== y.type || x.allow !== y.allow || x.deny !== y.deny) return false;
  }
  return true;
}

async function restoreRoleFromSnapshot(role, snap) {
  if (!snap?.permissions) return;
  await (role.setPermissions(BigInt(snap.permissions), "Protection: Izin snapshot geri yukleme") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
}

async function restoreChannelFromSnapshot(channel, snap) {
  if (!snap?.overwrites) return;
  await channel.permissionOverwrites
    .set(snap.overwrites)
    .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
}

async function fetchWebhookAuditForChannel(guild, channelId) {
  const maxAgeMs = 20_000;
  const retries = 3;
  const delayMs = 800;
  const limitPerType = 15;
  const types = [
    AuditLogEvent.WebhookCreate,
    AuditLogEvent.WebhookUpdate,
    AuditLogEvent.WebhookDelete,
  ];

  for (let i = 0; i <= retries; i++) {
    let latest = null;
    const now = Date.now();

    for (const t of types) {
      const logs = await (guild.fetchAuditLogs({ type: t, limit: limitPerType }) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
      const entries = logs?.entries ? [...logs.entries.values()] : [];

      for (const entry of entries) {
        const created = entry?.createdTimestamp || 0;
        if (!created || now - created > maxAgeMs) continue;

        const entryChannelId =
          entry?.extra?.channel?.id ||
          entry?.target?.channelId ||
          entry?.target?.sourceChannel?.id ||
          null;

        if (channelId && entryChannelId && entryChannelId !== channelId) continue;
        if (!latest || created > (latest.createdTimestamp || 0)) latest = entry;
      }
    }

    if (latest) return latest;
    if (i < retries) await wait(delayMs);
  }

  return null;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAuditEntryForTarget(guild, type, targetId, opts = {}) {
  const {
    maxAgeMs = 15_000,
    retries = 2,
    delayMs = 700,
    limit = 10,
  } = opts;

  if (!guild?.fetchAuditLogs) return null;

  for (let i = 0; i <= retries; i++) {
    const logs = await (guild.fetchAuditLogs({ type, limit }) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    const entries = logs?.entries ? [...logs.entries.values()] : [];
    const now = Date.now();

    for (const entry of entries) {
      const created = entry?.createdTimestamp || 0;
      if (!created || now - created > maxAgeMs) continue;

      if (targetId) {
        const entryTargetId =
          entry?.target?.id ||
          entry?.extra?.channel?.id ||
          entry?.extra?.id ||
          null;

        if (!entryTargetId || entryTargetId !== targetId) continue;
      }

      return entry;
    }

    if (i < retries) await wait(delayMs);
  }

  return null;
}

function shouldSendViolationLog(guildId, userId, reason) {
  const key = `${guildId}:${userId}:${reason}`;
  const now = Date.now();
  const last = violationLogCooldown.get(key) || 0;
  if (now - last < VIOLATION_LOG_COOLDOWN_MS) return false;
  violationLogCooldown.set(key, now);
  return true;
}

function shouldRunPurge(guildId, channelId, userId) {
  const key = `${guildId}:${channelId}:${userId}`;
  const now = Date.now();
  const last = purgeCooldown.get(key) || 0;
  if (now - last < PURGE_COOLDOWN_MS) return false;
  purgeCooldown.set(key, now);
  return true;
}

function getRuleTimeoutMs(cfg, ruleKey) {
  const v = Number(cfg?.timeouts?.[ruleKey]);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(v, MAX_TIMEOUT_MS);
}

function shouldRunTimeout(guildId, userId, ruleKey) {
  const key = `${guildId}:${userId}:${ruleKey}`;
  const now = Date.now();
  const last = timeoutCooldown.get(key) || 0;
  if (now - last < TIMEOUT_COOLDOWN_MS) return false;
  timeoutCooldown.set(key, now);
  return true;
}

function shouldGiveMutedRole(cfg, ruleKey) {
  return Number(cfg?.muteOnViolation?.[ruleKey]) === 1;
}

function getRuleMuteDurationMs(cfg, ruleKey) {
  const v = Number(cfg?.muteDurations?.[ruleKey]);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(v, MAX_TIMEOUT_MS);
}

function normalizeLooseName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\uFE0F/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isPrisonChannelName(name) {
  const n = normalizeLooseName(name);
  if (!n) return false;
  if (n.includes("hapis")) return true;
  if (n.includes("jail")) return true;
  return false;
}

async function resolvePrisonChannel(guild, client) {
  if (!guild || !client?.db) return null;

  const savedChannelId = await (client.db.get(PRISON_CHANNEL_KEY(guild.id)) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (savedChannelId) {
    const byId = guild.channels.cache.get(savedChannelId) || await (guild.channels.fetch(savedChannelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (byId?.isTextBased?.()) return byId;
  }

  const byName = guild.channels.cache.find((ch) => ch?.isTextBased?.() && isPrisonChannelName(ch.name));
  if (byName) {
    await (client.db.set(PRISON_CHANNEL_KEY(guild.id), byName.id) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    return byName;
  }

  const me = guild.members?.me || null;
  if (!me?.permissions?.has?.(PermissionFlagsBits.ManageChannels)) return null;

  let category = null;
  const savedCategoryId = await (client.db.get(PRISON_CATEGORY_KEY(guild.id)) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (savedCategoryId) {
    category = guild.channels.cache.get(savedCategoryId) || await (guild.channels.fetch(savedCategoryId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (category?.type !== ChannelType.GuildCategory) category = null;
  }

  if (!category) {
    category =
      guild.channels.cache.find((ch) => ch?.type === ChannelType.GuildCategory && isPrisonChannelName(ch.name)) ||
      null;
  }

  if (!category) {
    category = await guild.channels.create({
      name: PRISON_CATEGORY_DEFAULT_NAME,
      type: ChannelType.GuildCategory,
      reason: "Protection: muted hapis kategorisi kur",
    }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  }

  if (category) {
    await (client.db.set(PRISON_CATEGORY_KEY(guild.id), category.id) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  const createPayload = {
    name: PRISON_CHANNEL_DEFAULT_NAME,
    type: ChannelType.GuildText,
    reason: "Protection: muted hapis kanali kur",
  };
  if (category?.id) createPayload.parent = category.id;

  const created = await (guild.channels.create(createPayload) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });

  if (created) {
    await (client.db.set(PRISON_CHANNEL_KEY(guild.id), created.id) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  return created || null;
}

async function ensureMutedRoleChannelVisibility(guild, muteRole, client) {
  if (!guild || !muteRole || !client?.db) return;
  const me = guild.members?.me || null;
  if (!me?.permissions?.has?.(PermissionFlagsBits.ManageChannels)) return;

  const now = Date.now();
  const last = Number(mutedRoleSyncCooldown.get(guild.id) || 0);
  if (now - last < MUTE_ROLE_SYNC_COOLDOWN_MS) return;
  mutedRoleSyncCooldown.set(guild.id, now);

  const prisonChannel = await (resolvePrisonChannel(guild, client) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  const rulesChannel =
    (guild.rulesChannelId ? guild.channels.cache.get(guild.rulesChannelId) : null) ||
    (guild.rulesChannelId ? await guild.channels.fetch(guild.rulesChannelId).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; }) : null);

  const everyoneId = guild.roles.everyone?.id;
  if (prisonChannel?.permissionOverwrites?.edit && everyoneId) {
    await prisonChannel.permissionOverwrites.edit(
      everyoneId,
      {
        ViewChannel: false,
        SendMessages: false,
        SendMessagesInThreads: false,
        AddReactions: false,
      },
      { reason: "Protection: hapis kanali sadece muted gorus/yazma" }
    ).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  for (const channel of guild.channels.cache.values()) {
    if (!channel?.permissionOverwrites?.edit) continue;

    if (prisonChannel && channel.id === prisonChannel.id) {
      await channel.permissionOverwrites.edit(
        muteRole.id,
        {
          ViewChannel: true,
          ReadMessageHistory: true,
          SendMessages: true,
          SendMessagesInThreads: true,
          AddReactions: true,
          AttachFiles: false,
          EmbedLinks: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,
          UseApplicationCommands: false,
        },
        { reason: "Protection: muted sadece hapis odasina yazsin" }
      ).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      continue;
    }

    if (rulesChannel && channel.id === rulesChannel.id) {
      await channel.permissionOverwrites.edit(
        muteRole.id,
        {
          ViewChannel: true,
          ReadMessageHistory: true,
          SendMessages: false,
          SendMessagesInThreads: false,
          AddReactions: false,
          AttachFiles: false,
          EmbedLinks: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,
          UseApplicationCommands: false,
        },
        { reason: "Protection: muted kurallar kanalini sadece gorsun" }
      ).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      continue;
    }

    await channel.permissionOverwrites.edit(
      muteRole.id,
      {
        ViewChannel: false,
        SendMessages: false,
        SendMessagesInThreads: false,
        AddReactions: false,
        AttachFiles: false,
        EmbedLinks: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        UseApplicationCommands: false,
        Connect: false,
        Speak: false,
      },
      { reason: "Protection: muted genel kanal gorunurluk/yazma kisiti" }
    ).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }
}

function normalizeMuteAssignments(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const [userId, expiresAt] of Object.entries(src)) {
    if (!/^\d{15,25}$/.test(String(userId || "").trim())) continue;
    const ts = Number(expiresAt);
    if (!Number.isFinite(ts) || ts <= 0) continue;
    out[String(userId)] = Math.floor(ts);
  }
  return out;
}

async function getMuteAssignments(db, guildId) {
  if (!db || !guildId) return {};
  const raw = await (db.get(MUTE_ASSIGNMENTS_KEY(guildId)) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  return normalizeMuteAssignments(raw);
}

async function saveMuteAssignments(db, guildId, assignments) {
  if (!db || !guildId) return;
  const normalized = normalizeMuteAssignments(assignments);
  if (!Object.keys(normalized).length) {
    await (db.delete(MUTE_ASSIGNMENTS_KEY(guildId)) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    return;
  }
  await (db.set(MUTE_ASSIGNMENTS_KEY(guildId), normalized) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
}

async function setMuteAssignment(db, guildId, userId, expiresAt) {
  const assignments = await getMuteAssignments(db, guildId);
  const prev = Number(assignments[userId] || 0);
  assignments[userId] = Math.max(prev, Number(expiresAt) || 0);
  await saveMuteAssignments(db, guildId, assignments);
}

async function clearMuteAssignment(db, guildId, userId) {
  const assignments = await getMuteAssignments(db, guildId);
  if (!assignments[userId]) return;
  delete assignments[userId];
  await saveMuteAssignments(db, guildId, assignments);
}

function shouldFetchMutedMember(member, expiresAt, now = Date.now()) {
  if (member) return false;
  const endAt = Number(expiresAt || 0);
  if (!Number.isFinite(endAt) || endAt <= 0) return true;
  return endAt <= now;
}

async function runMuteReaperForGuild(guild, client, now = Date.now()) {
  if (!guild?.id || !client?.db) return;
  const assignments = await getMuteAssignments(client.db, guild.id);
  const userIds = Object.keys(assignments);
  if (!userIds.length) return;

  const muteRole = await resolveMutedRole(guild, client);
  if (!muteRole) return;

  let changed = false;
  for (const userId of userIds) {
    const expiresAt = Number(assignments[userId] || 0);
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
      delete assignments[userId];
      changed = true;
      continue;
    }

    let member = guild.members.cache.get(userId) || null;
    if (shouldFetchMutedMember(member, expiresAt, now)) {
      member = await getGuildMember(guild, userId);
    }

    if (!member) {
      if (expiresAt <= now) {
        delete assignments[userId];
        changed = true;
      }
      continue;
    }

    if (!member.roles?.cache?.has?.(muteRole.id)) {
      delete assignments[userId];
      changed = true;
      continue;
    }

    if (expiresAt > now) continue;

    if (member.manageable) {
      const removed = await member.roles.remove(muteRole, "Protection: muted sure doldu").then(() => true).catch(() => false);
      if (removed) {
        delete assignments[userId];
        changed = true;
      }
      continue;
    }
  }

  if (changed) {
    await saveMuteAssignments(client.db, guild.id, assignments);
  }
}

async function runMuteReaper(client) {
  if (!client?.guilds?.cache) return;
  if (muteReaperRunning) return;
  muteReaperRunning = true;
  try {
    const now = Date.now();
    for (const guild of client.guilds.cache.values()) {
      await (runMuteReaperForGuild(guild, client, now) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  } finally {
    muteReaperRunning = false;
  }
}

function ensureMuteReaper(client) {
  if (muteReaperTimer) return;
  muteReaperTimer = setInterval(() => {
    runMuteReaper(client).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }, MUTE_REAPER_INTERVAL_MS);
  if (typeof muteReaperTimer.unref === "function") muteReaperTimer.unref();
}

async function resolveMutedRole(guild, client) {
  if (!guild || !client?.db) return null;

  const logs = client.features?.Logs;
  let role = null;
  let roleId = null;

  if (logs?.getMuteRoleId) {
    roleId = await (logs.getMuteRoleId(client.db, guild.id) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  } else {
    roleId = await (client.db.get(`logs_mute_role_${guild.id}`) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  }

  if (roleId) {
    role = guild.roles.cache.get(roleId) || await (guild.roles.fetch(roleId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  }

  if (!role) {
    role =
      guild.roles.cache.find((r) => /^muted$/i.test(r.name || "")) ||
      guild.roles.cache.find((r) => /mute/i.test(r.name || "")) ||
      null;
  }

  if (role && logs?.setMuteRoleId) {
    await (logs.setMuteRoleId(client.db, guild.id, role.id) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  return role;
}

async function applyTimeoutForViolation(message, cfg, ruleKey, reason, client) {
  const timeoutMs = getRuleTimeoutMs(cfg, ruleKey);
  const enableMutedRole = shouldGiveMutedRole(cfg, ruleKey);
  const muteDurationMs = getRuleMuteDurationMs(cfg, ruleKey);
  if (!timeoutMs && !enableMutedRole) return;
  if (timeoutMs && !shouldRunTimeout(message.guild.id, message.author.id, ruleKey)) return;

  let member =
    message.member ||
    message.guild.members?.cache?.get?.(message.author.id) ||
    await getGuildMember(message.guild, message.author.id);

  if (!member) return;

  if (timeoutMs) {
    if (member.moderatable) {
      const until = Number(member.communicationDisabledUntilTimestamp || 0);
      if (!until || until - Date.now() <= 2000) {
        const timedOut = await member.timeout(timeoutMs, `Protection: ${reason}`).then(() => true).catch(() => false);
        if (timedOut) {
          const logs = client?.features?.Logs;
          if (logs?.onProtectionTimeout) {
            const memberUntilTs = Number(member.communicationDisabledUntilTimestamp || 0);
            const untilTs = memberUntilTs > Date.now() ? memberUntilTs : (Date.now() + timeoutMs);
            await logs
              .onProtectionTimeout(member, client, {
                reason: `Protection: ${reason}`,
                untilTs,
                ruleKey,
              })
              .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
          }
        }
      }
    }
  }

  if (enableMutedRole && member.manageable) {
    const muteRole = await resolveMutedRole(message.guild, client);
    if (muteRole) {
      await (ensureMutedRoleChannelVisibility(message.guild, muteRole, client) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

      if (!member.roles.cache.has(muteRole.id)) {
        await (member.roles.add(muteRole, `Protection: ${reason}`) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (muteDurationMs > 0) {
        await setMuteAssignment(
          client.db,
          message.guild.id,
          member.id,
          Date.now() + muteDurationMs
        ).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      } else {
        await (clearMuteAssignment(client.db, message.guild.id, member.id) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
    }
  }
}

async function purgeRecentMessagesByUser(channel, userId, client, reason = "Protection") {
  if (!channel?.messages?.fetch) return;

  const fetched = await (channel.messages.fetch({ limit: PURGE_FETCH_LIMIT }) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!fetched) return;

  const now = Date.now();
  const cutoff = now - 14 * 24 * 60 * 60 * 1000;

  const ids = [];
  for (const msg of fetched.values()) {
    if (msg.author?.id !== userId) continue;
    if (!msg.deletable) continue;
    if (!msg.createdTimestamp || msg.createdTimestamp < cutoff) continue;
    ids.push(msg.id);
    if (ids.length >= PURGE_MAX_DELETE) break;
  }

  if (!ids.length) return;
  const logs = client?.features?.Logs;
  if (logs?.markMessageDeleteReasons) {
    logs.markMessageDeleteReasons(channel.guild?.id, channel.id, ids, `Protection: ${reason}`);
  }

  if (ids.length > 1 && channel.bulkDelete) {
    await channel.bulkDelete(ids, true).catch(async () => {
      await Promise.allSettled(
        ids.map((id) => channel.messages.delete(id).catch((err) => { globalThis.__airWarnSuppressedError?.(err); }))
      );
    });
    return;
  }

  await (channel.messages.delete(ids[0]) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
}

function handleMessageViolation(message, cfg, reason, opts = {}, client) {
  const deleteKey = getUserChannelKey(message.guild.id, message.channelId, message.author.id);
  const idsToDelete = [message.id];
  if (Array.isArray(opts?.trackedIds) && opts.trackedIds.length) {
    idsToDelete.push(...opts.trackedIds);
  }
  if (opts?.instantDelete && message.deletable) {
    message.delete().catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }
  const logs = client?.features?.Logs;
  if (logs?.markMessageDeleteReasons) {
    logs.markMessageDeleteReasons(
      message.guild.id,
      message.channelId,
      idsToDelete,
      `Protection: ${reason}`
    );
  }
  queueDeleteIds(message.channel, deleteKey, idsToDelete);
  if (opts?.fastFlush) {
    flushDeleteQueue(deleteKey).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  if (opts?.ruleKey) {
    applyTimeoutForViolation(message, cfg, opts.ruleKey, reason, client).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  if (opts?.blockWindowMs) {
    blockUserTemporarily(message.guild.id, message.channelId, message.author.id, opts.blockWindowMs);
  }

  const hasTrackedIds = Array.isArray(opts?.trackedIds) && opts.trackedIds.length > 0;
  if (!hasTrackedIds && opts?.purgeRecent && shouldRunPurge(message.guild.id, message.channelId, message.author.id)) {
    purgeRecentMessagesByUser(message.channel, message.author.id, client, reason).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  if (!opts?.skipLog && shouldSendViolationLog(message.guild.id, message.author.id, reason)) {
    sendLog(
      cfg,
      message.guild,
      `Mesaj engellendi: **${reason}** | Kullanici: <@${message.author.id}> | Kanal: <#${message.channelId}>`
    ).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }
}

async function getConfigFast(db, guildId) {
  const now = Date.now();
  const cached = cfgCache.get(guildId);
  if (cached && now - cached.at <= CFG_CACHE_TTL_MS) return cached.cfg;

  const cfg = await getConfig(db, guildId);
  cfgCache.set(guildId, { cfg, at: now });
  return cfg;
}

async function syncLinkAutoModFromConfig(guild, client, cfgHint = null, opts = {}) {
  if (!guild?.id || !client?.db) {
    return { ok: false, reason: "GUILD_OR_DB_MISSING", cfg: cfgHint || null };
  }

  let cfg = cfgHint || await getConfig(client.db, guild.id);
  const result = await syncLinkAutoModRule(guild, cfg, opts);

  if (result?.ok) {
    const currentRuleId = String(cfg?.links?.autoModRuleId || "");
    const nextRuleId = String(result?.ruleId || "");
    if (currentRuleId !== nextRuleId) {
      cfg = await setConfig(client.db, guild.id, {
        links: { autoModRuleId: nextRuleId || null },
      });
    }

    cfgCache.set(guild.id, { cfg, at: Date.now() });
  }

  return { ...result, cfg };
}

async function syncInviteAutoModFromConfig(guild, client, cfgHint = null, opts = {}) {
  if (!guild?.id || !client?.db) {
    return { ok: false, reason: "GUILD_OR_DB_MISSING", cfg: cfgHint || null };
  }

  let cfg = cfgHint || await getConfig(client.db, guild.id);
  const result = await syncInviteAutoModRule(guild, cfg, opts);

  if (result?.ok) {
    const currentRuleId = String(cfg?.invite?.autoModRuleId || "");
    const nextRuleId = String(result?.ruleId || "");
    if (currentRuleId !== nextRuleId) {
      cfg = await setConfig(client.db, guild.id, {
        invite: { autoModRuleId: nextRuleId || null },
      });
    }

    cfgCache.set(guild.id, { cfg, at: Date.now() });
  }

  return { ...result, cfg };
}

async function syncProfanityAutoModFromConfig(guild, client, cfgHint = null, opts = {}) {
  if (!guild?.id || !client?.db) {
    return { ok: false, reason: "GUILD_OR_DB_MISSING", cfg: cfgHint || null };
  }

  let cfg = cfgHint || await getConfig(client.db, guild.id);
  const result = await syncProfanityAutoModRule(guild, cfg, opts);

  if (result?.ok) {
    const currentRuleId = String(cfg?.profanity?.autoModRuleId || "");
    const nextRuleId = String(result?.ruleId || "");
    if (currentRuleId !== nextRuleId) {
      cfg = await setConfig(client.db, guild.id, {
        profanity: { autoModRuleId: nextRuleId || null },
      });
    }

    cfgCache.set(guild.id, { cfg, at: Date.now() });
  }

  return { ...result, cfg };
}

async function syncMentionsAutoModFromConfig(guild, client, cfgHint = null, opts = {}) {
  if (!guild?.id || !client?.db) {
    return { ok: false, reason: "GUILD_OR_DB_MISSING", cfg: cfgHint || null };
  }

  let cfg = cfgHint || await getConfig(client.db, guild.id);
  const result = await syncMentionsAutoModRule(guild, cfg, opts);

  if (result?.ok) {
    const currentRuleId = String(cfg?.mentions?.autoModRuleId || "");
    const nextRuleId = String(result?.ruleId || "");
    if (currentRuleId !== nextRuleId) {
      cfg = await setConfig(client.db, guild.id, {
        mentions: { autoModRuleId: nextRuleId || null },
      });
    }

    cfgCache.set(guild.id, { cfg, at: Date.now() });
  }

  return { ...result, cfg };
}

async function onMessage(message, client) {
  if (!message?.guild || !message?.author || message.author.bot) return;
  if (isGuildOwnerUser(message.guild, message.author.id)) return;

  const cfg = await getConfigFast(client.db, message.guild.id);
  if (isBypassed(cfg, message.member)) return;

  const now = Date.now();
  maybeCleanupTransientState(now);

  const content = message.content || "";
  const inviteLinks = extractInviteLinks(content);
  const detectedLinks = extractLinks(content);
  const emojiCountInMessage = countEmojis(content);
  const mentionCountInMessage = countMentions(content);
  const everyoneCountInMessage = countEveryoneHere(content);

  rememberRecentUserMessage(message);
  if (emojiCountInMessage > 0) rememberRecentEmojiMessage(message);
  if (mentionCountInMessage > 0) rememberRecentMentionMessage(message);
  if (everyoneCountInMessage > 0) rememberRecentEveryoneMessage(message);

  const t = cfg?.toggles || {};
  const capsCfg = getCapsConfig(cfg);
  const profanityCfg = getProfanityConfig(cfg);

  if (t.flood && !isFloodExempt(cfg, message)) {
    const cfgFlood = cfg?.flood || DEFAULTS.flood;
    const floodWindowMs = Number(cfgFlood.windowMs || DEFAULTS.flood.windowMs);
    const floodMaxMessages = Number(cfgFlood.maxMessages || DEFAULTS.flood.maxMessages);
    const tracker = getTracker(
      floodTrackers,
      message.guild.id,
      message.channelId,
      floodWindowMs,
      floodMaxMessages
    );

    const res = tracker.push(message.author.id);
    if (res.violation) {
      const trackedIds = getTrackedMessageIds(
        message.guild.id,
        message.channelId,
        message.author.id,
        floodWindowMs
      );
      tracker.reset(message.author.id);
      clearTrackedMessages(message.guild.id, message.channelId, message.author.id);
      handleMessageViolation(message, cfg, "Flood Koruma", {
        purgeRecent: true,
        trackedIds,
        ruleKey: "flood",
        blockWindowMs: floodWindowMs,
        instantDelete: true,
        fastFlush: true,
      }, client);
      return;
    }
  }

  if (t.spam && !isSpamExempt(cfg, message)) {
    const s = cfg?.spam || { maxMessages: 5, perSeconds: 10 };
    const windowMs = Number(s.perSeconds || 10) * 1000;
    const maxMessages = Number(s.maxMessages || 5);
    const spamUnits = getSpamMessageUnitCount(message);

    if (isDenseSpamContent(content, maxMessages)) {
      const trackedIds = getTrackedMessageIds(
        message.guild.id,
        message.channelId,
        message.author.id,
        windowMs
      );
      clearTrackedMessages(message.guild.id, message.channelId, message.author.id);
      handleMessageViolation(message, cfg, "Spam Koruma", {
        purgeRecent: true,
        trackedIds,
        ruleKey: "spam",
        blockWindowMs: windowMs,
        instantDelete: true,
        fastFlush: true,
      }, client);
      return;
    }

    const tracker = getTracker(spamTrackers, message.guild.id, message.channelId, windowMs, maxMessages);
    let res = { violation: false };
    for (let i = 0; i < spamUnits; i += 1) {
      res = tracker.push(message.author.id);
      if (res.violation) break;
    }
    if (res.violation) {
      const trackedIds = getTrackedMessageIds(
        message.guild.id,
        message.channelId,
        message.author.id,
        windowMs
      );
      tracker.reset(message.author.id);
      clearTrackedMessages(message.guild.id, message.channelId, message.author.id);
      handleMessageViolation(message, cfg, "Spam Koruma", {
        purgeRecent: true,
        trackedIds,
        ruleKey: "spam",
        blockWindowMs: windowMs,
        instantDelete: true,
        fastFlush: true,
      }, client);
      return;
    }
  }

  if (isUserTemporarilyBlocked(message.guild.id, message.channelId, message.author.id)) {
    const key = getUserChannelKey(message.guild.id, message.channelId, message.author.id);
    const logs = client?.features?.Logs;
    if (logs?.markMessageDeleteReason) {
      logs.markMessageDeleteReason(
        message.guild.id,
        message.channelId,
        message.id,
        "Protection: Geçici engel (spam/flood)"
      );
    }
    if (message.deletable) {
      message.delete().catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
    queueDeleteIds(message.channel, key, [message.id]);
    flushDeleteQueue(key).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    return;
  }

  if (t.caps && !isCapsExempt(cfg, message) && isCapsLockViolation(content, capsCfg)) {
    handleMessageViolation(message, cfg, "Caps Lock", { ruleKey: "caps" }, client);
    return;
  }

  if (t.profanity && !isProfanityExempt(cfg, message) && hasProfanity(content, profanityCfg.level)) {
    handleMessageViolation(message, cfg, "Küfür Engeli", {
      ruleKey: "profanity",
      instantDelete: true,
      fastFlush: true,
    }, client);
    return;
  }

  if (t.invite && inviteLinks.length > 0) {
    handleMessageViolation(message, cfg, "Invite Engeli", {
      ruleKey: "invite",
      instantDelete: true,
      fastFlush: true,
    }, client);
    return;
  }

  if (t.mentions && !isMentionsExempt(cfg, message) && mentionCountInMessage > 0) {
    const mentionsCfg = getMentionsConfig(cfg);
    const windowMs = mentionsCfg.perSeconds * 1000;
    const tracker = getTracker(mentionTrackers, message.guild.id, message.channelId, windowMs, mentionsCfg.maxCount);

    let violation = false;
    for (let i = 0; i < mentionCountInMessage; i += 1) {
      const res = tracker.push(message.author.id);
      if (res.violation) {
        violation = true;
        break;
      }
    }

    if (violation) {
      const trackedIds = getTrackedMentionMessageIds(
        message.guild.id,
        message.channelId,
        message.author.id,
        windowMs
      );
      tracker.reset(message.author.id);
      clearTrackedMentionMessages(message.guild.id, message.channelId, message.author.id);
      handleMessageViolation(message, cfg, "Etiket Limiti", {
        ruleKey: "mentions",
        blockWindowMs: windowMs,
        trackedIds,
        instantDelete: true,
        fastFlush: true,
      }, client);
      return;
    }
  }

  if (t.everyone && !isEveryoneExempt(cfg, message) && everyoneCountInMessage > 0) {
    const everyoneCfg = getEveryoneConfig(cfg);
    const windowMs = everyoneCfg.perSeconds * 1000;
    const tracker = getTracker(everyoneTrackers, message.guild.id, message.channelId, windowMs, everyoneCfg.maxCount);

    let violation = false;
    for (let i = 0; i < everyoneCountInMessage; i += 1) {
      const res = tracker.push(message.author.id);
      if (res.violation) {
        violation = true;
        break;
      }
    }

    if (violation) {
      const trackedIds = getTrackedEveryoneMessageIds(
        message.guild.id,
        message.channelId,
        message.author.id,
        windowMs
      );
      tracker.reset(message.author.id);
      clearTrackedEveryoneMessages(message.guild.id, message.channelId, message.author.id);
      handleMessageViolation(message, cfg, "Everyone/Here Limiti", {
        ruleKey: "everyone",
        blockWindowMs: windowMs,
        trackedIds,
        instantDelete: true,
        fastFlush: true,
      }, client);
      return;
    }
  }

  if (t.links && detectedLinks.length > 0 && !isLinkRoleExempt(cfg, message?.member)) {
    const linksCfg = getLinksConfig(cfg);
    const allowListActive = isLinkChannelExempt(cfg, message?.channelId);
    const hasDisallowedLink = hasDisallowedLinks(detectedLinks, linksCfg.allowedLinks);
    const hasBlockedLink = allowListActive ? hasDisallowedLink : true;
    const shouldSkipTimeout = !allowListActive && !hasDisallowedLink;

    if (hasBlockedLink) {
      rememberRecentLinkMessage(message);

      const windowMs = linksCfg.perSeconds * 1000;
      const tracker = getTracker(linkTrackers, message.guild.id, message.channelId, windowMs, linksCfg.maxMessages);
      const res = tracker.push(message.author.id);
      const trackedIds = getTrackedLinkMessageIds(
        message.guild.id,
        message.channelId,
        message.author.id,
        windowMs
      );
      const violation = res.count > linksCfg.maxMessages;

      if (violation) {
        tracker.reset(message.author.id);
        clearTrackedLinkMessages(message.guild.id, message.channelId, message.author.id);
        handleMessageViolation(message, cfg, "Link Engeli", {
          ruleKey: shouldSkipTimeout ? null : "links",
          blockWindowMs: windowMs,
          trackedIds,
          instantDelete: true,
          fastFlush: true,
        }, client);
        return;
      }

      handleMessageViolation(message, cfg, "Link Engeli", {
        ruleKey: shouldSkipTimeout ? null : "links",
        trackedIds,
        instantDelete: true,
        fastFlush: true,
      }, client);
      return;
    }
  }

  if (t.emoji && !isEmojiExempt(cfg, message) && emojiCountInMessage > 0) {
    const emojiCfg = getEmojiConfig(cfg);
    const windowMs = emojiCfg.perSeconds * 1000;
    const tracker = getTracker(emojiTrackers, message.guild.id, message.channelId, windowMs, emojiCfg.maxCount);

    let violation = false;
    for (let i = 0; i < emojiCountInMessage; i += 1) {
      const res = tracker.push(message.author.id);
      if (res.violation) {
        violation = true;
        break;
      }
    }

    if (violation) {
      const trackedIds = getTrackedEmojiMessageIds(
        message.guild.id,
        message.channelId,
        message.author.id,
        windowMs
      );
      tracker.reset(message.author.id);
      clearTrackedEmojiMessages(message.guild.id, message.channelId, message.author.id);
      handleMessageViolation(message, cfg, "Emoji Limiti", {
        ruleKey: "emoji",
        blockWindowMs: windowMs,
        trackedIds,
        instantDelete: true,
        fastFlush: true,
      }, client);
      return;
    }
  }

}

async function onMessageUpdateEvent(oldMessage, newMessage, client) {
  let msg = newMessage;
  if (msg?.partial) {
    msg = await (msg.fetch() || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  }

  if (!msg?.guild || !msg?.author || msg.author.bot) return;

  const oldContent = oldMessage?.content || "";
  const newContent = msg.content || "";
  if (oldContent === newContent) return;

  await onMessage(msg, client);
}

async function sendOrUpdatePanel(interaction, cfg, opts = {}) {
  const recreate = !!opts?.recreate;
  const onlyPanel = ["chat", "server", "limits"].includes(String(opts?.only || ""))
    ? String(opts.only)
    : null;
  const guild = interaction?.guild;
  if (!guild) throw new Error("Bu komut sadece sunucuda calisir.");

  let channel = interaction?.channel;
  if (!channel) throw new Error("Kanal bulunamadi.");

  // thread ise parent
  if (typeof channel.isThread === "function" && channel.isThread()) {
    if (channel.parent) channel = channel.parent;
  }

  if (typeof channel.send !== "function") {
    throw new Error("Bu komut sadece mesaj atilabilen bir text kanalda calisir.");
  }

  const panels = renderPanels(cfg, { actor: interaction?.user || null });
  const botId = guild.members?.me?.id || guild.client?.user?.id;
  const sourceMessage = interaction?.message;

  if (!recreate && onlyPanel && sourceMessage?.author?.id === botId && isPanelMsg(sourceMessage)) {
    const sourcePanelType = whichPanel(sourceMessage);
    if (sourcePanelType === onlyPanel) {
      await (sourceMessage.edit(panels[onlyPanel]) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return true;
    }
  }

  const fetched = await safeFetchLastMessages(channel);

  if (!fetched) {
    if (onlyPanel) {
      await channel.send(panels[onlyPanel]);
      return true;
    }
    await channel.send(panels.chat);
    await channel.send(panels.server);
    await channel.send(panels.limits);
    return true;
  }

  const existing = { chat: null, server: null, limits: null };
  let existingCombined = null;

  for (const msg of fetched.values()) {
    if (msg.author?.id !== botId) continue;
    if (isCombinedPanelMsg(msg)) {
      if (!existingCombined) existingCombined = msg;
      continue;
    }
    if (!isPanelMsg(msg)) continue;

    const k = whichPanel(msg);
    if (k && !existing[k]) existing[k] = msg;
  }

  if (recreate) {
    if (!onlyPanel && existingCombined) {
      await (existingCombined.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }

    if (onlyPanel) {
      if (existing[onlyPanel]) await (existing[onlyPanel].delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      await channel.send(panels[onlyPanel]);
      return true;
    }

    for (const msg of Object.values(existing)) {
      if (!msg) continue;
      await (msg.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }

    await channel.send(panels.chat);
    await channel.send(panels.server);
    await channel.send(panels.limits);
    return true;
  }

  if (onlyPanel) {
    if (existing[onlyPanel]) await (existing[onlyPanel].edit(panels[onlyPanel]) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    else await channel.send(panels[onlyPanel]);
    return true;
  }

  if (existing.chat) await (existing.chat.edit(panels.chat) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  else await channel.send(panels.chat);

  if (existing.server) await (existing.server.edit(panels.server) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  else await channel.send(panels.server);

  if (existing.limits) await (existing.limits.edit(panels.limits) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  else await channel.send(panels.limits);

  return true;
}

async function sendOrUpdateCombinedPanel(interaction, cfg, opts = {}) {
  const recreate = !!opts?.recreate;
  const guild = interaction?.guild;
  if (!guild) throw new Error("Bu komut sadece sunucuda calisir.");

  let channel = interaction?.channel;
  if (!channel) throw new Error("Kanal bulunamadi.");

  if (typeof channel.isThread === "function" && channel.isThread()) {
    if (channel.parent) channel = channel.parent;
  }

  if (typeof channel.send !== "function") {
    throw new Error("Bu komut sadece mesaj atilabilen bir text kanalda calisir.");
  }

  const payload = renderCombinedPanel(cfg, { actor: interaction?.user || null });
  const botId = guild.members?.me?.id || guild.client?.user?.id;
  const sourceMessage = interaction?.message;
  if (!recreate && sourceMessage?.author?.id === botId && isCombinedPanelMsg(sourceMessage)) {
    await (sourceMessage.edit(payload) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    return true;
  }

  const fetched = await safeFetchLastMessages(channel);
  if (!fetched) {
    await channel.send(payload);
    return true;
  }

  let existingCombined = null;
  const staleSingles = [];

  for (const msg of fetched.values()) {
    if (msg.author?.id !== botId) continue;
    if (!isCombinedPanelMsg(msg)) continue;
    if (!existingCombined) existingCombined = msg;
  }

  for (const msg of fetched.values()) {
    if (msg.author?.id !== botId) continue;
    if (!isPanelMsg(msg)) continue;
    staleSingles.push(msg);
  }

  if (recreate && existingCombined) {
    await (existingCombined.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    existingCombined = null;
  }
  if (recreate && staleSingles.length) {
    await Promise.allSettled(staleSingles.map((msg) => msg.delete().catch((err) => { globalThis.__airWarnSuppressedError?.(err); })));
  }

  if (existingCombined) {
    await (existingCombined.edit(payload) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  } else {
    await channel.send(payload);
  }

  return true;
}

function getPanelKinds(msg) {
  const kinds = new Set();
  const rows = msg?.components || [];
  for (const row of rows) {
    for (const c of row?.components || []) {
      const id = c?.customId;
      if (id === "prot:ui:chat") kinds.add("chat");
      if (id === "prot:ui:server") kinds.add("server");
      if (id === "prot:ui:limits") kinds.add("limits");
    }
  }
  return kinds;
}

function whichPanel(msg) {
  const kinds = [...getPanelKinds(msg)];
  if (kinds.length !== 1) return null;
  return kinds[0];
}

function isPanelMsg(msg) {
  return getPanelKinds(msg).size === 1;
}

function isCombinedPanelMsg(msg) {
  const kinds = getPanelKinds(msg);
  return kinds.has("chat") && kinds.has("server") && kinds.has("limits");
}

async function safeFetchLastMessages(channel) {
  try {
    if (!channel?.messages?.fetch) return null;
    return await channel.messages.fetch({ limit: 50 });
  } catch {
    return null;
  }
}

function init() {}

async function onReadyEvent(client) {
  const guilds = client?.guilds?.cache?.values?.();
  if (!guilds) return;
  ensureMuteReaper(client);

  for (const guild of guilds) {
    let cfg = await (getConfig(client.db, guild.id) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (!cfg) continue;
    const linkSync = await (syncLinkAutoModFromConfig(guild, client, cfg) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    cfg = linkSync?.cfg || cfg;
    const inviteSync = await (syncInviteAutoModFromConfig(guild, client, cfg) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    cfg = inviteSync?.cfg || cfg;
    const profanitySync = await (syncProfanityAutoModFromConfig(guild, client, cfg) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    cfg = profanitySync?.cfg || cfg;
    await (syncMentionsAutoModFromConfig(guild, client, cfg) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

    const muteRole = await (resolveMutedRole(guild, client) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (muteRole) {
      await (ensureMutedRoleChannelVisibility(guild, muteRole, client) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }

    const panic = await (readPanicState(client.db, guild.id) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (panic?.enabled && panic.until > Date.now()) {
      const remainingMs = Math.max(1_000, panic.until - Date.now());
      schedulePanicAutoDisable(guild, client, panic.until);
      activateRaidShield(guild.id, remainingMs, { reason: "panic_resume" });
      await (lockRaidChannels(guild, cfg, remainingMs) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } else if (panic?.enabled) {
      clearPanicTimer(guild.id);
      await (writePanicState(client.db, guild.id, null) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  }

  await (runMuteReaper(client) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
}

async function onGuildCreateEvent(guild, client) {
  if (!guild) return;
  ensureMuteReaper(client);
  let cfg = await (getConfig(client.db, guild.id) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!cfg) return;
  const linkSync = await (syncLinkAutoModFromConfig(guild, client, cfg) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  cfg = linkSync?.cfg || cfg;
  const inviteSync = await (syncInviteAutoModFromConfig(guild, client, cfg) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  cfg = inviteSync?.cfg || cfg;
  const profanitySync = await (syncProfanityAutoModFromConfig(guild, client, cfg) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  cfg = profanitySync?.cfg || cfg;
  await (syncMentionsAutoModFromConfig(guild, client, cfg) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

  const muteRole = await (resolveMutedRole(guild, client) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (muteRole) {
    await (ensureMutedRoleChannelVisibility(guild, muteRole, client) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  await (runMuteReaperForGuild(guild, client) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
}

async function onChannelCreateEvent(channel, client) {
  const out = await onChannelCreate(channel, client.db, limiter);

  const guildId = channel?.guild?.id;
  if (!guildId) return out;

  const state = raidLockState.get(guildId);
  if (!state || !supportsRaidLock(channel)) return out;

  const everyone = channel.guild.roles?.everyone;
  if (!everyone) return out;

  const existing = state.channels.find((item) => item.channelId === channel.id);
  if (existing) return out;

  const ow = channel.permissionOverwrites?.cache?.get?.(everyone.id);
  const before = ow?.allow?.has?.(PermissionFlagsBits.SendMessages)
    ? 1
    : ow?.deny?.has?.(PermissionFlagsBits.SendMessages)
      ? -1
      : 0;

  await channel.permissionOverwrites
    ?.edit?.(everyone, { SendMessages: false }, "Protection: Raid kilidi (yeni kanal)")
    .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

  state.channels.push({ channelId: channel.id, before });
  return out;
}

async function onChannelDeleteEvent(channel, client) {
  const out = await onChannelDelete(channel, client.db, limiter);

  const guildId = channel?.guild?.id;
  if (!guildId) return out;

  const state = raidLockState.get(guildId);
  if (!state) return out;

  state.channels = state.channels.filter((item) => item.channelId !== channel.id);
  return out;
}

async function onRoleCreateEvent(role, client) {
  return onRoleCreate(role, client.db, limiter);
}

async function onRoleDeleteEvent(role, client) {
  return onRoleDelete(role, client.db, limiter);
}

async function onGuildBanAddEvent(ban, client) {
  return onGuildBanAdd(ban, client.db, limiter);
}

async function onGuildMemberRemoveEvent(member, client) {
  return onGuildMemberRemove(member, client.db, limiter);
}

async function onGuildMemberAddEvent(member, client) {
  await onGuildMemberAdd(member, client.db);

  if (!member?.guild || member.user?.bot) return;

  const cfg = await getConfig(client.db, member.guild.id);
  if (!cfg?.toggles?.antiRaid) return;

  const raid = cfg?.raid || { windowMs: 15000, maxJoins: 6, action: "kick", lockdownMs: 300000 };
  const currentShield = getActiveRaidShield(member.guild.id);
  if (currentShield) {
    if (!isBypassed(cfg, member)) {
      const action = resolveRaidJoinAction(member, raid, { inShield: true });
      await (applyRaidPunish(member, action, "Protection: Raid Shield") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      await sendLog(
        cfg,
        member.guild,
        `Raid Shield aktif: yeni katilan uyeye islem uygulandi ` +
          `(${action.punish || "none"}). Uye: <@${member.id}>`
      );
    }

    if (normalizeRaidAction(raid.action).lock) {
      const lockMs = resolveRaidShieldDurationMs(raid);
      await (lockRaidChannels(member.guild, cfg, lockMs) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
    return;
  }

  const res = pushJoin(
    member.guild.id,
    Number(raid.windowMs || 15000),
    Number(raid.maxJoins || 6)
  );

  await sendLog(
    cfg,
    member.guild,
    `Raid Koruma: **${res.count}/${res.maxJoins}** (${Math.round(res.windowMs / 1000)}s)`
  );

  if (!res.violation) return;

  const action = resolveRaidJoinAction(member, raid, { inShield: false });
  if (!isBypassed(cfg, member)) {
    await (applyRaidPunish(member, action, "Protection: Raid Koruma") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  if (action.lock) {
    const lockMs = resolveRaidShieldDurationMs(raid);
    await (lockRaidChannels(member.guild, cfg, lockMs) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  const shieldState = activateRaidShield(member.guild.id, resolveRaidShieldDurationMs(raid), {
    byUserId: null,
    reason: "join_spike",
  });
  if (shieldState) {
    await sendLog(
      cfg,
      member.guild,
      `Raid Shield aktif edildi (${Math.round((shieldState.until - Date.now()) / 1000)}s).`
    );
  }
}

async function onGuildMemberUpdateEvent(oldMember, newMember, client) {
  return onGuildMemberUpdate(oldMember, newMember, client.db);
}

async function onRoleUpdateEvent(oldRole, newRole, client) {
  return onRoleUpdateEvent2(oldRole, newRole, client);
}

async function onGuildUpdateEvent(oldGuild, newGuild, client) {
  return onGuildUpdate(oldGuild, newGuild, client.db);
}

async function onWebhookUpdateEvent(channel, client) {
  const guild = channel?.guild;
  if (!guild) return;

  const cfg = await getConfig(client.db, guild.id);
  if (!cfg?.toggles?.webhook) return;

  const entry = await fetchWebhookAuditForChannel(guild, channel?.id);

  const executorId = entry?.executor?.id;
  if (!executorId) return;
  const meId = guild.members?.me?.id || guild.client?.user?.id || null;
  if (meId && executorId === meId) return;

  const executorMember = await getGuildMember(guild, executorId);
  if (isWhitelisted(cfg, executorId, executorMember, guild)) return;

  const webhookId = entry?.target?.id || entry?.extra?.webhook?.id || null;
  let reverted = false;
  if (webhookId) {
    const hooks = await (guild.fetchWebhooks() || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    const hook = hooks?.get?.(webhookId) || null;
    if (hook) {
      await (hook.delete("Protection: Izinsiz webhook islemi") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      reverted = true;
    }
  }

  const mode = cfg?.punish?.mode || "kick";
  await sendLog(
    cfg,
    guild,
    `Webhook islemi tespit edildi. Yapan: <@${executorId}>${reverted ? " | Webhook silindi." : ""}`
  );
  if (mode === "ban") await (executorMember?.ban({ reason: "Protection: Webhook Korumasi" }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  else if (mode === "kick") await (executorMember?.kick("Protection: Webhook Korumasi") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
}

async function onChannelUpdateEvent(oldChannel, newChannel, client) {
  const guild = newChannel?.guild;
  if (!guild) return;

  const cfg = await getConfig(client.db, guild.id);
  if (!cfg?.toggles?.snapshot) return;

  const before = normalizeOverwrites(oldChannel);
  const current = normalizeOverwrites(newChannel);
  if (sameOverwrites(before, current)) return;

  const snaps = getSnapshots(cfg);
  let snap = snaps.channels?.[newChannel.id];

  // Ilk degisiklikte baseline olarak degisiklik-oncesi izinleri sakla.
  if (!snap?.overwrites) {
    snap = { overwrites: before };
    snaps.channels[newChannel.id] = snap;
    await saveConfig(client.db, guild.id, cfg);
  }

  if (sameOverwrites(current, snap.overwrites)) return;

  const entry = await fetchAuditEntryForTarget(guild, AuditLogEvent.ChannelUpdate, newChannel.id);
  const executorId = entry?.executor?.id;

  const meId = guild.members?.me?.id || guild.client?.user?.id || null;
  if (meId && executorId === meId) return;

  if (executorId) {
    const executorMember = await getGuildMember(guild, executorId);
    if (isWhitelisted(cfg, executorId, executorMember, guild)) {
      // Whitelist degisikligi kabul edilir, snapshot yeni duruma cekilir.
      snaps.channels[newChannel.id] = { overwrites: current };
      await saveConfig(client.db, guild.id, cfg);
      return;
    }
  }

  await restoreChannelFromSnapshot(newChannel, snap);
  await sendLog(
    cfg,
    guild,
    `Izin Snapshot: Kanal izinleri geri alindi. Kanal: <#${newChannel.id}> | Yapan: ${executorId ? `<@${executorId}>` : "Bilinmiyor"}`
  );
}

async function onRoleUpdateEvent2(oldRole, newRole, client) {
  const guild = newRole?.guild;
  if (!guild) return;

  const cfg = await getConfig(client.db, guild.id);
  if (!cfg?.toggles?.snapshot) return;

  const beforePerms = String(oldRole?.permissions?.bitfield || "0");
  const currentPerms = String(newRole?.permissions?.bitfield || "0");
  if (beforePerms === currentPerms) return;

  const snaps = getSnapshots(cfg);
  let snap = snaps.roles?.[newRole.id];

  // Ilk degisiklikte baseline olarak degisiklik-oncesi izinleri sakla.
  if (!snap?.permissions) {
    snap = { permissions: beforePerms };
    snaps.roles[newRole.id] = snap;
    await saveConfig(client.db, guild.id, cfg);
  }

  if (currentPerms === snap.permissions) return;

  const entry = await fetchAuditEntryForTarget(guild, AuditLogEvent.RoleUpdate, newRole.id);
  const executorId = entry?.executor?.id;

  const meId = guild.members?.me?.id || guild.client?.user?.id || null;
  if (meId && executorId === meId) return;

  if (executorId) {
    const executorMember = await getGuildMember(guild, executorId);
    if (isWhitelisted(cfg, executorId, executorMember, guild)) {
      // Whitelist degisikligi kabul edilir, snapshot yeni duruma cekilir.
      snaps.roles[newRole.id] = { permissions: currentPerms };
      await saveConfig(client.db, guild.id, cfg);
      return;
    }
  }

  await restoreRoleFromSnapshot(newRole, snap);
  await sendLog(
    cfg,
    guild,
    `Izin Snapshot: Rol izinleri geri alindi. Rol: **${newRole.name}** | Yapan: ${executorId ? `<@${executorId}>` : "Bilinmiyor"}`
  );
}

module.exports = {
  init,
  onReady: onReadyEvent,
  onGuildCreate: onGuildCreateEvent,
  sendOrUpdatePanel,
  sendOrUpdateCombinedPanel,
  handleLimitUI,
  onMessage,
  onMessageUpdate: onMessageUpdateEvent,
  onChannelCreate: onChannelCreateEvent,
  onChannelUpdate: onChannelUpdateEvent,
  onChannelDelete: onChannelDeleteEvent,
  onRoleCreate: onRoleCreateEvent,
  onRoleDelete: onRoleDeleteEvent,
  onWebhookUpdate: onWebhookUpdateEvent,
  onGuildBanAdd: onGuildBanAddEvent,
  onGuildMemberRemove: onGuildMemberRemoveEvent,
  onGuildMemberAdd: onGuildMemberAddEvent,
  onGuildMemberUpdate: onGuildMemberUpdateEvent,
  onRoleUpdate: onRoleUpdateEvent,
  onGuildUpdate: onGuildUpdateEvent,
  activatePanicMode,
  deactivatePanicMode,
  getPanicModeState,
  __private: {
    shouldFetchMutedMember,
    resolveRaidShieldDurationMs,
    resolveRaidYoungAccountMaxAgeMs,
    isYoungRaidAccount,
    resolveRaidJoinAction,
    activateRaidShield,
    getActiveRaidShield,
    clearRaidShield,
  },
};







