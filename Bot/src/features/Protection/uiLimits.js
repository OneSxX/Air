const {
  PermissionFlagsBits,
  ChannelType,
  AutoModerationRuleTriggerType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const { getConfig, setConfig } = require("./database");
const { renderPanels, renderCombinedPanel } = require("./panel");
const {
  panelTypeFromSelectId,
  getSinglePanelTypeFromMessage,
  isCombinedPanelMessage,
} = require("./panelMessageMode");
const { normalizeAllowedLinks } = require("./guards/linkEngel");
const { normalizeProfanityLevel } = require("./guards/kufurEngel");
const { LINK_AUTOMOD_RULE_NAME, syncLinkAutoModRule } = require("./autoModLinks");
const { INVITE_AUTOMOD_RULE_NAME, syncInviteAutoModRule } = require("./autoModInvite");
const { PROFANITY_AUTOMOD_RULE_NAME, syncProfanityAutoModRule } = require("./autoModProfanity");
const { MENTIONS_AUTOMOD_RULE_NAME, syncMentionsAutoModRule } = require("./autoModMentions");

const ACTION_LABEL = {
  chDel: "Kanal Silme Sınırı Koruma",
  chCreate: "Kanal Oluşturma Sınırı Koruma",
  roleDel: "Rol Silme Sınırı Koruma",
  roleCreate: "Rol Oluşturma Sınırı Koruma",
  ban: "Ban Sınırı Koruma",
  kick: "Kick Sınırı Koruma",
};

const LIMIT_KEYS = new Set(Object.keys(ACTION_LABEL));

const TOGGLE_KEYS = new Set([
  "caps",
  "links",
  "invite",
  "profanity",
  "emoji",
  "mentions",
  "flood",
  "spam",
  "everyone",
  "bot",
  "rolegive",
  "vanity",
  "chDel",
  "chCreate",
  "roleDel",
  "roleCreate",
  "ban",
  "kick",
  "antiRaid",
  "webhook",
  "snapshot",
]);

const CAPS_DEFAULTS = { minLetters: 10, ratio: 0.7 };
const RAID_DEFAULTS = { windowMs: 15_000, maxJoins: 6, action: "kick", lockdownMs: 300_000 };
const SPAM_DEFAULTS = { maxMessages: 5, perSeconds: 10 };
const FLOOD_DEFAULTS = { maxMessages: 5, windowMs: 7000 };
const LINKS_DEFAULTS = { maxMessages: 5, perSeconds: 10, allowedLinks: [] };
const PROFANITY_DEFAULTS = { level: "orta" };
const EMOJI_DEFAULTS = { maxCount: 6, perSeconds: 5 };
const MENTIONS_DEFAULTS = { maxCount: 5, perSeconds: 5 };
const EVERYONE_DEFAULTS = { maxCount: 0, perSeconds: 5 };

const CAPS_SETTINGS_MODAL_ID = "settings:caps:save";
const CAPS_DISABLE_CONFIRM_ID = "prot:caps:disable:confirm";
const CAPS_EXEMPT_ROLES_SELECT_ID = "caps:exempt:roles";
const CAPS_EXEMPT_CHANNELS_SELECT_ID = "caps:exempt:channels";
const LINKS_EXEMPT_ROLES_SELECT_ID = "links:exempt:roles";
const LINKS_EXEMPT_CHANNELS_SELECT_ID = "links:exempt:channels";
const LINKS_DISABLE_CONFIRM_ID = "prot:links:disable:confirm";
const INVITE_DISABLE_CONFIRM_ID = "prot:invite:disable:confirm";
const PROFANITY_DISABLE_CONFIRM_ID = "prot:profanity:disable:confirm";
const PROFANITY_EXEMPT_ROLES_SELECT_ID = "profanity:exempt:roles";
const PROFANITY_EXEMPT_CHANNELS_SELECT_ID = "profanity:exempt:channels";
const EMOJI_EXEMPT_ROLES_SELECT_ID = "emoji:exempt:roles";
const EMOJI_EXEMPT_CHANNELS_SELECT_ID = "emoji:exempt:channels";
const MENTIONS_EXEMPT_ROLES_SELECT_ID = "mentions:exempt:roles";
const MENTIONS_EXEMPT_CHANNELS_SELECT_ID = "mentions:exempt:channels";
const FLOOD_EXEMPT_ROLES_SELECT_ID = "flood:exempt:roles";
const FLOOD_EXEMPT_CHANNELS_SELECT_ID = "flood:exempt:channels";
const SPAM_EXEMPT_ROLES_SELECT_ID = "spam:exempt:roles";
const SPAM_EXEMPT_CHANNELS_SELECT_ID = "spam:exempt:channels";
const EVERYONE_EXEMPT_ROLES_SELECT_ID = "everyone:exempt:roles";
const EVERYONE_EXEMPT_CHANNELS_SELECT_ID = "everyone:exempt:channels";
const EMOJI_DISABLE_CONFIRM_ID = "prot:emoji:disable:confirm";
const MENTIONS_DISABLE_CONFIRM_ID = "prot:mentions:disable:confirm";
const SPAM_DISABLE_CONFIRM_ID = "prot:spam:disable:confirm";
const FLOOD_DISABLE_CONFIRM_ID = "prot:flood:disable:confirm";
const EVERYONE_DISABLE_CONFIRM_ID = "prot:everyone:disable:confirm";
const RAID_DISABLE_CONFIRM_ID = "prot:raid:disable:confirm";
const LIMIT_DISABLE_PREFIX = "prot:limit:disable";
const LIMIT_EDIT_PREFIX = "prot:limit:edit";
const CHAT_EDIT_PREFIX = "prot:chat:edit";
const RAID_EDIT_ID = "prot:raid:edit";

const CHAT_TIMEOUT_KEYS = new Set([
  "caps",
  "links",
  "invite",
  "profanity",
  "emoji",
  "mentions",
  "flood",
  "spam",
  "everyone",
]);

const CHAT_DISABLE_BUTTONS = {
  caps: { id: CAPS_DISABLE_CONFIRM_ID, label: "Caps Lock Korumayı Kapat" },
  links: { id: LINKS_DISABLE_CONFIRM_ID, label: "Link Korumayı Kapat" },
  invite: { id: INVITE_DISABLE_CONFIRM_ID, label: "Invite Engelini Kapat" },
  profanity: { id: PROFANITY_DISABLE_CONFIRM_ID, label: "Küfür Engelini Kapat" },
  emoji: { id: EMOJI_DISABLE_CONFIRM_ID, label: "Emoji Korumayı Kapat" },
  mentions: { id: MENTIONS_DISABLE_CONFIRM_ID, label: "Etiket Korumayı Kapat" },
  flood: { id: FLOOD_DISABLE_CONFIRM_ID, label: "Flood Korumayı Kapat" },
  spam: { id: SPAM_DISABLE_CONFIRM_ID, label: "Spam Korumayı Kapat" },
  everyone: { id: EVERYONE_DISABLE_CONFIRM_ID, label: "Everyone Korumayı Kapat" },
};

const CHAT_LABEL = {
  caps: "Caps Lock koruma",
  links: "Link koruma",
  invite: "Invite engeli",
  profanity: "Küfür engeli",
  emoji: "Emoji koruma",
  mentions: "Etiket koruma",
  flood: "Flood koruma",
  spam: "Spam koruma",
  everyone: "Everyone koruma",
};

const CHAT_PANEL_RULE_KEYS = new Set([
  "caps",
  "links",
  "invite",
  "profanity",
  "emoji",
  "mentions",
  "flood",
  "spam",
  "everyone",
]);

const SERVER_PANEL_RULE_KEYS = new Set([
  "bot",
  "rolegive",
  "vanity",
  "antiRaid",
  "webhook",
  "snapshot",
  "raid",
]);

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
const MIN_TIMEOUT_MS = 10 * 1000;
const LINKS_FIXED_WINDOW_SECONDS = 10;
const MAX_AUTOMOD_EXEMPT_IDS = 50;
const AUTOMOD_PULL_TIMEOUT_MS = 1200;
const INTERACTION_CFG_TIMEOUT_MS = 1200;
const LOGS_CFG_KEY = (gid) => `logs_cfg_${gid}`;
const LOG_CATEGORY_NAME_FALLBACK = "loglar";
const REQUIRED_LOG_EXEMPT_RULES = new Set(["links", "invite", "profanity"]);
const CHAT_TIMEOUT_INPUT_LABEL = "Timeout süresi (0=kapalı, örn: 5m 10h 7d 2w)";
const CHAT_TIMEOUT_INPUT_PLACEHOLDER = "Birim: m=minute h=hours d=days w=week";
const CHAT_MUTE_INPUT_LABEL = "Muted rolü verilsin mi? (0/1, kapalı/açık)";
const CHAT_MUTE_INPUT_PLACEHOLDER = "0 = kapalı, 1 = açık";
const CHAT_MUTE_DURATION_INPUT_LABEL = "Muted rol süresi (0=kapalı, örn: 5m 10h 7d 2w)";
const CHAT_MUTE_DURATION_INPUT_PLACEHOLDER = "Birim: m=minute h=hours d=days w=week";

function parseDuration(input) {
  const m = String(input).trim().toLowerCase().match(/^(\d+)\s*([smhdw])$/);
  if (!m) return null;

  const n = parseInt(m[1], 10);
  const unit = m[2];

  const mult =
    unit === "s" ? 1000 :
    unit === "m" ? 60_000 :
    unit === "h" ? 3_600_000 :
    unit === "d" ? 86_400_000 :
    604_800_000;

  return n * mult;
}

function parseSecondsOrDuration(input) {
  const v = String(input).trim().toLowerCase();
  if (/^\d+$/.test(v)) return parseInt(v, 10) * 1000;
  return parseDuration(v);
}

function getFieldValue(interaction, id, fallback = "") {
  try {
    return interaction.fields.getTextInputValue(id);
  } catch {
    return fallback;
  }
}

function parseTimeoutMs(input) {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw || raw === "0" || raw === "off" || raw === "kapali" || raw === "kapalı") return 0;

  const unitMatch = raw.match(/^(\d+)\s*([mhdw])$/);
  if (!unitMatch) return null;

  const ms = parseDuration(raw);
  if (!ms) return null;
  if (ms < MIN_TIMEOUT_MS || ms > MAX_TIMEOUT_MS) return null;
  return ms;
}

function parseBinaryFlag(input) {
  const raw = String(input || "").trim();
  if (raw === "0") return 0;
  if (raw === "1") return 1;
  return null;
}

function parseBinaryFlagWithSavedFallback(rawInput, savedFlag) {
  const raw = String(rawInput || "").trim();
  if (!raw) {
    const saved = Number(savedFlag);
    if (saved === 0 || saved === 1) return saved;
    return 0;
  }
  return parseBinaryFlag(raw);
}

function parseMuteConfigWithSavedFallback(rawFlagInput, rawDurationInput, savedFlag, savedDurationMs) {
  const flag = parseBinaryFlagWithSavedFallback(rawFlagInput, savedFlag);
  if (flag === null) return null;
  if (flag !== 1) return { flag: 0, durationMs: 0 };

  const durationMs = parseTimeoutWithSavedFallback(rawDurationInput, savedDurationMs);
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  return { flag: 1, durationMs };
}

function isZeroInput(input) {
  return String(input || "").trim() === "0";
}

function parseIntWithSavedFallback(rawInput, savedValue) {
  const parsed = parseInt(String(rawInput || "").trim(), 10);
  if (parsed === 0) {
    const saved = Number(savedValue);
    if (Number.isFinite(saved) && saved > 0) return Math.round(saved);
  }
  return parsed;
}

function parseTimeoutWithSavedFallback(rawInput, savedMs) {
  if (isZeroInput(rawInput)) {
    const saved = Number(savedMs);
    if (Number.isFinite(saved) && saved > 0) return saved;
  }
  return parseTimeoutMs(rawInput);
}

function parseSecondsOrDurationWithSavedFallback(rawInput, savedMs) {
  if (isZeroInput(rawInput)) {
    const saved = Number(savedMs);
    if (Number.isFinite(saved) && saved > 0) return saved;
  }
  return parseSecondsOrDuration(rawInput);
}

function parseCapsRatioWithSavedFallback(rawInput, savedRatio) {
  if (isZeroInput(rawInput)) {
    const saved = Number(savedRatio);
    if (Number.isFinite(saved) && saved > 0 && saved <= 1) return saved;
  }
  return parseCapsRatio(rawInput);
}

function parseProfanityLevelWithSavedFallback(rawInput, savedLevel) {
  const raw = String(rawInput || "").trim();
  const fallbackLevel = normalizeProfanityLevel(savedLevel);
  if (!raw || raw === "0") return fallbackLevel;
  return normalizeProfanityLevel(raw, fallbackLevel);
}

function formatAllowedLinksForInput(list, maxLen = 1000) {
  const normalized = normalizeAllowedLinks(list || []);
  if (!normalized.length) return "0";

  const joined = normalized.join(", ");
  if (joined.length <= maxLen) return joined;

  let clipped = "";
  for (const item of normalized) {
    const next = clipped ? `${clipped}, ${item}` : item;
    if (next.length > maxLen) break;
    clipped = next;
  }
  return clipped || "0";
}

function parseAllowedLinksWithSavedFallback(rawInput, savedList) {
  const raw = String(rawInput || "").trim();
  if (!raw || raw === "0") {
    const saved = normalizeAllowedLinks(savedList || []);
    return saved.length ? saved : [];
  }
  return normalizeAllowedLinks(raw);
}

function getConfiguredTimeoutMs(cfg, key) {
  const v = Number(cfg?.timeouts?.[key]);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(v, MAX_TIMEOUT_MS);
}

function getConfiguredMuteFlag(cfg, key) {
  return Number(cfg?.muteOnViolation?.[key]) === 1 ? 1 : 0;
}

function getConfiguredMuteDurationMs(cfg, key) {
  const v = Number(cfg?.muteDurations?.[key]);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(v, MAX_TIMEOUT_MS);
}

function formatMuteDurationFieldValue(durationMs) {
  const safeDuration = Number(durationMs);
  if (!Number.isFinite(safeDuration) || safeDuration <= 0) return "0";
  return formatDurationShort(safeDuration);
}

function formatMuteSummary(flag, durationMs) {
  if (Number(flag) !== 1) return "kapalı";
  return formatDurationShort(durationMs);
}

function formatDurationShort(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "kapalı";

  if (n % 604_800_000 === 0) return `${Math.round(n / 604_800_000)}w`;
  if (n % 86_400_000 === 0) return `${Math.round(n / 86_400_000)}d`;
  if (n % 3_600_000 === 0) return `${Math.round(n / 3_600_000)}h`;
  if (n % 60_000 === 0) return `${Math.round(n / 60_000)}m`;
  return `${Math.round(n / 1000)}s`;
}

function parseCapsRatio(input) {
  const raw = String(input || "").trim().replace(",", ".").replace("%", "");
  if (!raw) return null;

  const num = Number(raw);
  if (!Number.isFinite(num)) return null;

  let ratio = null;
  if (num >= 1 && num <= 100) {
    ratio = num / 100;
  } else if (num > 0 && num <= 1) {
    ratio = num;
  }
  if (!Number.isFinite(ratio) || ratio < 0.01 || ratio > 1) return null;

  return Math.round(ratio * 100) / 100;
}

function normalizeCapsConfig(cfg) {
  const minRaw = Number(cfg?.caps?.minLetters);
  const ratioRaw = Number(cfg?.caps?.ratio);

  const minLetters = Number.isFinite(minRaw)
    ? Math.max(1, Math.min(100, Math.round(minRaw)))
    : CAPS_DEFAULTS.minLetters;

  const ratio = Number.isFinite(ratioRaw)
    ? Math.max(0.01, Math.min(1, ratioRaw))
    : CAPS_DEFAULTS.ratio;

  return { minLetters, ratio };
}

function normalizeLinksConfig(cfg) {
  const maxRaw = Number(cfg?.links?.maxMessages);
  const allowedLinks = normalizeAllowedLinks(
    cfg?.links?.allowedLinks || cfg?.links?.allowList || cfg?.links?.allowed || LINKS_DEFAULTS.allowedLinks
  );

  const maxMessages = Number.isFinite(maxRaw)
    ? Math.max(1, Math.min(50, Math.round(maxRaw)))
    : LINKS_DEFAULTS.maxMessages;

  const perSeconds = LINKS_FIXED_WINDOW_SECONDS;

  return { maxMessages, perSeconds, allowedLinks };
}

function normalizeProfanityConfig(cfg) {
  const level = normalizeProfanityLevel(cfg?.profanity?.level, PROFANITY_DEFAULTS.level);
  return { level };
}

function normalizeEmojiConfig(cfg) {
  const maxRaw = Number(cfg?.emoji?.maxCount);
  const perRaw = Number(cfg?.emoji?.perSeconds);

  const maxCount = Number.isFinite(maxRaw)
    ? Math.max(2, Math.min(100, Math.round(maxRaw)))
    : EMOJI_DEFAULTS.maxCount;

  const perSeconds = Number.isFinite(perRaw)
    ? Math.max(2, Math.min(120, Math.round(perRaw)))
    : EMOJI_DEFAULTS.perSeconds;

  return { maxCount, perSeconds };
}

function normalizeMentionsConfig(cfg) {
  const maxRaw = Number(cfg?.mentions?.maxCount);
  const perRaw = Number(cfg?.mentions?.perSeconds);

  const maxCount = Number.isFinite(maxRaw)
    ? Math.max(1, Math.min(100, Math.round(maxRaw)))
    : MENTIONS_DEFAULTS.maxCount;

  const perSeconds = Number.isFinite(perRaw)
    ? Math.max(2, Math.min(120, Math.round(perRaw)))
    : MENTIONS_DEFAULTS.perSeconds;

  return { maxCount, perSeconds };
}

function normalizeEveryoneConfig(cfg) {
  const maxRaw = Number(cfg?.everyone?.maxCount);
  const perRaw = Number(cfg?.everyone?.perSeconds);

  const maxCount = Number.isFinite(maxRaw)
    ? Math.max(0, Math.min(20, Math.round(maxRaw)))
    : EVERYONE_DEFAULTS.maxCount;

  const perSeconds = Number.isFinite(perRaw)
    ? Math.max(2, Math.min(120, Math.round(perRaw)))
    : EVERYONE_DEFAULTS.perSeconds;

  return { maxCount, perSeconds };
}

function ensureConfiguredState(cfg) {
  cfg.configured ||= {};
  cfg.configured.limits ||= {};
  return cfg.configured;
}

function markRuleConfigured(cfg, key) {
  const configured = ensureConfiguredState(cfg);
  configured[key] = true;
}

function markLimitConfigured(cfg, actionKey) {
  const configured = ensureConfiguredState(cfg);
  configured.limits[actionKey] = true;
}

function isRuleConfigured(cfg, key) {
  const explicit = cfg?.configured?.[key];
  if (explicit === true) return true;
  if (explicit === false) return false;

  if (key === "caps") {
    const caps = normalizeCapsConfig(cfg);
    return (
      caps.minLetters !== CAPS_DEFAULTS.minLetters ||
      Math.abs(caps.ratio - CAPS_DEFAULTS.ratio) > 0.0001 ||
      getConfiguredTimeoutMs(cfg, "caps") > 0 ||
      getConfiguredMuteFlag(cfg, "caps") === 1 ||
      getConfiguredMuteDurationMs(cfg, "caps") > 0
    );
  }

  if (key === "spam") {
    const spam = cfg?.spam || {};
    return (
      Number(spam.maxMessages || SPAM_DEFAULTS.maxMessages) !== SPAM_DEFAULTS.maxMessages ||
      Number(spam.perSeconds || SPAM_DEFAULTS.perSeconds) !== SPAM_DEFAULTS.perSeconds ||
      getConfiguredTimeoutMs(cfg, "spam") > 0 ||
      getConfiguredMuteFlag(cfg, "spam") === 1 ||
      getConfiguredMuteDurationMs(cfg, "spam") > 0
    );
  }

  if (key === "flood") {
    const flood = cfg?.flood || {};
    return (
      Number(flood.maxMessages || FLOOD_DEFAULTS.maxMessages) !== FLOOD_DEFAULTS.maxMessages ||
      Number(flood.windowMs || FLOOD_DEFAULTS.windowMs) !== FLOOD_DEFAULTS.windowMs ||
      getConfiguredTimeoutMs(cfg, "flood") > 0 ||
      getConfiguredMuteFlag(cfg, "flood") === 1 ||
      getConfiguredMuteDurationMs(cfg, "flood") > 0
    );
  }

  if (key === "links") {
    const links = normalizeLinksConfig(cfg);
    return (
      links.maxMessages !== LINKS_DEFAULTS.maxMessages ||
      links.perSeconds !== LINKS_DEFAULTS.perSeconds ||
      links.allowedLinks.length > 0 ||
      getConfiguredTimeoutMs(cfg, "links") > 0 ||
      getConfiguredMuteFlag(cfg, "links") === 1 ||
      getConfiguredMuteDurationMs(cfg, "links") > 0
    );
  }

  if (key === "invite") {
    return (
      getConfiguredTimeoutMs(cfg, "invite") > 0 ||
      getConfiguredMuteFlag(cfg, "invite") === 1 ||
      getConfiguredMuteDurationMs(cfg, "invite") > 0
    );
  }

  if (key === "profanity") {
    const profanity = normalizeProfanityConfig(cfg);
    return (
      profanity.level !== PROFANITY_DEFAULTS.level ||
      getConfiguredTimeoutMs(cfg, "profanity") > 0 ||
      getConfiguredMuteFlag(cfg, "profanity") === 1 ||
      getConfiguredMuteDurationMs(cfg, "profanity") > 0
    );
  }

  if (key === "emoji") {
    const emoji = normalizeEmojiConfig(cfg);
    return (
      emoji.maxCount !== EMOJI_DEFAULTS.maxCount ||
      emoji.perSeconds !== EMOJI_DEFAULTS.perSeconds ||
      getConfiguredTimeoutMs(cfg, "emoji") > 0 ||
      getConfiguredMuteFlag(cfg, "emoji") === 1 ||
      getConfiguredMuteDurationMs(cfg, "emoji") > 0
    );
  }

  if (key === "mentions") {
    const mentions = normalizeMentionsConfig(cfg);
    return (
      mentions.maxCount !== MENTIONS_DEFAULTS.maxCount ||
      mentions.perSeconds !== MENTIONS_DEFAULTS.perSeconds ||
      getConfiguredTimeoutMs(cfg, "mentions") > 0 ||
      getConfiguredMuteFlag(cfg, "mentions") === 1 ||
      getConfiguredMuteDurationMs(cfg, "mentions") > 0
    );
  }

  if (key === "everyone") {
    const everyone = normalizeEveryoneConfig(cfg);
    return (
      everyone.maxCount !== EVERYONE_DEFAULTS.maxCount ||
      everyone.perSeconds !== EVERYONE_DEFAULTS.perSeconds ||
      getConfiguredTimeoutMs(cfg, "everyone") > 0 ||
      getConfiguredMuteFlag(cfg, "everyone") === 1 ||
      getConfiguredMuteDurationMs(cfg, "everyone") > 0
    );
  }

  if (key === "raid") {
    const raid = cfg?.raid || {};
    return (
      Number(raid.maxJoins || RAID_DEFAULTS.maxJoins) !== RAID_DEFAULTS.maxJoins ||
      Number(raid.windowMs || RAID_DEFAULTS.windowMs) !== RAID_DEFAULTS.windowMs ||
      String(raid.action || RAID_DEFAULTS.action) !== RAID_DEFAULTS.action ||
      Number(raid.lockdownMs || RAID_DEFAULTS.lockdownMs) !== RAID_DEFAULTS.lockdownMs
    );
  }

  return false;
}

function isLimitConfigured(cfg, actionKey) {
  const explicit = cfg?.configured?.limits?.[actionKey];
  if (explicit === true) return true;
  if (explicit === false) return false;

  const rule = cfg?.limits?.[actionKey];
  return Number.isFinite(Number(rule?.limit)) && Number(rule.limit) > 0 &&
    Number.isFinite(Number(rule?.windowMs)) && Number(rule.windowMs) > 0;
}

function normalizeRaidAction(value) {
  const x = String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "+");

  if (x === "kick") return "kick";
  if (x === "ban") return "ban";
  if (x === "kilitle" || x === "lock" || x === "lockdown") return "kilitle";
  if (x === "k+k") return "kick+kilitle";
  if (x === "b+k") return "ban+kilitle";
  if (x === "kick+kilitle" || x === "kick+lock") return "kick+kilitle";
  if (x === "ban+kilitle" || x === "ban+lock") return "ban+kilitle";
  return null;
}

function formatDurationMhdw(ms, opts = {}) {
  const allowZero = !!opts.allowZero;
  const raw = Number(ms || 0);
  if (!Number.isFinite(raw) || raw <= 0) return allowZero ? "0" : "1m";
  const safe = Math.max(60_000, Math.ceil(raw / 60_000) * 60_000);
  return formatDurationShort(safe);
}

function isAdmin(interaction) {
  return interaction?.memberPermissions?.has?.(PermissionFlagsBits.Administrator);
}

function panelTypeFromMessage(msg) {
  return getSinglePanelTypeFromMessage(msg);
}

function panelTypeFromRuleKey(key) {
  if (CHAT_PANEL_RULE_KEYS.has(key)) return "chat";
  if (SERVER_PANEL_RULE_KEYS.has(key)) return "server";
  if (LIMIT_KEYS.has(key)) return "limits";
  return null;
}

function panelTypeFromInteraction(interaction) {
  const direct = panelTypeFromSelectId(interaction?.customId);
  if (direct) return direct;

  const messageType = panelTypeFromMessage(interaction?.message);
  if (messageType) return messageType;

  const id = String(interaction?.customId || "");
  if (!id) return null;

  if (id === "prot:all:setup" || id === "prot:all:disable") return "limits";
  if (id === RAID_DISABLE_CONFIRM_ID || id === RAID_EDIT_ID) return "server";
  if (
    id === CAPS_EXEMPT_ROLES_SELECT_ID ||
    id === CAPS_EXEMPT_CHANNELS_SELECT_ID ||
    id === LINKS_EXEMPT_ROLES_SELECT_ID ||
    id === LINKS_EXEMPT_CHANNELS_SELECT_ID ||
    id === PROFANITY_EXEMPT_ROLES_SELECT_ID ||
    id === PROFANITY_EXEMPT_CHANNELS_SELECT_ID ||
    id === EMOJI_EXEMPT_ROLES_SELECT_ID ||
    id === EMOJI_EXEMPT_CHANNELS_SELECT_ID ||
    id === MENTIONS_EXEMPT_ROLES_SELECT_ID ||
    id === MENTIONS_EXEMPT_CHANNELS_SELECT_ID ||
    id === FLOOD_EXEMPT_ROLES_SELECT_ID ||
    id === FLOOD_EXEMPT_CHANNELS_SELECT_ID ||
    id === SPAM_EXEMPT_ROLES_SELECT_ID ||
    id === SPAM_EXEMPT_CHANNELS_SELECT_ID ||
    id === EVERYONE_EXEMPT_ROLES_SELECT_ID ||
    id === EVERYONE_EXEMPT_CHANNELS_SELECT_ID
  ) {
    return "chat";
  }

  for (const def of Object.values(CHAT_DISABLE_BUTTONS)) {
    if (id === def.id) return "chat";
  }

  if (id.startsWith(`${CHAT_EDIT_PREFIX}:`)) return "chat";

  if (id.startsWith(`${LIMIT_DISABLE_PREFIX}:`)) return "limits";
  if (id.startsWith(`${LIMIT_EDIT_PREFIX}:`)) return "limits";

  if (id.startsWith("settings:") && id.endsWith(":save")) {
    const parts = id.split(":");
    return panelTypeFromRuleKey(parts[1] || "");
  }

  if (id.startsWith("limit:") && id.endsWith(":save")) return "limits";
  if (id.startsWith("limit:") && id.endsWith(":exempt")) return "limits";

  return null;
}

async function refreshPanels(interaction, client, cfg, opts = {}) {
  const sendSingle = client?.features?.Protection?.sendOrUpdatePanel;
  const sendCombined = client?.features?.Protection?.sendOrUpdateCombinedPanel;

  const combinedMode = isCombinedPanelMessage(interaction?.message);
  if (combinedMode && typeof sendCombined === "function") {
    await sendCombined(interaction, cfg);
    return;
  }

  if (typeof sendSingle !== "function") return;

  const explicit = String(opts?.only || "").trim();
  const inferred = panelTypeFromInteraction(interaction);
  const only = ["chat", "server", "limits"].includes(explicit) ? explicit : inferred;

  if (only) {
    await sendSingle(interaction, cfg, { only });
    return;
  }

  await sendSingle(interaction, cfg);
}

async function resetSelectMenuState(interaction, client, cfgHint = null) {
  const msg = interaction?.message;
  if (!msg?.edit) return;

  const cfg = cfgHint || await getConfig(client.db, interaction.guildId);

  if (isCombinedPanelMessage(msg)) {
    const payload = renderCombinedPanel(cfg, { actor: interaction?.user || null, guild: interaction?.guild || null });
    await (msg.edit(payload) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    return;
  }

  const panelType =
    panelTypeFromSelectId(interaction?.customId) ||
    panelTypeFromMessage(msg);
  if (!panelType) return;

  const panels = renderPanels(cfg, { actor: interaction?.user || null, guild: interaction?.guild || null });
  const payload = panels?.[panelType];
  if (!payload) return;

  await (msg.edit(payload) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
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

function buildSnapshotsFromGuild(guild) {
  const snapshots = { roles: {}, channels: {} };

  for (const role of guild.roles.cache.values()) {
    snapshots.roles[role.id] = {
      permissions: String(role.permissions?.bitfield || "0"),
    };
  }

  for (const channel of guild.channels.cache.values()) {
    snapshots.channels[channel.id] = {
      overwrites: normalizeOverwrites(channel),
    };
  }

  return snapshots;
}

function normalizeSnowflakeIdList(raw, max = MAX_AUTOMOD_EXEMPT_IDS) {
  const src = Array.isArray(raw)
    ? raw
    : (raw?.values ? Array.from(raw.values()) : []);

  const out = [];
  for (const item of src) {
    const id = String(
      typeof item === "string" || typeof item === "number"
        ? item
        : (item?.id || "")
    ).trim();

    if (!/^\d{15,25}$/.test(id)) continue;
    if (out.includes(id)) continue;
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

function mergeMandatoryChannelId(channelIds, mandatoryId, max = MAX_AUTOMOD_EXEMPT_IDS) {
  const out = normalizeSnowflakeIdList(channelIds, max);
  const id = String(mandatoryId || "").trim();
  if (!/^\d{15,25}$/.test(id)) return out;
  if (!out.includes(id)) out.push(id);
  return out.slice(0, max);
}

async function getConfigQuick(db, guildId, timeoutMs = INTERACTION_CFG_TIMEOUT_MS) {
  const fallback = new Promise((resolve) => {
    setTimeout(() => resolve(null), Math.max(100, Number(timeoutMs) || INTERACTION_CFG_TIMEOUT_MS));
  });
  const cfg = await Promise.race([getConfig(db, guildId), fallback]).catch(() => null);
  return cfg && typeof cfg === "object" ? cfg : { toggles: {} };
}

async function resolveLogsCategoryId(interaction, client) {
  const guild =
    interaction?.guild ||
    client?.guilds?.cache?.get?.(interaction?.guildId) ||
    null;
  const gid = String(interaction?.guildId || guild?.id || "").trim();
  if (!guild || !gid || !client?.db?.get) return null;

  const logsCfg = await (client.db.get(LOGS_CFG_KEY(gid)) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  const configuredId = String(logsCfg?.categoryId || "").trim();
  if (/^\d{15,25}$/.test(configuredId)) {
    const byId =
      guild.channels?.cache?.get?.(configuredId) ||
      await (guild.channels?.fetch?.(configuredId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (byId?.type === ChannelType.GuildCategory) return byId.id;
  }

  const fallback = guild.channels?.cache?.find?.(
    (ch) =>
      ch?.type === ChannelType.GuildCategory &&
      String(ch?.name || "").toLowerCase("tr").includes(LOG_CATEGORY_NAME_FALLBACK)
  ) || null;
  return fallback?.id || null;
}

async function ensureMandatoryLogExemptChannel(interaction, client, cfg, ruleKey) {
  if (!REQUIRED_LOG_EXEMPT_RULES.has(String(ruleKey || ""))) return cfg;
  const gid = String(interaction?.guildId || "").trim();
  if (!gid || !client?.db) return cfg;

  const mandatoryChannelId = await resolveLogsCategoryId(interaction, client);
  if (!mandatoryChannelId) return cfg;

  const prev = normalizeSnowflakeIdList(cfg?.[ruleKey]?.exemptChannelIds);
  const next = mergeMandatoryChannelId(prev, mandatoryChannelId);
  if (areSnowflakeListsEqual(prev, next)) return cfg;

  return setConfig(client.db, gid, {
    [ruleKey]: { exemptChannelIds: next },
  });
}

function areSnowflakeListsEqual(a, b) {
  const left = normalizeSnowflakeIdList(a);
  const right = normalizeSnowflakeIdList(b);
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

async function resolveAutoModRule(guild, savedRuleId, triggerType, ruleName) {
  if (!guild?.autoModerationRules) return null;

  const id = String(savedRuleId || "").trim();
  if (id) {
    const fromCache = guild.autoModerationRules.cache?.get?.(id) || null;
    if (fromCache && fromCache.triggerType === triggerType && fromCache.name === ruleName) {
      return fromCache;
    }

    const fetched = await (guild.autoModerationRules.fetch(id) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (fetched && fetched.triggerType === triggerType && fetched.name === ruleName) {
      return fetched;
    }
  }

  const rules = await (guild.autoModerationRules.fetch() || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!rules) return null;
  return rules.find((rule) => rule?.triggerType === triggerType && rule?.name === ruleName) || null;
}

async function pullAutoModRuleExemptsToConfig(interaction, client, cfg, ruleKey, triggerType, ruleName) {
  const guild =
    interaction?.guild ||
    client?.guilds?.cache?.get?.(interaction?.guildId) ||
    null;
  if (!guild?.id || !interaction?.guildId) return cfg;

  const savedRuleId = String(cfg?.[ruleKey]?.autoModRuleId || "").trim();
  const rule = await (resolveAutoModRule(guild, savedRuleId, triggerType, ruleName) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!rule) return cfg;

  const nextRuleId = String(rule?.id || "").trim();
  const nextRoleIds = normalizeSnowflakeIdList(rule?.exemptRoles);
  const nextChannelIds = normalizeSnowflakeIdList(rule?.exemptChannels);
  const prevRoleIds = normalizeSnowflakeIdList(cfg?.[ruleKey]?.exemptRoleIds);
  const prevChannelIds = normalizeSnowflakeIdList(cfg?.[ruleKey]?.exemptChannelIds);
  const prevRuleId = String(cfg?.[ruleKey]?.autoModRuleId || "").trim();

  if (
    nextRuleId === prevRuleId &&
    areSnowflakeListsEqual(prevRoleIds, nextRoleIds) &&
    areSnowflakeListsEqual(prevChannelIds, nextChannelIds)
  ) {
    return cfg;
  }

  return setConfig(client.db, interaction.guildId, {
    [ruleKey]: {
      autoModRuleId: nextRuleId || null,
      exemptRoleIds: nextRoleIds,
      exemptChannelIds: nextChannelIds,
    },
  });
}

async function pullAutoModExemptsByKey(interaction, client, cfg, key) {
  let merged = cfg;

  if (key === "links") {
    merged = await pullAutoModRuleExemptsToConfig(
      interaction,
      client,
      merged,
      "links",
      AutoModerationRuleTriggerType.Keyword,
      LINK_AUTOMOD_RULE_NAME
    );
    return ensureMandatoryLogExemptChannel(interaction, client, merged, "links");
  }
  if (key === "invite") {
    merged = await pullAutoModRuleExemptsToConfig(
      interaction,
      client,
      merged,
      "invite",
      AutoModerationRuleTriggerType.Keyword,
      INVITE_AUTOMOD_RULE_NAME
    );
    return ensureMandatoryLogExemptChannel(interaction, client, merged, "invite");
  }
  if (key === "profanity") {
    merged = await pullAutoModRuleExemptsToConfig(
      interaction,
      client,
      merged,
      "profanity",
      AutoModerationRuleTriggerType.Keyword,
      PROFANITY_AUTOMOD_RULE_NAME
    );
    return ensureMandatoryLogExemptChannel(interaction, client, merged, "profanity");
  }
  if (key === "mentions") {
    return pullAutoModRuleExemptsToConfig(
      interaction,
      client,
      merged,
      "mentions",
      AutoModerationRuleTriggerType.MentionSpam,
      MENTIONS_AUTOMOD_RULE_NAME
    );
  }
  return cfg;
}

async function pullAutoModExemptsByKeyFast(interaction, client, cfg, key) {
  if (!["links", "invite", "profanity", "mentions"].includes(String(key || ""))) return cfg;

  return Promise.race([
    pullAutoModExemptsByKey(interaction, client, cfg, key).catch(() => cfg),
    new Promise((resolve) => setTimeout(() => resolve(cfg), AUTOMOD_PULL_TIMEOUT_MS)),
  ]);
}

async function syncLinksAutoModWithConfig(interaction, client, cfg) {
  const guild =
    interaction?.guild ||
    client?.guilds?.cache?.get?.(interaction?.guildId) ||
    null;
  if (!guild) return { ok: false, reason: "GUILD_NOT_FOUND", cfg };

  let mergedCfg = await ensureMandatoryLogExemptChannel(interaction, client, cfg, "links").catch(() => cfg);
  const result = await syncLinkAutoModRule(guild, mergedCfg);

  if (result?.ok && interaction?.guildId) {
    const currentRuleId = String(mergedCfg?.links?.autoModRuleId || "");
    const nextRuleId = String(result?.ruleId || "");
    if (currentRuleId !== nextRuleId) {
      mergedCfg = await setConfig(client.db, interaction.guildId, {
        links: { autoModRuleId: nextRuleId || null },
      });
    }
  }

  return { ...result, cfg: mergedCfg };
}

async function syncInviteAutoModWithConfig(interaction, client, cfg) {
  const guild =
    interaction?.guild ||
    client?.guilds?.cache?.get?.(interaction?.guildId) ||
    null;
  if (!guild) return { ok: false, reason: "GUILD_NOT_FOUND", cfg };

  let mergedCfg = await ensureMandatoryLogExemptChannel(interaction, client, cfg, "invite").catch(() => cfg);
  const result = await syncInviteAutoModRule(guild, mergedCfg);

  if (result?.ok && interaction?.guildId) {
    const currentRuleId = String(mergedCfg?.invite?.autoModRuleId || "");
    const nextRuleId = String(result?.ruleId || "");
    if (currentRuleId !== nextRuleId) {
      mergedCfg = await setConfig(client.db, interaction.guildId, {
        invite: { autoModRuleId: nextRuleId || null },
      });
    }
  }

  return { ...result, cfg: mergedCfg };
}

async function syncProfanityAutoModWithConfig(interaction, client, cfg) {
  const guild =
    interaction?.guild ||
    client?.guilds?.cache?.get?.(interaction?.guildId) ||
    null;
  if (!guild) return { ok: false, reason: "GUILD_NOT_FOUND", cfg };

  let mergedCfg = await ensureMandatoryLogExemptChannel(interaction, client, cfg, "profanity").catch(() => cfg);
  const result = await syncProfanityAutoModRule(guild, mergedCfg);

  if (result?.ok && interaction?.guildId) {
    const currentRuleId = String(mergedCfg?.profanity?.autoModRuleId || "");
    const nextRuleId = String(result?.ruleId || "");
    if (currentRuleId !== nextRuleId) {
      mergedCfg = await setConfig(client.db, interaction.guildId, {
        profanity: { autoModRuleId: nextRuleId || null },
      });
    }
  }

  return { ...result, cfg: mergedCfg };
}

async function syncMentionsAutoModWithConfig(interaction, client, cfg) {
  const guild =
    interaction?.guild ||
    client?.guilds?.cache?.get?.(interaction?.guildId) ||
    null;
  if (!guild) return { ok: false, reason: "GUILD_NOT_FOUND", cfg };

  const result = await syncMentionsAutoModRule(guild, cfg);
  let mergedCfg = cfg;

  if (result?.ok && interaction?.guildId) {
    const currentRuleId = String(cfg?.mentions?.autoModRuleId || "");
    const nextRuleId = String(result?.ruleId || "");
    if (currentRuleId !== nextRuleId) {
      mergedCfg = await setConfig(client.db, interaction.guildId, {
        mentions: { autoModRuleId: nextRuleId || null },
      });
    }
  }

  return { ...result, cfg: mergedCfg };
}

function getAutoModSyncNote(result) {
  if (result?.ok) {
    if (result?.timeoutRequested && !result?.timeoutApplied) {
      if (String(result?.timeoutSkippedReason || "") === "MISSING_MODERATE_MEMBERS") {
        return "\nNot: AutoMod kurali senkronlandi ancak `Uyeleri Zaman Asimina Ugrat` yetkisi olmadigi icin Discord tarafinda zaman asimi aksiyonu eklenemedi.";
      }
      return "\nNot: AutoMod kurali senkronlandi ancak Discord tarafinda zaman asimi aksiyonu eklenemedi.";
    }
    return "";
  }

  const reason = String(result?.reason || "");
  if (reason === "MISSING_MANAGE_GUILD") {
    return "\nNot: Discord AutoMod senkronu basarisiz oldu. Botta `Sunucuyu Yönet` yetkisi yok.";
  }
  if (reason === "MISSING_MODERATE_MEMBERS") {
    return "\nNot: Discord AutoMod senkronu basarisiz oldu. Botta `Uyeleri Zaman Asimina Ugrat` yetkisi yok.";
  }
  if (reason === "AUTOMOD_UNAVAILABLE") {
    return "\nNot: Discord AutoMod senkronu basarisiz oldu. Bu sunucuda AutoMod API erisimi bulunamadi.";
  }

  const detail = String(result?.error || "").trim();
  if (detail) {
    return `\nNot: Discord AutoMod senkronu basarisiz oldu. Sebep: ${detail.slice(0, 180)}.`;
  }
  return "\nNot: Discord AutoMod senkronu basarisiz oldu.";
}

async function applyToggle(interaction, client, key, nextValue) {
  if (!TOGGLE_KEYS.has(key)) return null;

  if (!interaction.deferred && !interaction.replied) {
    await (interaction.deferUpdate() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  const gid = interaction.guildId;
  let merged = await setConfig(client.db, gid, { toggles: { [key]: nextValue } });

  if (key === "snapshot" && nextValue && interaction.guild) {
    merged.snapshots = buildSnapshotsFromGuild(interaction.guild);
    await client.db.set(`prot_cfg_${gid}`, merged);
  }

  if (key === "links") {
    const sync = await syncLinksAutoModWithConfig(interaction, client, merged);
    merged = sync?.cfg || merged;
  }
  if (key === "invite") {
    const sync = await syncInviteAutoModWithConfig(interaction, client, merged);
    merged = sync?.cfg || merged;
  }
  if (key === "profanity") {
    const sync = await syncProfanityAutoModWithConfig(interaction, client, merged);
    merged = sync?.cfg || merged;
  }
  if (key === "mentions") {
    const sync = await syncMentionsAutoModWithConfig(interaction, client, merged);
    merged = sync?.cfg || merged;
  }

  await refreshPanels(interaction, client, merged);
  return merged;
}

async function handleToggle(interaction, client, key) {
  const cfg = await getConfig(client.db, interaction.guildId);
  const current = !!cfg?.toggles?.[key];
  await applyToggle(interaction, client, key, !current);
  return true;
}

async function disableFromButton(interaction, client, key, label) {
  if (!interaction.deferred && !interaction.replied) {
    await (interaction.deferUpdate() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  const cfg = await getConfig(client.db, interaction.guildId);

  if (!cfg?.toggles?.[key]) {
    await (interaction.editReply({ content: `${label} zaten kapalı.`, components: [] }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    return true;
  }

  let merged = await setConfig(client.db, interaction.guildId, { toggles: { [key]: false } });
  if (key === "links") {
    const sync = await syncLinksAutoModWithConfig(interaction, client, merged);
    merged = sync?.cfg || merged;
  }
  if (key === "invite") {
    const sync = await syncInviteAutoModWithConfig(interaction, client, merged);
    merged = sync?.cfg || merged;
  }
  if (key === "profanity") {
    const sync = await syncProfanityAutoModWithConfig(interaction, client, merged);
    merged = sync?.cfg || merged;
  }
  if (key === "mentions") {
    const sync = await syncMentionsAutoModWithConfig(interaction, client, merged);
    merged = sync?.cfg || merged;
  }

  await (interaction.editReply({ content: `${label} kapatıldı.`, components: [] }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  await refreshPanels(interaction, client, merged);
  return true;
}

async function promptDisable(interaction, content, customId, buttonLabel, opts = {}) {
  const disableBtn = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(buttonLabel)
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(disableBtn);
  if (opts?.editCustomId) {
    const editBtn = new ButtonBuilder()
      .setCustomId(opts.editCustomId)
      .setLabel(opts.editLabel || "Koruma Ayarını Düzenle")
      .setStyle(ButtonStyle.Secondary);
    row.addComponents(editBtn);
  }

  const payload = {
    content,
    components: [row],
    ephemeral: true,
  };

  if (interaction.deferred || interaction.replied) {
    await (interaction.followUp(payload) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  } else {
    await (interaction.reply(payload) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  return true;
}

async function openChatSettingsModalForKey(interaction, client, key) {
  if (!CHAT_TIMEOUT_KEYS.has(key)) return false;
  let cfg = await getConfigQuick(client.db, interaction.guildId);
  if (key === "caps") {
    return openCapsSettingsModal(interaction, cfg, { zeroDefaults: false });
  }
  return openSettingsModal(interaction, key, cfg, { zeroDefaults: false });
}

async function handleChatToggleSelect(interaction, client, key) {
  if (!CHAT_TIMEOUT_KEYS.has(key)) return false;

  if (key === "caps") return handleCapsSelect(interaction, client);

  let cfg = await getConfigQuick(client.db, interaction.guildId);
  if (cfg?.toggles?.[key]) {
    const btn = CHAT_DISABLE_BUTTONS[key];
    return promptDisable(
      interaction,
      `${CHAT_LABEL[key]} açık. Kapatmak ister misin?`,
      btn.id,
      btn.label,
      {
        editCustomId: `${CHAT_EDIT_PREFIX}:${key}`,
        editLabel: `${CHAT_LABEL[key]} Ayarını Düzenle`,
      }
    );
  }

  return openSettingsModal(interaction, key, cfg, { zeroDefaults: !isRuleConfigured(cfg, key) });
}

async function openCapsSettingsModal(interaction, cfg, opts = {}) {
  const zeroDefaults = opts?.zeroDefaults === true;
  const caps = normalizeCapsConfig(cfg);
  const timeoutMs = getConfiguredTimeoutMs(cfg, "caps");
  const muteFlag = getConfiguredMuteFlag(cfg, "caps");
  const muteDurationMs = getConfiguredMuteDurationMs(cfg, "caps");

  const modal = new ModalBuilder()
    .setCustomId(CAPS_SETTINGS_MODAL_ID)
    .setTitle("Caps Koruma Ayarı");

  const minLetters = new TextInputBuilder()
    .setCustomId("minLetters")
    .setLabel("Min harf sayısı (1-100)")
    .setPlaceholder("Örn: 10")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(zeroDefaults ? "0" : String(caps.minLetters));

  const ratio = new TextInputBuilder()
    .setCustomId("ratio")
    .setLabel("Büyük harf oranı (%1-100)")
    .setPlaceholder("Örn: 50")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(zeroDefaults ? "0" : String(Math.round(caps.ratio * 100)));

  const timeout = new TextInputBuilder()
    .setCustomId("timeout")
    .setLabel(CHAT_TIMEOUT_INPUT_LABEL)
    .setPlaceholder(CHAT_TIMEOUT_INPUT_PLACEHOLDER)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(zeroDefaults ? "0" : (timeoutMs > 0 ? formatDurationShort(timeoutMs) : "0"));

  const muteRole = new TextInputBuilder()
    .setCustomId("muteRole")
    .setLabel(CHAT_MUTE_INPUT_LABEL)
    .setPlaceholder(CHAT_MUTE_INPUT_PLACEHOLDER)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(zeroDefaults ? "0" : String(muteFlag));

  const muteDuration = new TextInputBuilder()
    .setCustomId("muteDuration")
    .setLabel(CHAT_MUTE_DURATION_INPUT_LABEL)
    .setPlaceholder(CHAT_MUTE_DURATION_INPUT_PLACEHOLDER)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(zeroDefaults ? "0" : formatMuteDurationFieldValue(muteDurationMs));

  modal.addComponents(
    new ActionRowBuilder().addComponents(minLetters),
    new ActionRowBuilder().addComponents(ratio),
    new ActionRowBuilder().addComponents(timeout),
    new ActionRowBuilder().addComponents(muteRole),
    new ActionRowBuilder().addComponents(muteDuration)
  );

  await interaction.showModal(modal);
  return true;
}

async function handleCapsSelect(interaction, client) {
  const cfg = await getConfigQuick(client.db, interaction.guildId);
  const hasSavedCapsConfig =
    Number.isFinite(Number(cfg?.caps?.minLetters)) &&
    Number.isFinite(Number(cfg?.caps?.ratio));

  if (cfg?.toggles?.caps && hasSavedCapsConfig) {
    return promptDisable(
      interaction,
      "Caps koruma açık. Kapatmak ister misin?",
      CAPS_DISABLE_CONFIRM_ID,
      "Caps Korumayı Kapat",
      {
        editCustomId: `${CHAT_EDIT_PREFIX}:caps`,
        editLabel: "Caps Ayarını Düzenle",
      }
    );
  }

  return openCapsSettingsModal(interaction, cfg, { zeroDefaults: !isRuleConfigured(cfg, "caps") });
}

function buildCapsExemptSelectRows(cfg) {
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(CAPS_EXEMPT_ROLES_SELECT_ID)
    .setPlaceholder("Caps muaf roller (opsiyonel)")
    .setMinValues(0)
    .setMaxValues(25);

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(CAPS_EXEMPT_CHANNELS_SELECT_ID)
    .setPlaceholder("Caps muaf kanallar (opsiyonel)")
    .setMinValues(0)
    .setMaxValues(25);

  const savedRoleIds = Array.isArray(cfg?.caps?.exemptRoleIds)
    ? cfg.caps.exemptRoleIds.filter(Boolean).slice(0, 25)
    : [];
  const savedChannelIds = Array.isArray(cfg?.caps?.exemptChannelIds)
    ? cfg.caps.exemptChannelIds.filter(Boolean).slice(0, 25)
    : [];

  if (savedRoleIds.length && typeof roleSelect.setDefaultRoles === "function") {
    roleSelect.setDefaultRoles(savedRoleIds);
  }
  if (savedChannelIds.length && typeof channelSelect.setDefaultChannels === "function") {
    channelSelect.setDefaultChannels(savedChannelIds);
  }

  return [
    new ActionRowBuilder().addComponents(roleSelect),
    new ActionRowBuilder().addComponents(channelSelect),
  ];
}

async function handleCapsModalSubmit(interaction, client) {
  const gid = interaction.guildId;
  const cfg = await getConfig(client.db, gid);
  const capsSaved = normalizeCapsConfig(cfg);

  const minLetters = parseIntWithSavedFallback(
    interaction.fields.getTextInputValue("minLetters"),
    capsSaved.minLetters
  );
  const ratio = parseCapsRatioWithSavedFallback(
    interaction.fields.getTextInputValue("ratio"),
    capsSaved.ratio
  );
  const timeoutMs = parseTimeoutWithSavedFallback(
    getFieldValue(interaction, "timeout", "0"),
    cfg?.timeouts?.caps
  );
  const muteConfig = parseMuteConfigWithSavedFallback(
    getFieldValue(interaction, "muteRole", "0"),
    getFieldValue(interaction, "muteDuration", "0"),
    getConfiguredMuteFlag(cfg, "caps"),
    getConfiguredMuteDurationMs(cfg, "caps")
  );

  if (!Number.isFinite(minLetters) || minLetters < 1 || minLetters > 100) {
    await interaction.reply({ content: "Hata: Min harf sayısı 1-100 aralığında olmalı.", ephemeral: true });
    return true;
  }

  if (!ratio) {
    await interaction.reply({ content: "Hata: Büyük harf oranı %1-100 aralığında olmalı.", ephemeral: true });
    return true;
  }
  if (timeoutMs === null) {
    await interaction.reply({ content: "Hata: Timeout süresi 0 veya 1m-4w olmalı. Birimler: m=minute h=hours d=days w=week. Örnek: 5m 10h 7d 2w", ephemeral: true });
    return true;
  }
  if (!muteConfig) {
    await interaction.reply({ content: "Hata: Muted rol alanı sadece `0` veya `1` olmalı.", ephemeral: true });
    return true;
  }
  if (muteConfig.flag === 1 && (!Number.isFinite(muteConfig.durationMs) || muteConfig.durationMs <= 0)) {
    await interaction.reply({ content: "Hata: Muted rol aktifse muted süresi 1m-4w aralığında olmalı.", ephemeral: true });
    return true;
  }

  const merged = await setConfig(client.db, gid, {
    caps: { minLetters, ratio },
    timeouts: { caps: timeoutMs },
    muteOnViolation: { caps: muteConfig.flag },
    muteDurations: { caps: muteConfig.flag === 1 ? muteConfig.durationMs : 0 },
    configured: { caps: true },
    toggles: { caps: true },
  });

  await refreshPanels(interaction, client, merged);
  await interaction.reply({
    content:
      `Başarılı: Caps ayarı kaydedildi ve koruma açıldı. (Min: ${minLetters}, Oran: %${Math.round(ratio * 100)})\n` +
      `Timeout: ${formatDurationShort(timeoutMs)} | Muted rol: ${muteConfig.flag} | Muted süre: ${formatMuteSummary(muteConfig.flag, muteConfig.durationMs)}\n\n` +
      "Caps muaf rol/kanal seçmek istersen aşağıdan seç:",
    components: buildCapsExemptSelectRows(merged),
    ephemeral: true,
  });

  return true;
}

async function handleCapsExemptRolesSelect(interaction, client) {
  const selected = Array.isArray(interaction.values) ? interaction.values : [];
  await setConfig(client.db, interaction.guildId, {
    caps: { exemptRoleIds: selected },
    configured: { caps: true },
  });

  await interaction.reply({
    content: `Başarılı: Caps muaf roller kaydedildi (${selected.length} rol).`,
    ephemeral: true,
  });
  return true;
}

async function handleCapsExemptChannelsSelect(interaction, client) {
  const selected = Array.isArray(interaction.values) ? interaction.values : [];
  await setConfig(client.db, interaction.guildId, {
    caps: { exemptChannelIds: selected },
    configured: { caps: true },
  });

  await interaction.reply({
    content: `Başarılı: Caps muaf kanallar kaydedildi (${selected.length} kanal).`,
    ephemeral: true,
  });
  return true;
}

function buildLinkExemptSelectRows(cfg) {
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(LINKS_EXEMPT_ROLES_SELECT_ID)
    .setPlaceholder("Link muaf roller (opsiyonel)")
    .setMinValues(0)
    .setMaxValues(25);

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(LINKS_EXEMPT_CHANNELS_SELECT_ID)
    .setPlaceholder("Link muaf kanallar (opsiyonel)")
    .setMinValues(0)
    .setMaxValues(25);

  const savedRoleIds = Array.isArray(cfg?.links?.exemptRoleIds)
    ? cfg.links.exemptRoleIds.filter(Boolean).slice(0, 25)
    : [];
  const savedChannelIds = Array.isArray(cfg?.links?.exemptChannelIds)
    ? cfg.links.exemptChannelIds.filter(Boolean).slice(0, 25)
    : [];

  if (savedRoleIds.length && typeof roleSelect.setDefaultRoles === "function") {
    roleSelect.setDefaultRoles(savedRoleIds);
  }
  if (savedChannelIds.length && typeof channelSelect.setDefaultChannels === "function") {
    channelSelect.setDefaultChannels(savedChannelIds);
  }

  return [
    new ActionRowBuilder().addComponents(roleSelect),
    new ActionRowBuilder().addComponents(channelSelect),
  ];
}

async function handleLinksExemptRolesSelect(interaction, client) {
  await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  const selected = Array.isArray(interaction.values) ? interaction.values : [];
  let merged = await setConfig(client.db, interaction.guildId, {
    links: { exemptRoleIds: selected },
    configured: { links: true },
  });

  const sync = await syncLinksAutoModWithConfig(interaction, client, merged);
  merged = sync?.cfg || merged;
  const syncNote = getAutoModSyncNote(sync);

  await interaction.editReply({
    content: `Başarılı: Link muaf roller kaydedildi (${selected.length} rol).${syncNote}`,
  });

  await refreshPanels(interaction, client, merged);
  return true;
}

async function handleLinksExemptChannelsSelect(interaction, client) {
  await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  const selectedRaw = Array.isArray(interaction.values) ? interaction.values : [];
  const mandatoryLogCategoryId = await resolveLogsCategoryId(interaction, client);
  const selected = mergeMandatoryChannelId(selectedRaw, mandatoryLogCategoryId);
  let merged = await setConfig(client.db, interaction.guildId, {
    links: { exemptChannelIds: selected },
    configured: { links: true },
  });

  const sync = await syncLinksAutoModWithConfig(interaction, client, merged);
  merged = sync?.cfg || merged;
  const syncNote = getAutoModSyncNote(sync);

  await interaction.editReply({
    content: `Başarılı: Link muaf kanallar kaydedildi (${selected.length} kanal).${syncNote}`,
  });

  await refreshPanels(interaction, client, merged);
  return true;
}

function buildProfanityExemptSelectRows(cfg) {
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(PROFANITY_EXEMPT_ROLES_SELECT_ID)
    .setPlaceholder("Küfür muaf roller (opsiyonel)")
    .setMinValues(0)
    .setMaxValues(25);

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(PROFANITY_EXEMPT_CHANNELS_SELECT_ID)
    .setPlaceholder("Küfür muaf kanallar (opsiyonel)")
    .setMinValues(0)
    .setMaxValues(25);

  const savedRoleIds = Array.isArray(cfg?.profanity?.exemptRoleIds)
    ? cfg.profanity.exemptRoleIds.filter(Boolean).slice(0, 25)
    : [];
  const savedChannelIds = Array.isArray(cfg?.profanity?.exemptChannelIds)
    ? cfg.profanity.exemptChannelIds.filter(Boolean).slice(0, 25)
    : [];

  if (savedRoleIds.length && typeof roleSelect.setDefaultRoles === "function") {
    roleSelect.setDefaultRoles(savedRoleIds);
  }
  if (savedChannelIds.length && typeof channelSelect.setDefaultChannels === "function") {
    channelSelect.setDefaultChannels(savedChannelIds);
  }

  return [
    new ActionRowBuilder().addComponents(roleSelect),
    new ActionRowBuilder().addComponents(channelSelect),
  ];
}

async function handleProfanityExemptRolesSelect(interaction, client) {
  await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  const selected = Array.isArray(interaction.values) ? interaction.values : [];
  let merged = await setConfig(client.db, interaction.guildId, {
    profanity: { exemptRoleIds: selected },
    configured: { profanity: true },
  });

  const sync = await syncProfanityAutoModWithConfig(interaction, client, merged);
  merged = sync?.cfg || merged;
  const syncNote = getAutoModSyncNote(sync);

  await interaction.editReply({
    content: `Başarılı: Küfür muaf roller kaydedildi (${selected.length} rol).${syncNote}`,
  });

  await refreshPanels(interaction, client, merged);
  return true;
}

async function handleProfanityExemptChannelsSelect(interaction, client) {
  await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  const selectedRaw = Array.isArray(interaction.values) ? interaction.values : [];
  const mandatoryLogCategoryId = await resolveLogsCategoryId(interaction, client);
  const selected = mergeMandatoryChannelId(selectedRaw, mandatoryLogCategoryId);
  let merged = await setConfig(client.db, interaction.guildId, {
    profanity: { exemptChannelIds: selected },
    configured: { profanity: true },
  });

  const sync = await syncProfanityAutoModWithConfig(interaction, client, merged);
  merged = sync?.cfg || merged;
  const syncNote = getAutoModSyncNote(sync);

  await interaction.editReply({
    content: `Başarılı: Küfür muaf kanallar kaydedildi (${selected.length} kanal).${syncNote}`,
  });

  await refreshPanels(interaction, client, merged);
  return true;
}

function buildRuleExemptSelectRows(cfg, ruleKey, roleCustomId, channelCustomId, rolePlaceholder, channelPlaceholder) {
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(roleCustomId)
    .setPlaceholder(rolePlaceholder)
    .setMinValues(0)
    .setMaxValues(25);

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(channelCustomId)
    .setPlaceholder(channelPlaceholder)
    .setMinValues(0)
    .setMaxValues(25);

  const savedRoleIds = Array.isArray(cfg?.[ruleKey]?.exemptRoleIds)
    ? cfg[ruleKey].exemptRoleIds.filter(Boolean).slice(0, 25)
    : [];
  const savedChannelIds = Array.isArray(cfg?.[ruleKey]?.exemptChannelIds)
    ? cfg[ruleKey].exemptChannelIds.filter(Boolean).slice(0, 25)
    : [];

  if (savedRoleIds.length && typeof roleSelect.setDefaultRoles === "function") {
    roleSelect.setDefaultRoles(savedRoleIds);
  }
  if (savedChannelIds.length && typeof channelSelect.setDefaultChannels === "function") {
    channelSelect.setDefaultChannels(savedChannelIds);
  }

  return [
    new ActionRowBuilder().addComponents(roleSelect),
    new ActionRowBuilder().addComponents(channelSelect),
  ];
}

async function handleRuleExemptRolesSelect(interaction, client, ruleKey, label) {
  const selected = Array.isArray(interaction.values) ? interaction.values : [];
  await setConfig(client.db, interaction.guildId, {
    [ruleKey]: { exemptRoleIds: selected },
    configured: { [ruleKey]: true },
  });

  await interaction.reply({
    content: `Başarılı: ${label} muaf roller kaydedildi (${selected.length} rol).`,
    ephemeral: true,
  });
  return true;
}

async function handleRuleExemptChannelsSelect(interaction, client, ruleKey, label) {
  const selected = Array.isArray(interaction.values) ? interaction.values : [];
  await setConfig(client.db, interaction.guildId, {
    [ruleKey]: { exemptChannelIds: selected },
    configured: { [ruleKey]: true },
  });

  await interaction.reply({
    content: `Başarılı: ${label} muaf kanallar kaydedildi (${selected.length} kanal).`,
    ephemeral: true,
  });
  return true;
}

function buildEmojiExemptSelectRows(cfg) {
  return buildRuleExemptSelectRows(
    cfg,
    "emoji",
    EMOJI_EXEMPT_ROLES_SELECT_ID,
    EMOJI_EXEMPT_CHANNELS_SELECT_ID,
    "Emoji muaf roller (opsiyonel)",
    "Emoji muaf kanallar (opsiyonel)"
  );
}

function buildMentionsExemptSelectRows(cfg) {
  return buildRuleExemptSelectRows(
    cfg,
    "mentions",
    MENTIONS_EXEMPT_ROLES_SELECT_ID,
    MENTIONS_EXEMPT_CHANNELS_SELECT_ID,
    "Etiket muaf roller (opsiyonel)",
    "Etiket muaf kanallar (opsiyonel)"
  );
}

function buildFloodExemptSelectRows(cfg) {
  return buildRuleExemptSelectRows(
    cfg,
    "flood",
    FLOOD_EXEMPT_ROLES_SELECT_ID,
    FLOOD_EXEMPT_CHANNELS_SELECT_ID,
    "Flood muaf roller (opsiyonel)",
    "Flood muaf kanallar (opsiyonel)"
  );
}

function buildSpamExemptSelectRows(cfg) {
  return buildRuleExemptSelectRows(
    cfg,
    "spam",
    SPAM_EXEMPT_ROLES_SELECT_ID,
    SPAM_EXEMPT_CHANNELS_SELECT_ID,
    "Spam muaf roller (opsiyonel)",
    "Spam muaf kanallar (opsiyonel)"
  );
}

function buildEveryoneExemptSelectRows(cfg) {
  return buildRuleExemptSelectRows(
    cfg,
    "everyone",
    EVERYONE_EXEMPT_ROLES_SELECT_ID,
    EVERYONE_EXEMPT_CHANNELS_SELECT_ID,
    "Everyone muaf roller (opsiyonel)",
    "Everyone muaf kanallar (opsiyonel)"
  );
}

async function handleEmojiExemptRolesSelect(interaction, client) {
  return handleRuleExemptRolesSelect(interaction, client, "emoji", "Emoji");
}

async function handleEmojiExemptChannelsSelect(interaction, client) {
  return handleRuleExemptChannelsSelect(interaction, client, "emoji", "Emoji");
}

async function handleMentionsExemptRolesSelect(interaction, client) {
  await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  const selected = Array.isArray(interaction.values) ? interaction.values : [];
  let merged = await setConfig(client.db, interaction.guildId, {
    mentions: { exemptRoleIds: selected },
    configured: { mentions: true },
  });

  const sync = await syncMentionsAutoModWithConfig(interaction, client, merged);
  merged = sync?.cfg || merged;
  const syncNote = getAutoModSyncNote(sync);

  await interaction.editReply({
    content: `Başarılı: Etiket muaf roller kaydedildi (${selected.length} rol).${syncNote}`,
  });

  await refreshPanels(interaction, client, merged);
  return true;
}

async function handleMentionsExemptChannelsSelect(interaction, client) {
  await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  const selected = Array.isArray(interaction.values) ? interaction.values : [];
  let merged = await setConfig(client.db, interaction.guildId, {
    mentions: { exemptChannelIds: selected },
    configured: { mentions: true },
  });

  const sync = await syncMentionsAutoModWithConfig(interaction, client, merged);
  merged = sync?.cfg || merged;
  const syncNote = getAutoModSyncNote(sync);

  await interaction.editReply({
    content: `Başarılı: Etiket muaf kanallar kaydedildi (${selected.length} kanal).${syncNote}`,
  });

  await refreshPanels(interaction, client, merged);
  return true;
}

async function handleFloodExemptRolesSelect(interaction, client) {
  return handleRuleExemptRolesSelect(interaction, client, "flood", "Flood");
}

async function handleFloodExemptChannelsSelect(interaction, client) {
  return handleRuleExemptChannelsSelect(interaction, client, "flood", "Flood");
}

async function handleSpamExemptRolesSelect(interaction, client) {
  return handleRuleExemptRolesSelect(interaction, client, "spam", "Spam");
}

async function handleSpamExemptChannelsSelect(interaction, client) {
  return handleRuleExemptChannelsSelect(interaction, client, "spam", "Spam");
}

async function handleEveryoneExemptRolesSelect(interaction, client) {
  return handleRuleExemptRolesSelect(interaction, client, "everyone", "Everyone");
}

async function handleEveryoneExemptChannelsSelect(interaction, client) {
  return handleRuleExemptChannelsSelect(interaction, client, "everyone", "Everyone");
}

async function openSettingsModal(interaction, type, cfg, opts = {}) {
  const zeroDefaults = opts?.zeroDefaults === true;
  if (type === "raid") {
    const modal = new ModalBuilder()
      .setCustomId("settings:raid:save")
      .setTitle("Raid Koruma Ayarları");

    const maxJoins = new TextInputBuilder()
      .setCustomId("maxJoins")
      .setLabel("Max Join (2-50)")
      .setPlaceholder("6")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const windowMs = new TextInputBuilder()
      .setCustomId("window")
      .setLabel("Süre (örn: 5m 10h 7d 2w)")
      .setPlaceholder(CHAT_TIMEOUT_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const action = new TextInputBuilder()
      .setCustomId("action")
      .setLabel("Aksiyon (kick/ban/kilitle/kick+kilitle/ban+kilitle)")
      .setPlaceholder("Örn: kick+kilitle")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const lockDuration = new TextInputBuilder()
      .setCustomId("lockDuration")
      .setLabel("Kilit Süresi (0=kalıcı, örn: 5m 10h 7d 2w)")
      .setPlaceholder(CHAT_TIMEOUT_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const prev = cfg?.raid || {};
    maxJoins.setValue(zeroDefaults ? "0" : (prev.maxJoins ? String(prev.maxJoins) : "0"));
    windowMs.setValue(zeroDefaults ? "0" : (prev.windowMs ? formatDurationMhdw(prev.windowMs) : "0"));
    action.setValue(prev.action ? String(prev.action) : "kick");
    if (zeroDefaults) lockDuration.setValue("0");
    else if (prev.lockdownMs === 0) lockDuration.setValue("0");
    else if (prev.lockdownMs) lockDuration.setValue(formatDurationMhdw(prev.lockdownMs, { allowZero: true }));
    else lockDuration.setValue("5m");

    modal.addComponents(
      new ActionRowBuilder().addComponents(maxJoins),
      new ActionRowBuilder().addComponents(windowMs),
      new ActionRowBuilder().addComponents(action),
      new ActionRowBuilder().addComponents(lockDuration)
    );

    await interaction.showModal(modal);
    return true;
  }

  if (type === "spam") {
    const modal = new ModalBuilder()
      .setCustomId("settings:spam:save")
      .setTitle("Spam Koruma Ayarları");

    const maxMessages = new TextInputBuilder()
      .setCustomId("maxMessages")
      .setLabel("Max Mesaj (2-50)")
      .setPlaceholder("5")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const perSeconds = new TextInputBuilder()
      .setCustomId("perSeconds")
      .setLabel("Süre (2-120 saniye)")
      .setPlaceholder("10")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const timeout = new TextInputBuilder()
      .setCustomId("timeout")
      .setLabel(CHAT_TIMEOUT_INPUT_LABEL)
      .setPlaceholder(CHAT_TIMEOUT_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    const muteRole = new TextInputBuilder()
      .setCustomId("muteRole")
      .setLabel(CHAT_MUTE_INPUT_LABEL)
      .setPlaceholder(CHAT_MUTE_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    const muteDuration = new TextInputBuilder()
      .setCustomId("muteDuration")
      .setLabel(CHAT_MUTE_DURATION_INPUT_LABEL)
      .setPlaceholder(CHAT_MUTE_DURATION_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const prev = cfg?.spam || {};
    const prevTimeout = getConfiguredTimeoutMs(cfg, "spam");
    const prevMute = getConfiguredMuteFlag(cfg, "spam");
    const prevMuteDuration = getConfiguredMuteDurationMs(cfg, "spam");
    maxMessages.setValue(zeroDefaults ? "0" : (prev.maxMessages ? String(prev.maxMessages) : "0"));
    perSeconds.setValue(zeroDefaults ? "0" : (prev.perSeconds ? String(prev.perSeconds) : "0"));
    timeout.setValue(zeroDefaults ? "0" : (prevTimeout > 0 ? formatDurationShort(prevTimeout) : "0"));
    muteRole.setValue(zeroDefaults ? "0" : String(prevMute));
    muteDuration.setValue(zeroDefaults ? "0" : formatMuteDurationFieldValue(prevMuteDuration));

    modal.addComponents(
      new ActionRowBuilder().addComponents(maxMessages),
      new ActionRowBuilder().addComponents(perSeconds),
      new ActionRowBuilder().addComponents(timeout),
      new ActionRowBuilder().addComponents(muteRole),
      new ActionRowBuilder().addComponents(muteDuration)
    );

    await interaction.showModal(modal);
    return true;
  }

  if (type === "flood") {
    const modal = new ModalBuilder()
      .setCustomId("settings:flood:save")
      .setTitle("Flood Koruma Ayarları");

    const maxMessages = new TextInputBuilder()
      .setCustomId("maxMessages")
      .setLabel("Max Mesaj (2-50)")
      .setPlaceholder("5")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const windowMs = new TextInputBuilder()
      .setCustomId("window")
      .setLabel("Süre (3s-2m)")
      .setPlaceholder("7s")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const timeout = new TextInputBuilder()
      .setCustomId("timeout")
      .setLabel(CHAT_TIMEOUT_INPUT_LABEL)
      .setPlaceholder(CHAT_TIMEOUT_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    const muteRole = new TextInputBuilder()
      .setCustomId("muteRole")
      .setLabel(CHAT_MUTE_INPUT_LABEL)
      .setPlaceholder(CHAT_MUTE_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    const muteDuration = new TextInputBuilder()
      .setCustomId("muteDuration")
      .setLabel(CHAT_MUTE_DURATION_INPUT_LABEL)
      .setPlaceholder(CHAT_MUTE_DURATION_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const prev = cfg?.flood || {};
    const prevTimeout = getConfiguredTimeoutMs(cfg, "flood");
    const prevMute = getConfiguredMuteFlag(cfg, "flood");
    const prevMuteDuration = getConfiguredMuteDurationMs(cfg, "flood");
    maxMessages.setValue(zeroDefaults ? "0" : (prev.maxMessages ? String(prev.maxMessages) : "0"));
    windowMs.setValue(zeroDefaults ? "0" : (prev.windowMs ? `${Math.round(prev.windowMs / 1000)}s` : "0"));
    timeout.setValue(zeroDefaults ? "0" : (prevTimeout > 0 ? formatDurationShort(prevTimeout) : "0"));
    muteRole.setValue(zeroDefaults ? "0" : String(prevMute));
    muteDuration.setValue(zeroDefaults ? "0" : formatMuteDurationFieldValue(prevMuteDuration));

    modal.addComponents(
      new ActionRowBuilder().addComponents(maxMessages),
      new ActionRowBuilder().addComponents(windowMs),
      new ActionRowBuilder().addComponents(timeout),
      new ActionRowBuilder().addComponents(muteRole),
      new ActionRowBuilder().addComponents(muteDuration)
    );

    await interaction.showModal(modal);
    return true;
  }

  if (type === "links") {
    const modal = new ModalBuilder()
      .setCustomId("settings:links:save")
      .setTitle("Link Koruma Ayarı");

    const links = normalizeLinksConfig(cfg);
    const maxMessages = new TextInputBuilder()
      .setCustomId("maxMessages")
      .setLabel("Max Link Mesajı (1-50, 10 saniye içinde)")
      .setPlaceholder("5")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "0" : String(links.maxMessages));

    const allowedLinks = new TextInputBuilder()
      .setCustomId("allowedLinks")
      .setLabel("Izinli Linkler (opsiyonel, ornek format)")
      .setPlaceholder("Ornek: youtube.com, discord.gg/sunucu, site.com/path")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(1000)
      .setValue(zeroDefaults ? "0" : formatAllowedLinksForInput(links.allowedLinks));

    const prevTimeout = getConfiguredTimeoutMs(cfg, "links");
    const timeout = new TextInputBuilder()
      .setCustomId("timeout")
      .setLabel(CHAT_TIMEOUT_INPUT_LABEL)
      .setPlaceholder(CHAT_TIMEOUT_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "0" : (prevTimeout > 0 ? formatDurationShort(prevTimeout) : "0"));

    const muteRole = new TextInputBuilder()
      .setCustomId("muteRole")
      .setLabel(CHAT_MUTE_INPUT_LABEL)
      .setPlaceholder(CHAT_MUTE_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "0" : String(getConfiguredMuteFlag(cfg, "links")));
    const muteDuration = new TextInputBuilder()
      .setCustomId("muteDuration")
      .setLabel(CHAT_MUTE_DURATION_INPUT_LABEL)
      .setPlaceholder(CHAT_MUTE_DURATION_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "0" : formatMuteDurationFieldValue(getConfiguredMuteDurationMs(cfg, "links")));

    modal.addComponents(
      new ActionRowBuilder().addComponents(maxMessages),
      new ActionRowBuilder().addComponents(allowedLinks),
      new ActionRowBuilder().addComponents(timeout),
      new ActionRowBuilder().addComponents(muteRole),
      new ActionRowBuilder().addComponents(muteDuration)
    );

    await interaction.showModal(modal);
    return true;
  }

  if (type === "invite") {
    const modal = new ModalBuilder()
      .setCustomId("settings:invite:save")
      .setTitle("Invite Engeli Ayarı");

    const prevTimeout = getConfiguredTimeoutMs(cfg, "invite");
    const timeout = new TextInputBuilder()
      .setCustomId("timeout")
      .setLabel(CHAT_TIMEOUT_INPUT_LABEL)
      .setPlaceholder(CHAT_TIMEOUT_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "5m" : (prevTimeout > 0 ? formatDurationShort(prevTimeout) : "0"));

    const muteRole = new TextInputBuilder()
      .setCustomId("muteRole")
      .setLabel(CHAT_MUTE_INPUT_LABEL)
      .setPlaceholder(CHAT_MUTE_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "0" : String(getConfiguredMuteFlag(cfg, "invite")));
    const muteDuration = new TextInputBuilder()
      .setCustomId("muteDuration")
      .setLabel(CHAT_MUTE_DURATION_INPUT_LABEL)
      .setPlaceholder(CHAT_MUTE_DURATION_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "0" : formatMuteDurationFieldValue(getConfiguredMuteDurationMs(cfg, "invite")));

    modal.addComponents(
      new ActionRowBuilder().addComponents(timeout),
      new ActionRowBuilder().addComponents(muteRole),
      new ActionRowBuilder().addComponents(muteDuration)
    );

    await interaction.showModal(modal);
    return true;
  }

  if (type === "profanity") {
    const modal = new ModalBuilder()
      .setCustomId("settings:profanity:save")
      .setTitle("Küfür Engeli Ayarı");

    const profanity = normalizeProfanityConfig(cfg);
    const level = new TextInputBuilder()
      .setCustomId("level")
      .setLabel("Seviye (DiniMilli / Az / Orta / Cok)")
      .setPlaceholder("DiniMilli, Az, Orta veya Cok")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(
        zeroDefaults
          ? "Orta"
          : (
            profanity.level === "dini_milli" ? "DiniMilli" :
            profanity.level === "cok" ? "Cok" :
            profanity.level === "az" ? "Az" :
            "Orta"
          )
      );

    const prevTimeout = getConfiguredTimeoutMs(cfg, "profanity");
    const timeout = new TextInputBuilder()
      .setCustomId("timeout")
      .setLabel(CHAT_TIMEOUT_INPUT_LABEL)
      .setPlaceholder(CHAT_TIMEOUT_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "0" : (prevTimeout > 0 ? formatDurationShort(prevTimeout) : "0"));

    const muteRole = new TextInputBuilder()
      .setCustomId("muteRole")
      .setLabel(CHAT_MUTE_INPUT_LABEL)
      .setPlaceholder(CHAT_MUTE_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "0" : String(getConfiguredMuteFlag(cfg, "profanity")));
    const muteDuration = new TextInputBuilder()
      .setCustomId("muteDuration")
      .setLabel(CHAT_MUTE_DURATION_INPUT_LABEL)
      .setPlaceholder(CHAT_MUTE_DURATION_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "0" : formatMuteDurationFieldValue(getConfiguredMuteDurationMs(cfg, "profanity")));

    modal.addComponents(
      new ActionRowBuilder().addComponents(level),
      new ActionRowBuilder().addComponents(timeout),
      new ActionRowBuilder().addComponents(muteRole),
      new ActionRowBuilder().addComponents(muteDuration)
    );

    await interaction.showModal(modal);
    return true;
  }

  if (type === "emoji") {
    const modal = new ModalBuilder()
      .setCustomId("settings:emoji:save")
      .setTitle("Emoji Koruma Ayarı");

    const emoji = normalizeEmojiConfig(cfg);
    const maxCount = new TextInputBuilder()
      .setCustomId("maxCount")
      .setLabel("Max Emoji Sayısı (2-100)")
      .setPlaceholder("2")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "2" : String(emoji.maxCount));

    const perSeconds = new TextInputBuilder()
      .setCustomId("perSeconds")
      .setLabel("Süre (2-120 saniye)")
      .setPlaceholder("2")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "2" : String(emoji.perSeconds));

    const prevTimeout = getConfiguredTimeoutMs(cfg, "emoji");
    const timeout = new TextInputBuilder()
      .setCustomId("timeout")
      .setLabel(CHAT_TIMEOUT_INPUT_LABEL)
      .setPlaceholder(CHAT_TIMEOUT_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "5m" : (prevTimeout > 0 ? formatDurationShort(prevTimeout) : "0"));

    const muteRole = new TextInputBuilder()
      .setCustomId("muteRole")
      .setLabel(CHAT_MUTE_INPUT_LABEL)
      .setPlaceholder(CHAT_MUTE_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "0" : String(getConfiguredMuteFlag(cfg, "emoji")));
    const muteDuration = new TextInputBuilder()
      .setCustomId("muteDuration")
      .setLabel(CHAT_MUTE_DURATION_INPUT_LABEL)
      .setPlaceholder(CHAT_MUTE_DURATION_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "0" : formatMuteDurationFieldValue(getConfiguredMuteDurationMs(cfg, "emoji")));

    modal.addComponents(
      new ActionRowBuilder().addComponents(maxCount),
      new ActionRowBuilder().addComponents(perSeconds),
      new ActionRowBuilder().addComponents(timeout),
      new ActionRowBuilder().addComponents(muteRole),
      new ActionRowBuilder().addComponents(muteDuration)
    );

    await interaction.showModal(modal);
    return true;
  }

  if (type === "mentions") {
    const modal = new ModalBuilder()
      .setCustomId("settings:mentions:save")
      .setTitle("Etiket Koruma Ayarı");

    const mentions = normalizeMentionsConfig(cfg);
    const maxCount = new TextInputBuilder()
      .setCustomId("maxCount")
      .setLabel("Max Etiket Sayısı (1-100)")
      .setPlaceholder("5")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "0" : String(mentions.maxCount));

    const perSeconds = new TextInputBuilder()
      .setCustomId("perSeconds")
      .setLabel("Süre (2-120 saniye)")
      .setPlaceholder("5")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "0" : String(mentions.perSeconds));

    const prevTimeout = getConfiguredTimeoutMs(cfg, "mentions");
    const timeout = new TextInputBuilder()
      .setCustomId("timeout")
      .setLabel(CHAT_TIMEOUT_INPUT_LABEL)
      .setPlaceholder(CHAT_TIMEOUT_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "0" : (prevTimeout > 0 ? formatDurationShort(prevTimeout) : "0"));
    const muteRole = new TextInputBuilder()
      .setCustomId("muteRole")
      .setLabel(CHAT_MUTE_INPUT_LABEL)
      .setPlaceholder(CHAT_MUTE_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "0" : String(getConfiguredMuteFlag(cfg, "mentions")));
    const muteDuration = new TextInputBuilder()
      .setCustomId("muteDuration")
      .setLabel(CHAT_MUTE_DURATION_INPUT_LABEL)
      .setPlaceholder(CHAT_MUTE_DURATION_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "0" : formatMuteDurationFieldValue(getConfiguredMuteDurationMs(cfg, "mentions")));

    modal.addComponents(
      new ActionRowBuilder().addComponents(maxCount),
      new ActionRowBuilder().addComponents(perSeconds),
      new ActionRowBuilder().addComponents(timeout),
      new ActionRowBuilder().addComponents(muteRole),
      new ActionRowBuilder().addComponents(muteDuration)
    );

    await interaction.showModal(modal);
    return true;
  }

  if (type === "everyone") {
    const modal = new ModalBuilder()
      .setCustomId("settings:everyone:save")
      .setTitle("Everyone Koruma Ayarı");

    const everyone = normalizeEveryoneConfig(cfg);
    const maxCount = new TextInputBuilder()
      .setCustomId("maxCount")
      .setLabel("Max Everyone/Here (0-20)")
      .setPlaceholder("0")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "0" : String(everyone.maxCount));

    const perSeconds = new TextInputBuilder()
      .setCustomId("perSeconds")
      .setLabel("Süre (2-120 saniye)")
      .setPlaceholder("5")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "0" : String(everyone.perSeconds));

    const prevTimeout = getConfiguredTimeoutMs(cfg, "everyone");
    const timeout = new TextInputBuilder()
      .setCustomId("timeout")
      .setLabel(CHAT_TIMEOUT_INPUT_LABEL)
      .setPlaceholder(CHAT_TIMEOUT_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "0" : (prevTimeout > 0 ? formatDurationShort(prevTimeout) : "0"));
    const muteRole = new TextInputBuilder()
      .setCustomId("muteRole")
      .setLabel(CHAT_MUTE_INPUT_LABEL)
      .setPlaceholder(CHAT_MUTE_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "0" : String(getConfiguredMuteFlag(cfg, "everyone")));
    const muteDuration = new TextInputBuilder()
      .setCustomId("muteDuration")
      .setLabel(CHAT_MUTE_DURATION_INPUT_LABEL)
      .setPlaceholder(CHAT_MUTE_DURATION_INPUT_PLACEHOLDER)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(zeroDefaults ? "0" : formatMuteDurationFieldValue(getConfiguredMuteDurationMs(cfg, "everyone")));

    modal.addComponents(
      new ActionRowBuilder().addComponents(maxCount),
      new ActionRowBuilder().addComponents(perSeconds),
      new ActionRowBuilder().addComponents(timeout),
      new ActionRowBuilder().addComponents(muteRole),
      new ActionRowBuilder().addComponents(muteDuration)
    );

    await interaction.showModal(modal);
    return true;
  }

  return false;
}

async function handleSettingsModalSubmit(interaction, client) {
  const parts = String(interaction.customId).split(":");
  const type = parts[1];

  const gid = interaction.guildId;
  const cfg = await getConfig(client.db, gid);

  if (type === "raid") {
    const maxJoins = parseIntWithSavedFallback(
      interaction.fields.getTextInputValue("maxJoins"),
      cfg?.raid?.maxJoins
    );
    const windowRaw = String(interaction.fields.getTextInputValue("window")).trim().toLowerCase();
    const windowMs = parseTimeoutWithSavedFallback(windowRaw, cfg?.raid?.windowMs);
    const action = normalizeRaidAction(interaction.fields.getTextInputValue("action"));
    const lockRaw = String(interaction.fields.getTextInputValue("lockDuration")).trim().toLowerCase();
    const lockdownMs = parseTimeoutWithSavedFallback(lockRaw, cfg?.raid?.lockdownMs);

    if (!Number.isFinite(maxJoins) || maxJoins < 2 || maxJoins > 50) {
      await interaction.reply({ content: "Hata: Max join 2-50 aralığında olmalı.", ephemeral: true });
      return true;
    }
    if (windowMs === null || windowMs <= 0) {
      await interaction.reply({ content: "Hata: Süre 1m-4w olmalı. Birimler: m=minute h=hours d=days w=week. Örnek: 5m 10h 7d 2w", ephemeral: true });
      return true;
    }
    if (!action) {
      await interaction.reply({ content: "Hata: Aksiyon geçersiz. kick/ban/kilitle/kick+kilitle/ban+kilitle", ephemeral: true });
      return true;
    }
    if (lockRaw !== "0" && (lockdownMs === null || lockdownMs <= 0)) {
      await interaction.reply({ content: "Hata: Kilit süresi 0 veya 1m-4w olmalı. Birimler: m=minute h=hours d=days w=week. Örnek: 5m 10h 7d 2w", ephemeral: true });
      return true;
    }

    cfg.raid = {
      windowMs,
      maxJoins,
      action,
      lockdownMs,
    };
    cfg.toggles ||= {};
    cfg.toggles.antiRaid = true;
    markRuleConfigured(cfg, "raid");

    await client.db.set(`prot_cfg_${gid}`, cfg);
    await refreshPanels(interaction, client, cfg);

    await interaction.reply({ content: "Başarılı: Raid koruma ayarları kaydedildi ve koruma açıldı.", ephemeral: true });
    return true;
  }

  if (type === "spam") {
    const maxMessages = parseIntWithSavedFallback(
      interaction.fields.getTextInputValue("maxMessages"),
      cfg?.spam?.maxMessages
    );
    const perSeconds = parseIntWithSavedFallback(
      interaction.fields.getTextInputValue("perSeconds"),
      cfg?.spam?.perSeconds
    );
    const timeoutMs = parseTimeoutWithSavedFallback(
      getFieldValue(interaction, "timeout", "0"),
      cfg?.timeouts?.spam
    );
    const muteConfig = parseMuteConfigWithSavedFallback(
      getFieldValue(interaction, "muteRole", "0"),
      getFieldValue(interaction, "muteDuration", "0"),
      getConfiguredMuteFlag(cfg, "spam"),
      getConfiguredMuteDurationMs(cfg, "spam")
    );

    if (!Number.isFinite(maxMessages) || maxMessages < 2 || maxMessages > 50) {
      await interaction.reply({ content: "Hata: Max mesaj 2-50 aralığında olmalı.", ephemeral: true });
      return true;
    }
    if (!Number.isFinite(perSeconds) || perSeconds < 2 || perSeconds > 120) {
      await interaction.reply({ content: "Hata: Süre 2-120 saniye aralığında olmalı.", ephemeral: true });
      return true;
    }
    if (timeoutMs === null) {
      await interaction.reply({ content: "Hata: Timeout süresi 0 veya 1m-4w olmalı. Birimler: m=minute h=hours d=days w=week. Örnek: 5m 10h 7d 2w", ephemeral: true });
      return true;
    }
    if (!muteConfig) {
      await interaction.reply({ content: "Hata: Muted rol alanı sadece `0` veya `1` olmalı.", ephemeral: true });
      return true;
    }
    if (muteConfig.flag === 1 && (!Number.isFinite(muteConfig.durationMs) || muteConfig.durationMs <= 0)) {
      await interaction.reply({ content: "Hata: Muted rol aktifse muted süresi 1m-4w aralığında olmalı.", ephemeral: true });
      return true;
    }

    cfg.spam = {
      ...(cfg.spam || {}),
      maxMessages,
      perSeconds,
    };
    cfg.toggles ||= {};
    cfg.timeouts ||= {};
    cfg.muteOnViolation ||= {};
    cfg.muteDurations ||= {};
    cfg.toggles.spam = true;
    cfg.timeouts.spam = timeoutMs;
    cfg.muteOnViolation.spam = muteConfig.flag;
    cfg.muteDurations.spam = muteConfig.flag === 1 ? muteConfig.durationMs : 0;
    markRuleConfigured(cfg, "spam");

    await client.db.set(`prot_cfg_${gid}`, cfg);
    await refreshPanels(interaction, client, cfg);

    await interaction.reply({
      content:
        `Başarılı: Spam koruma ayarları kaydedildi ve koruma açıldı. ` +
        `Timeout: ${formatDurationShort(timeoutMs)} | Muted rol: ${muteConfig.flag} | Muted süre: ${formatMuteSummary(muteConfig.flag, muteConfig.durationMs)}\n\n` +
        "Spam muaf rol/kanal seçmek istersen aşağıdan seç:",
      components: buildSpamExemptSelectRows(cfg),
      ephemeral: true,
    });
    return true;
  }

  if (type === "flood") {
    const maxMessages = parseIntWithSavedFallback(
      interaction.fields.getTextInputValue("maxMessages"),
      cfg?.flood?.maxMessages
    );
    const windowMs = parseSecondsOrDurationWithSavedFallback(
      interaction.fields.getTextInputValue("window"),
      cfg?.flood?.windowMs
    );
    const timeoutMs = parseTimeoutWithSavedFallback(
      getFieldValue(interaction, "timeout", "0"),
      cfg?.timeouts?.flood
    );
    const muteConfig = parseMuteConfigWithSavedFallback(
      getFieldValue(interaction, "muteRole", "0"),
      getFieldValue(interaction, "muteDuration", "0"),
      getConfiguredMuteFlag(cfg, "flood"),
      getConfiguredMuteDurationMs(cfg, "flood")
    );

    if (!Number.isFinite(maxMessages) || maxMessages < 2 || maxMessages > 50) {
      await interaction.reply({ content: "Hata: Max mesaj 2-50 aralığında olmalı.", ephemeral: true });
      return true;
    }
    if (!windowMs || windowMs < 3000 || windowMs > 120_000) {
      await interaction.reply({ content: "Hata: Süre 3s - 2m aralığında olmalı.", ephemeral: true });
      return true;
    }
    if (timeoutMs === null) {
      await interaction.reply({ content: "Hata: Timeout süresi 0 veya 1m-4w olmalı. Birimler: m=minute h=hours d=days w=week. Örnek: 5m 10h 7d 2w", ephemeral: true });
      return true;
    }
    if (!muteConfig) {
      await interaction.reply({ content: "Hata: Muted rol alanı sadece `0` veya `1` olmalı.", ephemeral: true });
      return true;
    }
    if (muteConfig.flag === 1 && (!Number.isFinite(muteConfig.durationMs) || muteConfig.durationMs <= 0)) {
      await interaction.reply({ content: "Hata: Muted rol aktifse muted süresi 1m-4w aralığında olmalı.", ephemeral: true });
      return true;
    }

    cfg.flood = {
      ...(cfg.flood || {}),
      maxMessages,
      windowMs,
    };
    cfg.toggles ||= {};
    cfg.timeouts ||= {};
    cfg.muteOnViolation ||= {};
    cfg.muteDurations ||= {};
    cfg.toggles.flood = true;
    cfg.timeouts.flood = timeoutMs;
    cfg.muteOnViolation.flood = muteConfig.flag;
    cfg.muteDurations.flood = muteConfig.flag === 1 ? muteConfig.durationMs : 0;
    markRuleConfigured(cfg, "flood");

    await client.db.set(`prot_cfg_${gid}`, cfg);
    await refreshPanels(interaction, client, cfg);

    await interaction.reply({
      content:
        `Başarılı: Flood koruma ayarları kaydedildi ve koruma açıldı. ` +
        `Timeout: ${formatDurationShort(timeoutMs)} | Muted rol: ${muteConfig.flag} | Muted süre: ${formatMuteSummary(muteConfig.flag, muteConfig.durationMs)}\n\n` +
        "Flood muaf rol/kanal seçmek istersen aşağıdan seç:",
      components: buildFloodExemptSelectRows(cfg),
      ephemeral: true,
    });
    return true;
  }

  if (type === "links") {
    const maxMessages = parseIntWithSavedFallback(
      interaction.fields.getTextInputValue("maxMessages"),
      cfg?.links?.maxMessages
    );
    const perSeconds = LINKS_FIXED_WINDOW_SECONDS;
    const timeoutMs = parseTimeoutWithSavedFallback(
      getFieldValue(interaction, "timeout", "0"),
      cfg?.timeouts?.links
    );
    const muteConfig = parseMuteConfigWithSavedFallback(
      getFieldValue(interaction, "muteRole", "0"),
      getFieldValue(interaction, "muteDuration", "0"),
      getConfiguredMuteFlag(cfg, "links"),
      getConfiguredMuteDurationMs(cfg, "links")
    );
    const allowedLinks = parseAllowedLinksWithSavedFallback(
      getFieldValue(interaction, "allowedLinks", "0"),
      cfg?.links?.allowedLinks || cfg?.links?.allowList || cfg?.links?.allowed || []
    );

    if (!Number.isFinite(maxMessages) || maxMessages < 1 || maxMessages > 50) {
      await interaction.reply({ content: "Hata: Max link mesajı 1-50 aralığında olmalı.", ephemeral: true });
      return true;
    }
    if (timeoutMs === null) {
      await interaction.reply({ content: "Hata: Timeout süresi 0 veya 1m-4w olmalı. Birimler: m=minute h=hours d=days w=week. Örnek: 5m 10h 7d 2w", ephemeral: true });
      return true;
    }
    if (!muteConfig) {
      await interaction.reply({ content: "Hata: Muted rol alanı sadece `0` veya `1` olmalı.", ephemeral: true });
      return true;
    }
    if (muteConfig.flag === 1 && (!Number.isFinite(muteConfig.durationMs) || muteConfig.durationMs <= 0)) {
      await interaction.reply({ content: "Hata: Muted rol aktifse muted süresi 1m-4w aralığında olmalı.", ephemeral: true });
      return true;
    }

    await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

    cfg.links = {
      ...(cfg.links || {}),
      maxMessages,
      perSeconds,
      allowedLinks,
    };
    cfg.toggles ||= {};
    cfg.timeouts ||= {};
    cfg.muteOnViolation ||= {};
    cfg.muteDurations ||= {};
    cfg.toggles.links = true;
    cfg.timeouts.links = timeoutMs;
    cfg.muteOnViolation.links = muteConfig.flag;
    cfg.muteDurations.links = muteConfig.flag === 1 ? muteConfig.durationMs : 0;
    markRuleConfigured(cfg, "links");

    await client.db.set(`prot_cfg_${gid}`, cfg);
    const sync = await syncLinksAutoModWithConfig(interaction, client, cfg);
    const mergedCfg = sync?.cfg || cfg;
    await refreshPanels(interaction, client, mergedCfg);
    const syncNote = getAutoModSyncNote(sync);

    await interaction.editReply({
      content:
        `Başarılı: ${CHAT_LABEL[type]} ayarı kaydedildi ve koruma açıldı. ` +
        `Eşik: ${maxMessages} mesaj / ${perSeconds}s | Timeout: ${formatDurationShort(timeoutMs)} | Muted rol: ${muteConfig.flag} | Muted süre: ${formatMuteSummary(muteConfig.flag, muteConfig.durationMs)}\n\n` +
        "Link muaf rol/kanal seçmek istersen aşağıdan seç:" +
        syncNote,
      components: buildLinkExemptSelectRows(mergedCfg),
    });
    return true;
  }

  if (type === "invite") {
    const timeoutMs = parseTimeoutWithSavedFallback(
      getFieldValue(interaction, "timeout", "0"),
      cfg?.timeouts?.invite
    );
    const muteConfig = parseMuteConfigWithSavedFallback(
      getFieldValue(interaction, "muteRole", "0"),
      getFieldValue(interaction, "muteDuration", "0"),
      getConfiguredMuteFlag(cfg, "invite"),
      getConfiguredMuteDurationMs(cfg, "invite")
    );

    if (timeoutMs === null) {
      await interaction.reply({ content: "Hata: Timeout süresi 0 veya 1m-4w olmalı. Birimler: m=minute h=hours d=days w=week. Örnek: 5m 10h 7d 2w", ephemeral: true });
      return true;
    }
    if (!muteConfig) {
      await interaction.reply({ content: "Hata: Muted rol alanı sadece `0` veya `1` olmalı.", ephemeral: true });
      return true;
    }
    if (muteConfig.flag === 1 && (!Number.isFinite(muteConfig.durationMs) || muteConfig.durationMs <= 0)) {
      await interaction.reply({ content: "Hata: Muted rol aktifse muted süresi 1m-4w aralığında olmalı.", ephemeral: true });
      return true;
    }

    await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

    cfg.invite = {
      ...(cfg.invite || {}),
    };
    cfg.toggles ||= {};
    cfg.timeouts ||= {};
    cfg.muteOnViolation ||= {};
    cfg.muteDurations ||= {};
    cfg.toggles.invite = true;
    cfg.timeouts.invite = timeoutMs;
    cfg.muteOnViolation.invite = muteConfig.flag;
    cfg.muteDurations.invite = muteConfig.flag === 1 ? muteConfig.durationMs : 0;
    markRuleConfigured(cfg, "invite");

    await client.db.set(`prot_cfg_${gid}`, cfg);
    const sync = await syncInviteAutoModWithConfig(interaction, client, cfg);
    const mergedCfg = sync?.cfg || cfg;
    await refreshPanels(interaction, client, mergedCfg);
    const syncNote = getAutoModSyncNote(sync);

    await interaction.editReply({
      content:
        `Başarılı: Invite engeli ayarı kaydedildi ve koruma açıldı. ` +
        `Timeout: ${formatDurationShort(timeoutMs)} | Muted rol: ${muteConfig.flag} | Muted süre: ${formatMuteSummary(muteConfig.flag, muteConfig.durationMs)}` +
        syncNote,
    });
    return true;
  }

  if (type === "profanity") {
    const profanitySaved = normalizeProfanityConfig(cfg);
    const level = parseProfanityLevelWithSavedFallback(
      getFieldValue(interaction, "level", profanitySaved.level),
      profanitySaved.level
    );
    const timeoutMs = parseTimeoutWithSavedFallback(
      getFieldValue(interaction, "timeout", "0"),
      cfg?.timeouts?.profanity
    );
    const muteConfig = parseMuteConfigWithSavedFallback(
      getFieldValue(interaction, "muteRole", "0"),
      getFieldValue(interaction, "muteDuration", "0"),
      getConfiguredMuteFlag(cfg, "profanity"),
      getConfiguredMuteDurationMs(cfg, "profanity")
    );

    if (!["dini_milli", "az", "orta", "cok"].includes(level)) {
      await interaction.reply({ content: "Hata: Seviye sadece DiniMilli, Az, Orta veya Cok olabilir.", ephemeral: true });
      return true;
    }
    if (timeoutMs === null) {
      await interaction.reply({ content: "Hata: Timeout süresi 0 veya 1m-4w olmalı. Birimler: m=minute h=hours d=days w=week. Örnek: 5m 10h 7d 2w", ephemeral: true });
      return true;
    }
    if (!muteConfig) {
      await interaction.reply({ content: "Hata: Muted rol alanı sadece `0` veya `1` olmalı.", ephemeral: true });
      return true;
    }
    if (muteConfig.flag === 1 && (!Number.isFinite(muteConfig.durationMs) || muteConfig.durationMs <= 0)) {
      await interaction.reply({ content: "Hata: Muted rol aktifse muted süresi 1m-4w aralığında olmalı.", ephemeral: true });
      return true;
    }

    await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

    cfg.profanity = {
      ...(cfg.profanity || {}),
      level,
    };
    cfg.toggles ||= {};
    cfg.timeouts ||= {};
    cfg.muteOnViolation ||= {};
    cfg.muteDurations ||= {};
    cfg.toggles.profanity = true;
    cfg.timeouts.profanity = timeoutMs;
    cfg.muteOnViolation.profanity = muteConfig.flag;
    cfg.muteDurations.profanity = muteConfig.flag === 1 ? muteConfig.durationMs : 0;
    markRuleConfigured(cfg, "profanity");

    await client.db.set(`prot_cfg_${gid}`, cfg);
    const sync = await syncProfanityAutoModWithConfig(interaction, client, cfg);
    const mergedCfg = sync?.cfg || cfg;
    await refreshPanels(interaction, client, mergedCfg);
    const syncNote = getAutoModSyncNote(sync);

    const levelText =
      level === "dini_milli" ? "Sadece Dini ve Milli Kufur" :
      level === "cok" ? "Cok" :
      level === "az" ? "Az" :
      "Orta";
    await interaction.editReply({
      content:
        `Başarılı: Küfür engeli ayarı kaydedildi ve koruma açıldı. ` +
        `Seviye: ${levelText} | Timeout: ${formatDurationShort(timeoutMs)} | Muted rol: ${muteConfig.flag} | Muted süre: ${formatMuteSummary(muteConfig.flag, muteConfig.durationMs)}\n\n` +
        "Küfür muaf rol/kanal seçmek istersen aşağıdan seç:" +
        syncNote,
      components: buildProfanityExemptSelectRows(mergedCfg),
    });
    return true;
  }

  if (type === "emoji") {
    const maxCount = parseIntWithSavedFallback(
      interaction.fields.getTextInputValue("maxCount"),
      cfg?.emoji?.maxCount
    );
    const perSeconds = parseIntWithSavedFallback(
      interaction.fields.getTextInputValue("perSeconds"),
      cfg?.emoji?.perSeconds
    );
    const timeoutMs = parseTimeoutWithSavedFallback(
      getFieldValue(interaction, "timeout", "0"),
      cfg?.timeouts?.emoji
    );
    const muteConfig = parseMuteConfigWithSavedFallback(
      getFieldValue(interaction, "muteRole", "0"),
      getFieldValue(interaction, "muteDuration", "0"),
      getConfiguredMuteFlag(cfg, "emoji"),
      getConfiguredMuteDurationMs(cfg, "emoji")
    );

    if (!Number.isFinite(maxCount) || maxCount < 2 || maxCount > 100) {
      await interaction.reply({ content: "Hata: Max emoji sayısı 2-100 aralığında olmalı.", ephemeral: true });
      return true;
    }
    if (!Number.isFinite(perSeconds) || perSeconds < 2 || perSeconds > 120) {
      await interaction.reply({ content: "Hata: Süre 2-120 saniye aralığında olmalı.", ephemeral: true });
      return true;
    }
    if (timeoutMs === null) {
      await interaction.reply({ content: "Hata: Timeout süresi 0 veya 1m-4w olmalı. Birimler: m=minute h=hours d=days w=week. Örnek: 5m 10h 7d 2w", ephemeral: true });
      return true;
    }
    if (!muteConfig) {
      await interaction.reply({ content: "Hata: Muted rol alanı sadece `0` veya `1` olmalı.", ephemeral: true });
      return true;
    }
    if (muteConfig.flag === 1 && (!Number.isFinite(muteConfig.durationMs) || muteConfig.durationMs <= 0)) {
      await interaction.reply({ content: "Hata: Muted rol aktifse muted süresi 1m-4w aralığında olmalı.", ephemeral: true });
      return true;
    }

    cfg.emoji = {
      ...(cfg.emoji || {}),
      maxCount,
      perSeconds,
    };
    cfg.toggles ||= {};
    cfg.timeouts ||= {};
    cfg.muteOnViolation ||= {};
    cfg.muteDurations ||= {};
    cfg.toggles.emoji = true;
    cfg.timeouts.emoji = timeoutMs;
    cfg.muteOnViolation.emoji = muteConfig.flag;
    cfg.muteDurations.emoji = muteConfig.flag === 1 ? muteConfig.durationMs : 0;
    markRuleConfigured(cfg, "emoji");

    await client.db.set(`prot_cfg_${gid}`, cfg);
    await refreshPanels(interaction, client, cfg);

    await interaction.reply({
      content:
        `Başarılı: ${CHAT_LABEL[type]} ayarı kaydedildi ve koruma açıldı. ` +
        `Eşik: ${maxCount} emoji / ${perSeconds}s | Timeout: ${formatDurationShort(timeoutMs)} | Muted rol: ${muteConfig.flag} | Muted süre: ${formatMuteSummary(muteConfig.flag, muteConfig.durationMs)}\n\n` +
        "Emoji muaf rol/kanal seçmek istersen aşağıdan seç:",
      components: buildEmojiExemptSelectRows(cfg),
      ephemeral: true,
    });
    return true;
  }

  if (type === "mentions") {
    const maxCount = parseIntWithSavedFallback(
      interaction.fields.getTextInputValue("maxCount"),
      cfg?.mentions?.maxCount
    );
    const perSeconds = parseIntWithSavedFallback(
      interaction.fields.getTextInputValue("perSeconds"),
      cfg?.mentions?.perSeconds
    );
    const timeoutMs = parseTimeoutWithSavedFallback(
      getFieldValue(interaction, "timeout", "0"),
      cfg?.timeouts?.mentions
    );
    const muteConfig = parseMuteConfigWithSavedFallback(
      getFieldValue(interaction, "muteRole", "0"),
      getFieldValue(interaction, "muteDuration", "0"),
      getConfiguredMuteFlag(cfg, "mentions"),
      getConfiguredMuteDurationMs(cfg, "mentions")
    );

    if (!Number.isFinite(maxCount) || maxCount < 1 || maxCount > 100) {
      await interaction.reply({ content: "Hata: Max etiket sayısı 1-100 aralığında olmalı.", ephemeral: true });
      return true;
    }
    if (!Number.isFinite(perSeconds) || perSeconds < 2 || perSeconds > 120) {
      await interaction.reply({ content: "Hata: Süre 2-120 saniye aralığında olmalı.", ephemeral: true });
      return true;
    }
    if (timeoutMs === null) {
      await interaction.reply({ content: "Hata: Timeout süresi 0 veya 1m-4w olmalı. Birimler: m=minute h=hours d=days w=week. Örnek: 5m 10h 7d 2w", ephemeral: true });
      return true;
    }
    if (!muteConfig) {
      await interaction.reply({ content: "Hata: Muted rol alanı sadece `0` veya `1` olmalı.", ephemeral: true });
      return true;
    }
    if (muteConfig.flag === 1 && (!Number.isFinite(muteConfig.durationMs) || muteConfig.durationMs <= 0)) {
      await interaction.reply({ content: "Hata: Muted rol aktifse muted süresi 1m-4w aralığında olmalı.", ephemeral: true });
      return true;
    }

    await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

    cfg.mentions = {
      ...(cfg.mentions || {}),
      maxCount,
      perSeconds,
    };
    cfg.toggles ||= {};
    cfg.timeouts ||= {};
    cfg.muteOnViolation ||= {};
    cfg.muteDurations ||= {};
    cfg.toggles.mentions = true;
    cfg.timeouts.mentions = timeoutMs;
    cfg.muteOnViolation.mentions = muteConfig.flag;
    cfg.muteDurations.mentions = muteConfig.flag === 1 ? muteConfig.durationMs : 0;
    markRuleConfigured(cfg, "mentions");

    await client.db.set(`prot_cfg_${gid}`, cfg);
    const sync = await syncMentionsAutoModWithConfig(interaction, client, cfg);
    const mergedCfg = sync?.cfg || cfg;
    await refreshPanels(interaction, client, mergedCfg);
    const syncNote = getAutoModSyncNote(sync);

    await interaction.editReply({
      content:
        `Başarılı: ${CHAT_LABEL[type]} ayarı kaydedildi ve koruma açıldı. ` +
        `Eşik: ${maxCount} etiket / ${perSeconds}s | Timeout: ${formatDurationShort(timeoutMs)} | Muted rol: ${muteConfig.flag} | Muted süre: ${formatMuteSummary(muteConfig.flag, muteConfig.durationMs)}\n\n` +
        "Etiket muaf rol/kanal seçmek istersen aşağıdan seç:" +
        syncNote,
      components: buildMentionsExemptSelectRows(mergedCfg),
    });
    return true;
  }

  if (type === "everyone") {
    const maxCount = parseIntWithSavedFallback(
      getFieldValue(interaction, "maxCount", "0"),
      cfg?.everyone?.maxCount
    );
    const perSeconds = parseIntWithSavedFallback(
      interaction.fields.getTextInputValue("perSeconds"),
      cfg?.everyone?.perSeconds
    );
    const timeoutMs = parseTimeoutWithSavedFallback(
      getFieldValue(interaction, "timeout", "0"),
      cfg?.timeouts?.everyone
    );
    const muteConfig = parseMuteConfigWithSavedFallback(
      getFieldValue(interaction, "muteRole", "0"),
      getFieldValue(interaction, "muteDuration", "0"),
      getConfiguredMuteFlag(cfg, "everyone"),
      getConfiguredMuteDurationMs(cfg, "everyone")
    );

    if (!Number.isFinite(maxCount) || maxCount < 0 || maxCount > 20) {
      await interaction.reply({ content: "Hata: Max everyone/here 0-20 aralığında olmalı.", ephemeral: true });
      return true;
    }
    if (!Number.isFinite(perSeconds) || perSeconds < 2 || perSeconds > 120) {
      await interaction.reply({ content: "Hata: Süre 2-120 saniye aralığında olmalı.", ephemeral: true });
      return true;
    }
    if (timeoutMs === null) {
      await interaction.reply({ content: "Hata: Timeout süresi 0 veya 1m-4w olmalı. Birimler: m=minute h=hours d=days w=week. Örnek: 5m 10h 7d 2w", ephemeral: true });
      return true;
    }
    if (!muteConfig) {
      await interaction.reply({ content: "Hata: Muted rol alanı sadece `0` veya `1` olmalı.", ephemeral: true });
      return true;
    }
    if (muteConfig.flag === 1 && (!Number.isFinite(muteConfig.durationMs) || muteConfig.durationMs <= 0)) {
      await interaction.reply({ content: "Hata: Muted rol aktifse muted süresi 1m-4w aralığında olmalı.", ephemeral: true });
      return true;
    }

    cfg.everyone = {
      ...(cfg.everyone || {}),
      maxCount,
      perSeconds,
    };
    cfg.toggles ||= {};
    cfg.timeouts ||= {};
    cfg.muteOnViolation ||= {};
    cfg.muteDurations ||= {};
    cfg.toggles.everyone = true;
    cfg.timeouts.everyone = timeoutMs;
    cfg.muteOnViolation.everyone = muteConfig.flag;
    cfg.muteDurations.everyone = muteConfig.flag === 1 ? muteConfig.durationMs : 0;
    markRuleConfigured(cfg, "everyone");

    await client.db.set(`prot_cfg_${gid}`, cfg);
    await refreshPanels(interaction, client, cfg);

    await interaction.reply({
      content:
        `Başarılı: ${CHAT_LABEL[type]} ayarı kaydedildi ve koruma açıldı. ` +
        `Eşik: ${maxCount} everyone/here / ${perSeconds}s | Timeout: ${formatDurationShort(timeoutMs)} | Muted rol: ${muteConfig.flag} | Muted süre: ${formatMuteSummary(muteConfig.flag, muteConfig.durationMs)}\n\n` +
        "Everyone muaf rol/kanal seçmek istersen aşağıdan seç:",
      components: buildEveryoneExemptSelectRows(cfg),
      ephemeral: true,
    });
    return true;
  }

  return false;
}

async function openLimitModal(interaction, actionKey, cfg, opts = {}) {
  const zeroDefaults = opts?.zeroDefaults === true;
  const title = ACTION_LABEL[actionKey] || "Limit Ayarla";
  const prev = cfg?.limits?.[actionKey];

  const modal = new ModalBuilder()
    .setCustomId(`limit:${actionKey}:save`)
    .setTitle(title);

  const limitInput = new TextInputBuilder()
    .setCustomId("limit")
    .setLabel("Limit")
    .setPlaceholder("Örn: 3")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const durationInput = new TextInputBuilder()
    .setCustomId("duration")
    .setLabel("Süre (örn: 5m 10h 7d 2w)")
    .setPlaceholder(CHAT_TIMEOUT_INPUT_PLACEHOLDER)
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  limitInput.setValue(zeroDefaults ? "0" : (prev?.limit ? String(prev.limit) : "0"));
  durationInput.setValue(zeroDefaults ? "0" : (prev?.windowMs ? formatDurationMhdw(prev.windowMs) : "0"));

  modal.addComponents(
    new ActionRowBuilder().addComponents(limitInput),
    new ActionRowBuilder().addComponents(durationInput)
  );

  await interaction.showModal(modal);
  return true;
}

async function handleLimitSelect(interaction, client, actionKey) {
  if (!LIMIT_KEYS.has(actionKey)) return false;

  const cfg = await getConfig(client.db, interaction.guildId);
  if (cfg?.toggles?.[actionKey]) {
    return promptDisable(
      interaction,
      `${ACTION_LABEL[actionKey]} açık. Kapatmak ister misin?`,
      `${LIMIT_DISABLE_PREFIX}:${actionKey}`,
      `${ACTION_LABEL[actionKey]} Kapat`,
      {
        editCustomId: `${LIMIT_EDIT_PREFIX}:${actionKey}`,
        editLabel: `${ACTION_LABEL[actionKey]} Ayarını Düzenle`,
      }
    );
  }

  return openLimitModal(interaction, actionKey, cfg, { zeroDefaults: !isLimitConfigured(cfg, actionKey) });
}

async function handleLimitModalSubmit(interaction, client) {
  const parts = String(interaction.customId).split(":");
  const actionKey = parts[1];
  if (!LIMIT_KEYS.has(actionKey)) return false;

  const limitStr = interaction.fields.getTextInputValue("limit");
  const durationStr = interaction.fields.getTextInputValue("duration");
  const gid = interaction.guildId;
  const cfg = await getConfig(client.db, gid);
  const prevLimitCfg = cfg?.limits?.[actionKey] || {};

  const limit = parseIntWithSavedFallback(limitStr, prevLimitCfg?.limit);
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    await interaction.reply({ content: "Hata: Limit 1-100 aralığında olmalı.", ephemeral: true });
    return true;
  }

  const windowMs = parseTimeoutWithSavedFallback(durationStr, prevLimitCfg?.windowMs);
  if (windowMs === null || windowMs <= 0) {
    await interaction.reply({ content: "Hata: Süre 1m-4w olmalı. Birimler: m=minute h=hours d=days w=week. Örnek: 5m 10h 7d 2w", ephemeral: true });
    return true;
  }

  cfg.limits ||= {};
  cfg.toggles ||= {};

  const prevExempt = cfg.limits?.[actionKey]?.exemptUsers || [];
  cfg.limits[actionKey] = { limit, windowMs, exemptUsers: prevExempt };
  cfg.toggles[actionKey] = true;
  markLimitConfigured(cfg, actionKey);

  await client.db.set(`prot_cfg_${gid}`, cfg);
  await refreshPanels(interaction, client, cfg);

  const userSelect = new UserSelectMenuBuilder()
    .setCustomId(`limit:${actionKey}:exempt`)
    .setPlaceholder("Muaf kullanıcıları seç (opsiyonel)")
    .setMinValues(0)
    .setMaxValues(10);

  await interaction.reply({
    content:
      `Başarılı: ${ACTION_LABEL[actionKey]} ayarlandı ve koruma açıldı.\n` +
      `- Limit: ${limit}\n` +
      `- Süre: ${formatDurationShort(windowMs)}\n\n` +
      "Muaf kullanıcı seçmek istersen aşağıdan seç:",
    components: [new ActionRowBuilder().addComponents(userSelect)],
    ephemeral: true,
  });

  return true;
}

async function handleExemptSelect(interaction, client) {
  const parts = String(interaction.customId).split(":");
  const actionKey = parts[1];
  const selected = interaction.values || [];

  const gid = interaction.guildId;
  const cfg = await getConfig(client.db, gid);

  cfg.limits ||= {};
  cfg.limits[actionKey] ||= { limit: 3, windowMs: 60_000, exemptUsers: [] };
  cfg.limits[actionKey].exemptUsers = selected;
  markLimitConfigured(cfg, actionKey);

  await client.db.set(`prot_cfg_${gid}`, cfg);

  await interaction.update({
    content: `Başarılı: Muaf kullanıcılar kaydedildi (${selected.length} kişi).`,
    components: [],
  });

  return true;
}

async function takeManualSnapshot(interaction, client) {
  if (!interaction.deferred && !interaction.replied) {
    await (interaction.deferUpdate() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  const gid = interaction.guildId;
  const cfg = await getConfig(client.db, gid);
  const guild = interaction.guild;
  if (!guild) return false;

  cfg.snapshots = buildSnapshotsFromGuild(guild);
  await client.db.set(`prot_cfg_${gid}`, cfg);

  await refreshPanels(interaction, client, cfg);
  await interaction.followUp({
    content: "Başarılı: Snapshot alındı.",
    ephemeral: true,
  }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

  return true;
}

function isProtectionCustomId(customId) {
  const id = String(customId || "");
  if (!id) return false;
  if (id.startsWith("prot:") || id.startsWith("limit:") || id.startsWith("settings:")) {
    return true;
  }
  return /^(caps|links|profanity|emoji|mentions|flood|spam|everyone):exempt:(roles|channels)$/.test(id);
}

async function handleLimitUI(interaction, client) {
  if (!interaction.guildId) return false;
  if (!isProtectionCustomId(interaction.customId)) return false;

  try {
  if (!isAdmin(interaction)) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Bu işlem için Yönetici yetkisi gerekli.",
        ephemeral: true,
      }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
    return true;
  }

  if (interaction.isButton() && interaction.customId === "prot:all:setup") {
    if (!interaction.deferred && !interaction.replied) {
      await (interaction.deferUpdate() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }

    const gid = interaction.guildId;
    const patch = { toggles: {} };
    for (const k of TOGGLE_KEYS) patch.toggles[k] = true;

    let merged = await setConfig(client.db, gid, patch);
    if (interaction.guild) {
      merged.snapshots = buildSnapshotsFromGuild(interaction.guild);
      await client.db.set(`prot_cfg_${gid}`, merged);
    }
    const sync = await syncLinksAutoModWithConfig(interaction, client, merged);
    merged = sync?.cfg || merged;
    const inviteSync = await syncInviteAutoModWithConfig(interaction, client, merged);
    merged = inviteSync?.cfg || merged;
    const profanitySync = await syncProfanityAutoModWithConfig(interaction, client, merged);
    merged = profanitySync?.cfg || merged;
    const mentionsSync = await syncMentionsAutoModWithConfig(interaction, client, merged);
    merged = mentionsSync?.cfg || merged;

    await refreshPanels(interaction, client, merged);
    return true;
  }

  if (interaction.isButton() && interaction.customId === "prot:all:disable") {
    if (!interaction.deferred && !interaction.replied) {
      await (interaction.deferUpdate() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }

    const gid = interaction.guildId;
    const patch = { toggles: {} };
    for (const k of TOGGLE_KEYS) patch.toggles[k] = false;

    let merged = await setConfig(client.db, gid, patch);
    const sync = await syncLinksAutoModWithConfig(interaction, client, merged);
    merged = sync?.cfg || merged;
    const inviteSync = await syncInviteAutoModWithConfig(interaction, client, merged);
    merged = inviteSync?.cfg || merged;
    const profanitySync = await syncProfanityAutoModWithConfig(interaction, client, merged);
    merged = profanitySync?.cfg || merged;
    const mentionsSync = await syncMentionsAutoModWithConfig(interaction, client, merged);
    merged = mentionsSync?.cfg || merged;

    await refreshPanels(interaction, client, merged);
    return true;
  }

  if (interaction.isButton() && interaction.customId === "prot:snapshot:take") {
    // Eski panel mesajı kalan sunucular için geriye dönük destek.
    return takeManualSnapshot(interaction, client);
  }

  if (interaction.isButton() && String(interaction.customId).startsWith(`${CHAT_EDIT_PREFIX}:`)) {
    const key = String(interaction.customId).split(":")[3];
    return openChatSettingsModalForKey(interaction, client, key);
  }

  if (interaction.isButton() && interaction.customId === RAID_EDIT_ID) {
    const cfg = await getConfig(client.db, interaction.guildId);
    return openSettingsModal(interaction, "raid", cfg, { zeroDefaults: false });
  }

  if (interaction.isButton() && String(interaction.customId).startsWith(`${LIMIT_EDIT_PREFIX}:`)) {
    const actionKey = String(interaction.customId).split(":")[3];
    if (!LIMIT_KEYS.has(actionKey)) return false;
    const cfg = await getConfig(client.db, interaction.guildId);
    return openLimitModal(interaction, actionKey, cfg, { zeroDefaults: false });
  }

  if (interaction.isButton()) {
    for (const [key, def] of Object.entries(CHAT_DISABLE_BUTTONS)) {
      if (interaction.customId === def.id) {
        return disableFromButton(interaction, client, key, CHAT_LABEL[key]);
      }
    }
  }

  if (interaction.isButton() && interaction.customId === RAID_DISABLE_CONFIRM_ID) {
    return disableFromButton(interaction, client, "antiRaid", "Raid koruma");
  }

  if (interaction.isButton() && String(interaction.customId).startsWith(`${LIMIT_DISABLE_PREFIX}:`)) {
    const actionKey = String(interaction.customId).split(":")[3];
    if (!LIMIT_KEYS.has(actionKey)) return false;
    return disableFromButton(interaction, client, actionKey, ACTION_LABEL[actionKey]);
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "prot:ui:limits") {
    const v = interaction.values?.[0];
    if (!v) return false;
    let handled = false;

    if (v.startsWith("limit:") && v.endsWith(":open")) {
      // Eski panel seçenekleri için geriye dönük destek.
      const [, actionKey] = v.split(":");
      const cfg = await getConfig(client.db, interaction.guildId);
      handled = await openLimitModal(interaction, actionKey, cfg, {
        zeroDefaults: !isLimitConfigured(cfg, actionKey),
      });
      if (handled) resetSelectMenuState(interaction, client, cfg).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return handled;
    }

    if (v.startsWith("tg:")) {
      const key = v.slice(3);
      if (LIMIT_KEYS.has(key)) handled = await handleLimitSelect(interaction, client, key);
      else handled = await handleToggle(interaction, client, key);

      if (handled) resetSelectMenuState(interaction, client).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return handled;
    }

    return false;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "prot:ui:chat") {
    const v = interaction.values?.[0];
    if (!v) return false;
    let handled = false;

    if (v.startsWith("tg:")) {
      const key = v.slice(3);
      if (CHAT_TIMEOUT_KEYS.has(key)) handled = await handleChatToggleSelect(interaction, client, key);
      else handled = await handleToggle(interaction, client, key);

      if (handled) resetSelectMenuState(interaction, client).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return handled;
    }
    return false;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "prot:ui:server") {
    const v = interaction.values?.[0];
    if (!v) return false;
    let handled = false;

    if (v === "tg:antiRaid") {
      const cfg = await getConfig(client.db, interaction.guildId);
      if (cfg?.toggles?.antiRaid) {
        handled = await promptDisable(
          interaction,
          "Raid koruma açık. Kapatmak ister misin?",
          RAID_DISABLE_CONFIRM_ID,
          "Raid Korumayı Kapat",
          {
            editCustomId: RAID_EDIT_ID,
            editLabel: "Raid Ayarını Düzenle",
          }
        );
      } else {
        handled = await openSettingsModal(interaction, "raid", cfg, {
          zeroDefaults: !isRuleConfigured(cfg, "raid"),
        });
      }
      if (handled) resetSelectMenuState(interaction, client, cfg).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return handled;
    }

    if (v === "tg:roleperm") {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "Role İzin Verme koruma panelden kaldırıldı.",
          ephemeral: true,
        }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      resetSelectMenuState(interaction, client).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return true;
    }

    if (v.startsWith("tg:")) {
      handled = await handleToggle(interaction, client, v.slice(3));
      if (handled) resetSelectMenuState(interaction, client).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return handled;
    }
    return false;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "prot:ui:settings") {
    const v = interaction.values?.[0];
    if (!v || !v.startsWith("settings:")) return false;
    const type = v.split(":")[1];
    const cfg = await getConfig(client.db, interaction.guildId);
    return openSettingsModal(interaction, type, cfg, {
      zeroDefaults: !isRuleConfigured(cfg, type),
    });
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("limit:") && interaction.customId.endsWith(":save")) {
    return handleLimitModalSubmit(interaction, client);
  }

  if (interaction.isModalSubmit() && interaction.customId === CAPS_SETTINGS_MODAL_ID) {
    return handleCapsModalSubmit(interaction, client);
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("settings:") && interaction.customId.endsWith(":save")) {
    return handleSettingsModalSubmit(interaction, client);
  }

  if (interaction.isRoleSelectMenu() && interaction.customId === CAPS_EXEMPT_ROLES_SELECT_ID) {
    return handleCapsExemptRolesSelect(interaction, client);
  }

  if (interaction.isRoleSelectMenu() && interaction.customId === LINKS_EXEMPT_ROLES_SELECT_ID) {
    return handleLinksExemptRolesSelect(interaction, client);
  }

  if (interaction.isRoleSelectMenu() && interaction.customId === PROFANITY_EXEMPT_ROLES_SELECT_ID) {
    return handleProfanityExemptRolesSelect(interaction, client);
  }
  if (interaction.isRoleSelectMenu() && interaction.customId === EMOJI_EXEMPT_ROLES_SELECT_ID) {
    return handleEmojiExemptRolesSelect(interaction, client);
  }
  if (interaction.isRoleSelectMenu() && interaction.customId === MENTIONS_EXEMPT_ROLES_SELECT_ID) {
    return handleMentionsExemptRolesSelect(interaction, client);
  }
  if (interaction.isRoleSelectMenu() && interaction.customId === FLOOD_EXEMPT_ROLES_SELECT_ID) {
    return handleFloodExemptRolesSelect(interaction, client);
  }
  if (interaction.isRoleSelectMenu() && interaction.customId === SPAM_EXEMPT_ROLES_SELECT_ID) {
    return handleSpamExemptRolesSelect(interaction, client);
  }
  if (interaction.isRoleSelectMenu() && interaction.customId === EVERYONE_EXEMPT_ROLES_SELECT_ID) {
    return handleEveryoneExemptRolesSelect(interaction, client);
  }

  if (interaction.isChannelSelectMenu() && interaction.customId === CAPS_EXEMPT_CHANNELS_SELECT_ID) {
    return handleCapsExemptChannelsSelect(interaction, client);
  }

  if (interaction.isChannelSelectMenu() && interaction.customId === LINKS_EXEMPT_CHANNELS_SELECT_ID) {
    return handleLinksExemptChannelsSelect(interaction, client);
  }

  if (interaction.isChannelSelectMenu() && interaction.customId === PROFANITY_EXEMPT_CHANNELS_SELECT_ID) {
    return handleProfanityExemptChannelsSelect(interaction, client);
  }
  if (interaction.isChannelSelectMenu() && interaction.customId === EMOJI_EXEMPT_CHANNELS_SELECT_ID) {
    return handleEmojiExemptChannelsSelect(interaction, client);
  }
  if (interaction.isChannelSelectMenu() && interaction.customId === MENTIONS_EXEMPT_CHANNELS_SELECT_ID) {
    return handleMentionsExemptChannelsSelect(interaction, client);
  }
  if (interaction.isChannelSelectMenu() && interaction.customId === FLOOD_EXEMPT_CHANNELS_SELECT_ID) {
    return handleFloodExemptChannelsSelect(interaction, client);
  }
  if (interaction.isChannelSelectMenu() && interaction.customId === SPAM_EXEMPT_CHANNELS_SELECT_ID) {
    return handleSpamExemptChannelsSelect(interaction, client);
  }
  if (interaction.isChannelSelectMenu() && interaction.customId === EVERYONE_EXEMPT_CHANNELS_SELECT_ID) {
    return handleEveryoneExemptChannelsSelect(interaction, client);
  }

  if (interaction.isUserSelectMenu() && interaction.customId.startsWith("limit:") && interaction.customId.endsWith(":exempt")) {
    return handleExemptSelect(interaction, client);
  }

  if (!interaction.deferred && !interaction.replied && !interaction.isModalSubmit()) {
    await (interaction.deferUpdate() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    return true;
  }

  return false;
  } catch (err) {
    console.error("[Protection handleLimitUI]", err);
    const payload = { content: "Koruma etkilesiminde hata olustu.", ephemeral: true };
    if (!interaction.deferred && !interaction.replied) {
      await (interaction.reply(payload) || Promise.resolve()).catch((e) => { globalThis.__airWarnSuppressedError?.(e); });
    } else {
      await (interaction.followUp(payload) || Promise.resolve()).catch((e) => { globalThis.__airWarnSuppressedError?.(e); });
    }
    return true;
  }
}

module.exports = {
  handleLimitUI,
  __private: {
    isProtectionCustomId,
  },
};




