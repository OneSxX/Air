const {
  AuditLogEvent,
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require("discord.js");
const { createEmbed } = require("../../utils/embed");
const { resolveChannelRouting } = require("./channelRouting");

const CFG_KEY = (gid) => `logs_cfg_${gid}`;
const PANEL_KEY = (gid) => `logs_panel_${gid}`;
const MUTE_ROLE_KEY = (gid) => `logs_mute_role_${gid}`;
const FORUM_TOPIC_SYNC_KEY = (gid) => `logs_forum_topic_sync_v2_${gid}`;
const FORUM_TOPIC_SYNC_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const JOIN_TRACK_KEY = (gid, uid) => `logs_member_join_${gid}_${uid}`;
const INVITE_UNIQUE_KEY = (gid) => `logs_invite_unique_${gid}`;
const BAN_TOTAL_KEY = (gid) => `logs_ban_total_${gid}`;
const LOG_PANEL_IMAGE_URL = "https://i.imgur.com/NIzzUhX.png";
const LOG_EVENT_IMAGE_URL = "https://i.imgur.com/VGBYJgL.png";
const DEFAULT_KICK_THUMBNAIL_URL = "https://img.icons8.com/color/96/hammer.png";
const DEFAULT_BAN_THUMBNAIL_URL = "https://img.icons8.com/color/96/no-entry.png";
const DEFAULT_UNBAN_THUMBNAIL_URL = "https://img.icons8.com/color/96/ok.png";
const DEFAULT_MOD_THUMBNAIL_URL = "https://img.icons8.com/color/96/security-checked.png";
const DEFAULT_MESSAGE_THUMBNAIL_URL = "https://img.icons8.com/color/96/message-bot.png";
const DEFAULT_MESSAGE_DELETE_THUMBNAIL_URL = "https://img.icons8.com/color/96/delete-message.png";
const DEFAULT_MESSAGE_EDIT_THUMBNAIL_URL = "https://img.icons8.com/color/96/edit-property.png";
const DEFAULT_JOIN_THUMBNAIL_URL = "https://img.icons8.com/color/96/add-user-male.png";
const DEFAULT_LEAVE_THUMBNAIL_URL = "https://img.icons8.com/color/96/door-opened.png";
const DEFAULT_INVITE_THUMBNAIL_URL = "https://img.icons8.com/color/96/link--v1.png";
const DEFAULT_CHANNEL_THUMBNAIL_URL = "https://img.icons8.com/color/96/channel-mosaic.png";
const DEFAULT_VOICE_THUMBNAIL_URL = "https://img.icons8.com/color/96/microphone.png";
const DEFAULT_LEVEL_THUMBNAIL_URL = "https://img.icons8.com/color/96/increase-font.png";
const DEFAULT_NAME_THUMBNAIL_URL = "https://img.icons8.com/color/96/pen.png";
const DEFAULT_TICKET_THUMBNAIL_URL = "https://img.icons8.com/color/96/ticket.png";
const DEFAULT_PUNISH_THUMBNAIL_URL = "https://img.icons8.com/color/96/high-priority.png";
const PROTECTION_TIMEOUT_MARK_TTL_MS = 60_000;
const MESSAGE_DELETE_REASON_MARK_TTL_MS = 5 * 60_000;
const AUDIT_FALLBACK_DEDUP_TTL_MS = 3 * 60_000;
const CHANNEL_AUDIT_ACTOR_TTL_MS = 2 * 60_000;
const BAN_TOTAL_SYNC_INTERVAL_MS = Math.max(
  60_000,
  parseInt(process.env.LOG_BAN_TOTAL_SYNC_INTERVAL_MS || "600000", 10) || 600000
);
const LOG_CFG_CACHE_TTL_MS = Math.max(
  500,
  Math.min(60_000, parseInt(process.env.LOG_CFG_CACHE_TTL_MS || "5000", 10) || 5000)
);
const LOG_SETUP_CHANNEL_CONCURRENCY = Math.max(
  1,
  Math.min(20, parseInt(process.env.LOG_SETUP_CHANNEL_CONCURRENCY || "12", 10) || 12)
);
const LOG_SETUP_FORUM_CONCURRENCY = Math.max(
  1,
  Math.min(10, parseInt(process.env.LOG_SETUP_FORUM_CONCURRENCY || "6", 10) || 6)
);
const LOG_SETUP_TOPIC_CONCURRENCY = Math.max(
  1,
  Math.min(15, parseInt(process.env.LOG_SETUP_TOPIC_CONCURRENCY || "8", 10) || 8)
);
const protectionTimeoutMarks = new Map();
const messageDeleteReasonMarks = new Map();
const auditFallbackSeen = new Map();
const channelAuditActorCache = new Map();
const banTotalLocks = new Map();
const banTotalSyncMarks = new Map();
const logsConfigCache = new Map();
const LOG_DELETE_CONFIRM_ID = "log:all:delete:confirm";
const LOG_DELETE_CANCEL_ID = "log:all:delete:cancel";
const LOG_ACTION_SELECT_ID = "log:all:action";
const LOG_TOGGLE_SELECT_ID = "log:toggle:select";
const LOG_TOGGLE_MODE_CHANNEL_PREFIX = "log:toggle:mode:channels:";
const LOG_TOGGLE_MODE_FORUM_PREFIX = "log:toggle:mode:forum:";
const LOG_TOGGLE_MODE_CANCEL_PREFIX = "log:toggle:mode:cancel:";
const LOG_TOGGLE_DISABLE_CONFIRM_PREFIX = "log:toggle:disable:confirm:";
const LOG_TOGGLE_DISABLE_CANCEL_PREFIX = "log:toggle:disable:cancel:";

const LOG_CATEGORY_NAME = "\ud83d\udcc1\u30fbloglar";
const EVERYONE_LOG_DENY = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.CreatePublicThreads,
  PermissionFlagsBits.CreatePrivateThreads,
];
const BOT_LOG_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.CreatePublicThreads,
  PermissionFlagsBits.CreatePrivateThreads,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
];
const COLOR_SUCCESS = 0x57f287;
const COLOR_DANGER = 0xed4245;
const COLOR_INFO = 0x5dade2;
const COLOR_PRIMARY = 0x3498db;
const COLOR_PURPLE = 0x9b59b6;
const COLOR_WHITE = 0xffffff;
const COLOR_TIMEOUT_APPLY = COLOR_DANGER;
const COLOR_TIMEOUT_REMOVE = COLOR_SUCCESS;
const COLOR_CHANNEL_HUMAN = 0x8b5a2b;
const COLOR_CHANNEL_BOT = 0xc4a484;

const LOG_CHANNELS = [
  { key: "girisCikis", label: "Giriş Çıkış Log", name: "\ud83d\udeec\u30fbgiris-cikis-log" },
  { key: "mesaj", label: "Mesaj Log", name: "\ud83d\udcac\u30fbmesaj-log" },
  { key: "isim", label: "İsim Log", name: "\ud83c\udff7\ufe0f\u30fbisim-log" },
  { key: "seviye", label: "Seviye Log", name: "\ud83d\udcc8\u30fbseviye-log" },
  { key: "talep", label: "Talep Log", name: "\ud83c\udfab\u30fbtalep-log" },
  { key: "ban", label: "Ban Log", name: "\ud83d\uded1\u30fbban-log" },
  { key: "kick", label: "Kick Log", name: "👢・kick-log", aliases: ["\ud83e\udebe\u30fbkick-log"] },
  { key: "jail", label: "Jail Log", name: "\ud83d\ude94\u30fbjail-log" },
  { key: "ceza", label: "Ceza Log", name: "\u26d4\u30fbceza-log" },
  { key: "mod", label: "Mod Log", name: "\ud83d\udee1\ufe0f\u30fbmod-log" },
  { key: "davet", label: "Davet Log", name: "\ud83d\udd17\u30fbdavet-log" },
  { key: "ses", label: "Ses Log", name: "\ud83d\udd0a\u30fbses-log" },
  { key: "kanal", label: "Kanal Log", name: "🧩・kanal-log" },
];

const EXTRA_CHANNEL_KEYS = [
  "kanalOlusturma",
  "kanalSilme",
  "kanalIsimDuzenleme",
  "kanalIzinDegistirme",
  "kanalAyarDegistirme",
  "kanalOlusturmaBot",
  "kanalSilmeBot",
  "kanalIsimDuzenlemeBot",
  "kanalIzinDegistirmeBot",
  "kanalAyarDegistirmeBot",
];

const EXTRA_LOG_CHANNELS = [
  { key: "kanalOlusturma", name: "🆕・kanal-olusturma", aliases: ["kanal-olusturma"] },
  { key: "kanalSilme", name: "🗑️・kanal-silme", aliases: ["kanal-silme"] },
  { key: "kanalIsimDuzenleme", name: "✏️・kanal-isim-duzenleme", aliases: ["kanal-isim-duzenleme"] },
  { key: "kanalIzinDegistirme", name: "🔐・kanal-izinleri-degistirme", aliases: ["kanal-izinleri-degistirme"] },
  { key: "kanalAyarDegistirme", name: "⚙️・kanal-ayarlari-degistirme", aliases: ["kanal-ayarlari-degistirme"] },
  { key: "kanalOlusturmaBot", name: "🆕・bot-kanal-olusturma", aliases: ["bot-kanal-olusturma"] },
  { key: "kanalSilmeBot", name: "🗑️・bot-kanal-silme", aliases: ["bot-kanal-silme"] },
  { key: "kanalIsimDuzenlemeBot", name: "✏️・bot-kanal-isim-duzenleme", aliases: ["bot-kanal-isim-duzenleme"] },
  { key: "kanalIzinDegistirmeBot", name: "🔐・bot-kanal-izinleri-degistirme", aliases: ["bot-kanal-izinleri-degistirme"] },
  { key: "kanalAyarDegistirmeBot", name: "⚙️・bot-kanal-ayarlari-degistirme", aliases: ["bot-kanal-ayarlari-degistirme"] },
];

const FORUM_LAYOUT = [
  {
    key: "moderasyon",
    name: "🛠️・moderasyon-log",
    aliases: ["moderasyon-log", "🛡️・moderasyon-log"],
    topics: [
      {
        name: "🛡️・mod-log",
        aliases: ["・mod-log", "• mod-log", "mod-log"],
        mapKey: "mod",
        about: "Sunucudaki yetkili/moderasyon hareketlerinin bildirimleri bu sayfaya duser.",
      },
      {
        name: "🔨・ban-log",
        aliases: ["・ban-log", "• ban-log", "ban-log"],
        mapKey: "ban",
        about: "Sunucuda banlanan uyelerin bildirimleri bu sayfaya duser.",
      },
      {
        name: "👢・kick-log",
        aliases: ["🥾・kick-log", "・kick-log", "• kick-log", "kick-log"],
        mapKey: "kick",
        about: "Sunucuda kicklenen uyelerin bildirimleri bu sayfaya duser.",
      },
      {
        name: "⛔・ceza-log",
        aliases: ["・ceza-log", "• ceza-log", "ceza-log"],
        mapKey: "ceza",
        about: "Sunucuda verilen timeout ve ceza işlemlerinin bildirimleri bu sayfaya düşer.",
      },
      {
        name: "🚔・jail-log",
        aliases: ["・jail-log", "• jail-log", "jail-log"],
        mapKey: "jail",
        about: "Sunucuda verilen mute/jail işlemlerinin bildirimleri bu sayfaya düşer.",
      },
    ],
  },
  {
    key: "tum",
    name: "📚・tum-loglar",
    aliases: ["tum-loglar"],
    topics: [
      {
        name: "💬・mesaj-log",
        aliases: ["・mesaj-log", "• mesaj-log", "mesaj-log"],
        mapKey: "mesaj",
        about: "Mesaj silme ve mesaj düzenleme bildirimleri bu sayfaya düşer.",
      },
      {
        name: "🔊・ses-log",
        aliases: ["・ses-log", "• ses-log", "ses-log"],
        mapKey: "ses",
        about: "Sunucuda sese katılan/ayrılan üyelerin bildirimleri bu sayfaya düşer.",
      },
      {
        name: "📈・seviye-log",
        aliases: ["・seviye-log", "• seviye-log", "seviye-log"],
        mapKey: "seviye",
        about: "Seviye atlama ve XP ile ilgili bildirimler bu sayfaya düşer.",
      },
      {
        name: "🏷️・isim-log",
        aliases: ["・isim-log", "• isim-log", "isim-log"],
        mapKey: "isim",
        about: "Kullanıcı ad/isim değişikliklerinin bildirimleri bu sayfaya düşer.",
      },
      {
        name: "🎫・talep-log",
        aliases: ["・talep-log", "• talep-log", "talep-log"],
        mapKey: "talep",
        about: "Talep/ticket ile ilgili kayıtlar bu sayfaya düşer.",
      },
      {
        name: "🔗・davet-log",
        aliases: ["・davet-log", "• davet-log", "davet-log"],
        mapKey: "davet",
        about: "Kim kimi hangi davet bağlantısıyla getirdi bilgisi bu sayfaya düşer.",
      },
      {
        name: "📥・giris-cikis-log",
        aliases: ["・giris-cikis-log", "• giris-cikis-log", "giris-cikis-log"],
        mapKey: "girisCikis",
        about: "Sunucuya katılan ve sunucudan ayrılan üyelerin bildirimleri bu sayfaya düşer.",
      },
    ],
  },
  {
    key: "kanal",
    name: "🧩・kanal-log",
    aliases: ["kanal-log"],
    topics: [
      {
        name: "🆕 Kanal Oluşturma",
        aliases: ["Kanal Oluşturma", "🆕・kanal-olusturma", "kanal-olusturma"],
        extraKey: "kanalOlusturma",
        about: "Sunucuda oluşturulan kanalların bildirimleri bu sayfaya düşer.",
      },
      {
        name: "🗑️ Kanal Silme",
        aliases: ["Kanal Silme", "🗑️・kanal-silme", "kanal-silme"],
        extraKey: "kanalSilme",
        about: "Sunucuda silinen kanalların bildirimleri bu sayfaya düşer.",
      },
      {
        name: "✏️ Kanal İsim Düzenleme",
        aliases: ["Kanal İsim Düzenleme", "✏️・kanal-isim-duzenleme", "kanal-isim-duzenleme"],
        extraKey: "kanalIsimDuzenleme",
        about: "Sunucuda kanal isim değişikliklerinin bildirimleri bu sayfaya düşer.",
      },
      {
        name: "🔐 Kanal İzinleri Değiştirme",
        aliases: ["Kanal İzinleri Değiştirme", "🔐・kanal-izinleri-degistirme", "kanal-izinleri-degistirme"],
        extraKey: "kanalIzinDegistirme",
        about: "Sunucuda kanal izin değişikliklerinin bildirimleri bu sayfaya düşer.",
      },
      {
        name: "⚙️ Kanal Ayarları Değiştirme",
        aliases: ["Kanal Ayarları Değiştirme", "⚙️・kanal-ayarlari-degistirme", "kanal-ayarlari-degistirme"],
        extraKey: "kanalAyarDegistirme",
        about: "Sunucuda kanal ayar değişikliklerinin bildirimleri bu sayfaya düşer.",
      },
      {
        name: "🆕 (BOT) Kanal Oluşturma",
        aliases: ["(BOT) Kanal Oluşturma", "🆕・(BOT) kanal-olusturma", "bot-kanal-olusturma"],
        extraKey: "kanalOlusturmaBot",
        about: "Sadece botların yaptığı kanal oluşturma bildirimleri bu sayfaya düşer.",
      },
      {
        name: "🗑️ (BOT) Kanal Silme",
        aliases: ["(BOT) Kanal Silme", "🗑️・(BOT) kanal-silme", "bot-kanal-silme"],
        extraKey: "kanalSilmeBot",
        about: "Sadece botların yaptığı kanal silme bildirimleri bu sayfaya düşer.",
      },
      {
        name: "✏️ (BOT) Kanal İsim Düzenleme",
        aliases: ["(BOT) Kanal İsim Düzenleme", "✏️・(BOT) kanal-isim-duzenleme", "bot-kanal-isim-duzenleme"],
        extraKey: "kanalIsimDuzenlemeBot",
        about: "Sadece botların yaptığı kanal isim değişiklikleri bu sayfaya düşer.",
      },
      {
        name: "🔐 (BOT) Kanal İzinleri Değiştirme",
        aliases: ["(BOT) Kanal İzinleri Değiştirme", "🔐・(BOT) kanal-izinleri-degistirme", "bot-kanal-izinleri-degistirme"],
        extraKey: "kanalIzinDegistirmeBot",
        about: "Sadece botların yaptığı kanal izin değişiklikleri bu sayfaya düşer.",
      },
      {
        name: "⚙️ (BOT) Kanal Ayarları Değiştirme",
        aliases: ["(BOT) Kanal Ayarları Değiştirme", "⚙️・(BOT) kanal-ayarlari-degistirme", "bot-kanal-ayarlari-degistirme"],
        extraKey: "kanalAyarDegistirmeBot",
        about: "Sadece botların yaptığı kanal ayar değişiklikleri bu sayfaya düşer.",
      },
    ],
  },
];

const inviteCache = new Map();
const inviteUniqueCache = new Map();
const voiceSessionCache = new Map();
const AUDIT_EVENT_NAME_BY_VALUE = new Map(
  Object.entries(AuditLogEvent).map(([name, value]) => [Number(value), name])
);
const HANDLED_AUDIT_ACTIONS = new Set([
  AuditLogEvent.MemberBanAdd,
  AuditLogEvent.MemberKick,
  AuditLogEvent.MemberRoleUpdate,
  AuditLogEvent.ChannelCreate,
  AuditLogEvent.ChannelDelete,
  AuditLogEvent.ChannelUpdate,
  AuditLogEvent.ChannelOverwriteCreate,
  AuditLogEvent.ChannelOverwriteUpdate,
  AuditLogEvent.ChannelOverwriteDelete,
  AuditLogEvent.RoleCreate,
  AuditLogEvent.RoleDelete,
  AuditLogEvent.RoleUpdate,
  AuditLogEvent.WebhookCreate,
  AuditLogEvent.WebhookUpdate,
  AuditLogEvent.WebhookDelete,
  AuditLogEvent.InviteCreate,
  AuditLogEvent.InviteDelete,
  AuditLogEvent.EmojiCreate,
  AuditLogEvent.EmojiUpdate,
  AuditLogEvent.EmojiDelete,
  AuditLogEvent.StickerCreate,
  AuditLogEvent.StickerUpdate,
  AuditLogEvent.StickerDelete,
  AuditLogEvent.GuildUpdate,
  AuditLogEvent.MessageDelete,
  AuditLogEvent.MessageBulkDelete,
]);
const CHANNEL_AUDIT_ACTIONS = new Set([
  AuditLogEvent.ChannelCreate,
  AuditLogEvent.ChannelDelete,
  AuditLogEvent.ChannelUpdate,
  AuditLogEvent.ChannelOverwriteCreate,
  AuditLogEvent.ChannelOverwriteUpdate,
  AuditLogEvent.ChannelOverwriteDelete,
]);

function isAdmin(interaction) {
  return interaction?.memberPermissions?.has?.(PermissionFlagsBits.Administrator);
}

function emptyChannelsMap() {
  const map = {};
  for (const item of LOG_CHANNELS) map[item.key] = null;
  return map;
}

function emptyExtraChannelsMap() {
  const map = {};
  for (const key of EXTRA_CHANNEL_KEYS) map[key] = null;
  return map;
}

function emptyForumsMap() {
  const map = {};
  for (const forum of FORUM_LAYOUT) map[forum.key] = null;
  return map;
}

function normalizeConfig(raw) {
  const out = raw && typeof raw === "object" ? { ...raw } : {};
  out.mode ||= "channels";
  out.categoryId ||= null;
  const existingChannels = out.channels && typeof out.channels === "object" ? out.channels : {};
  const channels = emptyChannelsMap();
  for (const item of LOG_CHANNELS) {
    channels[item.key] = existingChannels[item.key] || null;
  }
  out.channels = channels;

  const existingExtra = out.extraChannels && typeof out.extraChannels === "object" ? out.extraChannels : {};
  const extraChannels = emptyExtraChannelsMap();
  for (const key of EXTRA_CHANNEL_KEYS) {
    extraChannels[key] = existingExtra[key] || null;
  }
  out.extraChannels = extraChannels;

  const existingForums = out.forums && typeof out.forums === "object" ? out.forums : {};
  out.forums = { ...emptyForumsMap(), ...existingForums };

  out.updatedAt ||= null;
  return out;
}

async function getConfig(db, gid) {
  const now = Date.now();
  const cached = logsConfigCache.get(gid);
  if (cached && now - cached.at <= LOG_CFG_CACHE_TTL_MS) {
    return normalizeConfig(cached.cfg);
  }

  const current = await db.get(CFG_KEY(gid));
  if (current) {
    const normalized = normalizeConfig(current);
    logsConfigCache.set(gid, { cfg: normalized, at: now });
    return normalizeConfig(normalized);
  }

  const fresh = normalizeConfig(null);
  await db.set(CFG_KEY(gid), fresh);
  logsConfigCache.set(gid, { cfg: fresh, at: now });
  return normalizeConfig(fresh);
}

async function setConfig(db, gid, cfg) {
  const normalized = normalizeConfig(cfg);
  normalized.updatedAt = Date.now();
  await db.set(CFG_KEY(gid), normalized);
  logsConfigCache.set(gid, { cfg: normalized, at: Date.now() });
  return normalizeConfig(normalized);
}

async function getPanelRef(db, gid) {
  return (await db.get(PANEL_KEY(gid))) || null;
}

async function setPanelRef(db, gid, ref) {
  await db.set(PANEL_KEY(gid), ref);
}

async function getMuteRoleId(db, gid) {
  return (await db.get(MUTE_ROLE_KEY(gid))) || null;
}

async function setMuteRoleId(db, gid, roleId) {
  await db.set(MUTE_ROLE_KEY(gid), roleId || null);
}

function formatDate(ts) {
  return new Date(ts || Date.now()).toLocaleString("tr-TR", { hour12: false });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeImageUrl(rawUrl, fallback = "") {
  const raw = String(rawUrl || "").trim();
  if (!raw) return fallback;
  if (/imgur\.com\/undefined/i.test(raw)) return fallback;

  const directImgur = raw.match(
    /^https?:\/\/(?:www\.)?imgur\.com\/([a-zA-Z0-9]+)(?:\.(png|jpg|jpeg|gif|webp))?(?:[?#].*)?$/i
  );
  if (directImgur) {
    const id = directImgur[1];
    const ext = directImgur[2] ? directImgur[2].toLowerCase() : "png";
    return `https://i.imgur.com/${id}.${ext}`;
  }

  return raw;
}

function getKickThumbnailUrl() {
  const configured = process.env.KICK_LOG_THUMBNAIL_URL || "https://imgur.com/undefined";
  return normalizeImageUrl(configured, DEFAULT_KICK_THUMBNAIL_URL);
}

function getBanThumbnailUrl() {
  const configured = process.env.BAN_LOG_THUMBNAIL_URL || "https://imgur.com/undefined";
  return normalizeImageUrl(configured, DEFAULT_BAN_THUMBNAIL_URL);
}

function getUnbanThumbnailUrl() {
  const configured = process.env.UNBAN_LOG_THUMBNAIL_URL || "https://imgur.com/undefined";
  return normalizeImageUrl(configured, DEFAULT_UNBAN_THUMBNAIL_URL);
}

function classifyColorTone(color) {
  const numeric = Number(color);
  if (!Number.isFinite(numeric)) return "neutral";

  const value = Math.max(0, Math.min(0xffffff, Math.floor(numeric)));
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;

  if (r >= g * 1.2 && r >= b * 1.2) return "red";
  if (g >= r * 1.2 && g >= b * 1.2) return "green";
  if (b >= r * 1.15 && b >= g * 1.15) return "blue";
  if (r > 150 && g > 120 && b < 120) return "yellow";
  if (r > 120 && b > 120 && g < 130) return "purple";
  if (r > 110 && g > 70 && b < 80) return "brown";
  if (r > 220 && g > 220 && b > 220) return "white";
  return "neutral";
}

function pickToneDefaultThumbnail(tone) {
  if (tone === "red") return DEFAULT_PUNISH_THUMBNAIL_URL;
  if (tone === "green") return DEFAULT_UNBAN_THUMBNAIL_URL;
  if (tone === "blue") return DEFAULT_CHANNEL_THUMBNAIL_URL;
  if (tone === "yellow") return DEFAULT_LEVEL_THUMBNAIL_URL;
  if (tone === "purple") return DEFAULT_INVITE_THUMBNAIL_URL;
  if (tone === "brown") return DEFAULT_CHANNEL_THUMBNAIL_URL;
  if (tone === "white") return DEFAULT_TICKET_THUMBNAIL_URL;
  return DEFAULT_MOD_THUMBNAIL_URL;
}

function pickLogThumbnailUrl(title, description, color) {
  const t = String(title || "").toLowerCase();
  const d = String(description || "").toLowerCase();
  const text = `${t}\n${d}`;
  const tone = classifyColorTone(color);

  if (
    text.includes("banı kaldırılan") ||
    text.includes("ban kaldirma") ||
    text.includes("ban kaldırma") ||
    text.includes("ban kaldırıldı")
  ) {
    return getUnbanThumbnailUrl();
  }

  if (
    text.includes("banlanan") ||
    text.includes("ban log") ||
    /(^|[^a-z])ban([^a-z]|$)/i.test(text)
  ) {
    return getBanThumbnailUrl();
  }

  if (text.includes("kicklenen") || text.includes(" kick")) {
    return getKickThumbnailUrl();
  }

  if (
    text.includes("zaman aşımı kaldırıldı") ||
    text.includes("zaman asimi kaldırildi") ||
    text.includes("timeout kaldırıldı")
  ) {
    return DEFAULT_UNBAN_THUMBNAIL_URL;
  }

  if (
    text.includes("zaman aşımı") ||
    text.includes("zaman asimi") ||
    text.includes("timeout") ||
    text.includes("ceza") ||
    text.includes("jail")
  ) {
    return DEFAULT_PUNISH_THUMBNAIL_URL;
  }

  if (text.includes("üye girişi") || text.includes("uye girisi") || text.includes("katılan:")) {
    return DEFAULT_JOIN_THUMBNAIL_URL;
  }

  if (text.includes("üye çıkışı") || text.includes("uye cikisi") || text.includes("ayrılış") || text.includes("ayrilis")) {
    return tone === "red" ? DEFAULT_BAN_THUMBNAIL_URL : DEFAULT_LEAVE_THUMBNAIL_URL;
  }

  if (
    t.includes("ses log") ||
    text.includes("sese girdi") ||
    text.includes("sesten çıktı") ||
    text.includes("sesten cikti") ||
    text.includes("kanal değiştirdi") ||
    text.includes("kanal degistirdi")
  ) {
    return DEFAULT_VOICE_THUMBNAIL_URL;
  }

  if (t.includes("mesaj log") || text.includes("mesaj id")) {
    if (text.includes("değiştirilmiş mesaj") || text.includes("degistirilmis mesaj")) {
      return DEFAULT_MESSAGE_EDIT_THUMBNAIL_URL;
    }
    if (text.includes("silinen mesaj") || text.includes("içerik:") || text.includes("icerik:")) {
      return DEFAULT_MESSAGE_DELETE_THUMBNAIL_URL;
    }
    return DEFAULT_MESSAGE_THUMBNAIL_URL;
  }

  if (t.includes("davet log") || text.includes("discord.gg") || text.includes("davet")) {
    return DEFAULT_INVITE_THUMBNAIL_URL;
  }

  if (t.includes("seviye log") || text.includes(" xp") || text.includes("level")) {
    return DEFAULT_LEVEL_THUMBNAIL_URL;
  }

  if (
    t.includes("isim log") ||
    text.includes("kullanıcı adı") ||
    text.includes("kullanici adi") ||
    text.includes("global ad") ||
    text.includes("görünen ad") ||
    text.includes("gorunen ad") ||
    text.includes("sunucu ismi")
  ) {
    return DEFAULT_NAME_THUMBNAIL_URL;
  }

  if (t.includes("talep log") || text.includes("talep") || text.includes("ticket")) {
    return DEFAULT_TICKET_THUMBNAIL_URL;
  }

  if (t.includes("kanal") || text.includes("kanal:") || text.includes("kanal ")) {
    return DEFAULT_CHANNEL_THUMBNAIL_URL;
  }

  if (t.includes("giriş çıkış log") || t.includes("giris cikis log")) {
    return tone === "green" ? DEFAULT_JOIN_THUMBNAIL_URL : pickToneDefaultThumbnail(tone);
  }

  if (t.includes("mod log")) {
    return pickToneDefaultThumbnail(tone);
  }

  return pickToneDefaultThumbnail(tone);
}

function readEmbedMeta(embed) {
  if (!embed) {
    return { title: "", description: "", thumbnailUrl: "", color: null };
  }

  if (typeof embed.toJSON === "function") {
    const json = embed.toJSON() || {};
    return {
      title: String(json?.title || ""),
      description: String(json?.description || ""),
      thumbnailUrl: String(json?.thumbnail?.url || ""),
      color: Number.isFinite(Number(json?.color)) ? Number(json.color) : null,
    };
  }

  const rawThumb =
    typeof embed?.thumbnail === "string"
      ? embed.thumbnail
      : embed?.thumbnail?.url || "";

  return {
    title: String(embed?.title || ""),
    description: String(embed?.description || ""),
    thumbnailUrl: String(rawThumb || ""),
    color: Number.isFinite(Number(embed?.color)) ? Number(embed.color) : null,
  };
}

function setEmbedThumbnail(embed, url) {
  if (!embed || !url) return embed;

  if (typeof embed.setThumbnail === "function") {
    embed.setThumbnail(url);
    return embed;
  }

  if (embed && typeof embed === "object") {
    return { ...embed, thumbnail: { url } };
  }

  return embed;
}

function applyRelatedThumbnailToPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const embeds = Array.isArray(payload.embeds) ? payload.embeds : null;
  if (!embeds?.length) return payload;

  const nextEmbeds = embeds.map((embed) => {
    if (!embed) return embed;

    const meta = readEmbedMeta(embed);
    if (meta.thumbnailUrl) return embed;

    const thumb = pickLogThumbnailUrl(meta.title, meta.description, meta.color);
    if (!thumb) return embed;

    return setEmbedThumbnail(embed, thumb);
  });

  return { ...payload, embeds: nextEmbeds };
}

function formatDiscordTimestamp(ts, style = "F") {
  const value = Number(ts || 0);
  if (!Number.isFinite(value) || value <= 0) return "-";
  return `<t:${Math.floor(value / 1000)}:${style}>`;
}

async function getGuildBanTotal(db, guildId) {
  if (!db || !guildId) return 0;
  const raw = await db.get(BAN_TOTAL_KEY(guildId)).catch(() => 0);
  const count = Number(raw);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.floor(count);
}

function cleanupBanTotalSyncMarks(now = Date.now()) {
  const keepForMs = BAN_TOTAL_SYNC_INTERVAL_MS * 6;
  for (const [guildId, lastSyncAt] of banTotalSyncMarks.entries()) {
    const ts = Number(lastSyncAt || 0);
    if (!ts || now - ts > keepForMs) {
      banTotalSyncMarks.delete(guildId);
    }
  }
}

function shouldSyncGuildBanTotal(guildId, now = Date.now()) {
  const gid = String(guildId || "").trim();
  if (!gid) return true;
  const lastSyncAt = Number(banTotalSyncMarks.get(gid) || 0);
  if (!lastSyncAt) return true;
  return now - lastSyncAt >= BAN_TOTAL_SYNC_INTERVAL_MS;
}

function markGuildBanTotalSynced(guildId, now = Date.now()) {
  const gid = String(guildId || "").trim();
  if (!gid) return;
  cleanupBanTotalSyncMarks(now);
  banTotalSyncMarks.set(gid, now);
}

function withGuildBanTotalLock(guildId, worker) {
  if (typeof worker !== "function") return Promise.resolve(null);

  const gid = String(guildId || "").trim();
  if (!gid) return Promise.resolve().then(worker);

  const previous = banTotalLocks.get(gid) || Promise.resolve();
  const next = previous.catch((err) => { globalThis.__airWarnSuppressedError?.(err); }).then(worker);
  const guarded = next.finally(() => {
    if (banTotalLocks.get(gid) === guarded) {
      banTotalLocks.delete(gid);
    }
  });
  banTotalLocks.set(gid, guarded);
  return guarded;
}

async function resolveGuildBanTotal(guild, db, opts = {}) {
  const guildId = guild?.id;
  const storedFromOpt = Number(opts?.storedCount);
  const stored = Number.isFinite(storedFromOpt)
    ? Math.max(0, Math.floor(storedFromOpt))
    : await getGuildBanTotal(db, guildId);
  const fallbackFromOpt = Number(opts?.fallbackCount);
  const fallbackCount = Number.isFinite(fallbackFromOpt)
    ? Math.max(0, Math.floor(fallbackFromOpt))
    : stored;

  let fetchedCount = null;
  if (opts?.allowFetch !== false && guild?.bans?.fetch) {
    const bans = await (guild.bans.fetch() || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (bans && Number.isFinite(Number(bans.size))) {
      fetchedCount = Math.max(0, Math.floor(Number(bans.size)));
      markGuildBanTotalSynced(guildId, Date.now());
    }
  }

  const resolved = Number.isFinite(fetchedCount) ? fetchedCount : fallbackCount;
  if (db && guildId && resolved !== stored) {
    await (db.set(BAN_TOTAL_KEY(guildId), resolved) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  return resolved;
}

async function shiftGuildBanTotal(guild, db, delta, opts = {}) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId || !db) return 0;

  const deltaValue = Number(delta);
  const normalizedDelta = Number.isFinite(deltaValue) ? Math.trunc(deltaValue) : 0;

  return withGuildBanTotalLock(guildId, async () => {
    const stored = await getGuildBanTotal(db, guildId);
    const fallbackCount = Math.max(0, stored + normalizedDelta);
    const now = Date.now();
    const allowFetch =
      opts?.allowFetch === true
        ? true
        : opts?.allowFetch === false
          ? false
          : shouldSyncGuildBanTotal(guildId, now);

    return resolveGuildBanTotal(guild, db, {
      storedCount: stored,
      fallbackCount,
      allowFetch,
    });
  });
}

function formatDurationShort(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  if (totalSec <= 0) return "0s";

  const units = [
    ["w", 604_800],
    ["d", 86_400],
    ["h", 3_600],
    ["m", 60],
    ["s", 1],
  ];

  let remain = totalSec;
  const out = [];
  for (const [label, size] of units) {
    if (remain < size) continue;
    const amount = Math.floor(remain / size);
    remain -= amount * size;
    out.push(`${amount}${label}`);
    if (out.length >= 2) break;
  }

  return out.join(" ");
}

function buildMessageDeleteReasonKey(guildId, channelId, messageId) {
  return `${guildId}:${channelId}:${messageId}`;
}

function cleanupMessageDeleteReasonMarks(now = Date.now()) {
  for (const [key, item] of messageDeleteReasonMarks.entries()) {
    const at = Number(item?.at || 0);
    if (!at || now - at > MESSAGE_DELETE_REASON_MARK_TTL_MS) {
      messageDeleteReasonMarks.delete(key);
    }
  }
}

function markMessageDeleteReason(guildId, channelId, messageId, reason) {
  const gid = String(guildId || "").trim();
  const cid = String(channelId || "").trim();
  const mid = String(messageId || "").trim();
  const why = String(reason || "").trim();
  if (!gid || !cid || !mid || !why) return;

  const now = Date.now();
  cleanupMessageDeleteReasonMarks(now);
  messageDeleteReasonMarks.set(buildMessageDeleteReasonKey(gid, cid, mid), {
    reason: why,
    at: now,
  });
}

function markMessageDeleteReasons(guildId, channelId, messageIds, reason) {
  if (!Array.isArray(messageIds) || !messageIds.length) return;
  for (const id of messageIds) {
    markMessageDeleteReason(guildId, channelId, id, reason);
  }
}

function consumeMessageDeleteReason(guildId, channelId, messageId) {
  const gid = String(guildId || "").trim();
  const cid = String(channelId || "").trim();
  const mid = String(messageId || "").trim();
  if (!gid || !cid || !mid) return null;

  cleanupMessageDeleteReasonMarks(Date.now());
  const key = buildMessageDeleteReasonKey(gid, cid, mid);
  const item = messageDeleteReasonMarks.get(key);
  if (!item?.reason) return null;
  messageDeleteReasonMarks.delete(key);
  return String(item.reason);
}

function buildVoiceSessionKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function buildProtectionTimeoutMarkKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function cleanupProtectionTimeoutMarks(now = Date.now()) {
  for (const [key, item] of protectionTimeoutMarks.entries()) {
    const at = Number(item?.at || 0);
    if (!at || now - at > PROTECTION_TIMEOUT_MARK_TTL_MS) {
      protectionTimeoutMarks.delete(key);
    }
  }
}

function markProtectionTimeout(guildId, userId, untilTs) {
  const now = Date.now();
  cleanupProtectionTimeoutMarks(now);
  const key = buildProtectionTimeoutMarkKey(guildId, userId);
  const prev = protectionTimeoutMarks.get(key);
  const nextUntil = Number(untilTs || 0);
  const prevUntil = Number(prev?.untilTs || 0);

  protectionTimeoutMarks.set(key, {
    at: now,
    untilTs: Math.max(nextUntil, prevUntil, 0),
  });
}

function isMarkedProtectionTimeout(guildId, userId, untilTs) {
  const now = Date.now();
  cleanupProtectionTimeoutMarks(now);
  const key = buildProtectionTimeoutMarkKey(guildId, userId);
  const mark = protectionTimeoutMarks.get(key);
  if (!mark) return false;

  const candidateUntil = Number(untilTs || 0);
  const markedUntil = Number(mark.untilTs || 0);
  if (candidateUntil > 0 && markedUntil > 0) {
    return Math.abs(candidateUntil - markedUntil) <= 120_000;
  }

  return true;
}

function buildAuditFallbackKey(guildId, entryId) {
  return `${guildId}:${entryId}`;
}

function cleanupAuditFallbackSeen(now = Date.now()) {
  for (const [key, item] of auditFallbackSeen.entries()) {
    const at = Number(item?.at || 0);
    if (!at || now - at > AUDIT_FALLBACK_DEDUP_TTL_MS) {
      auditFallbackSeen.delete(key);
    }
  }
}

function isAuditFallbackDuplicate(guildId, entryId, now = Date.now()) {
  const gid = String(guildId || "").trim();
  const eid = String(entryId || "").trim();
  if (!gid || !eid) return false;

  cleanupAuditFallbackSeen(now);
  const key = buildAuditFallbackKey(gid, eid);
  if (auditFallbackSeen.has(key)) return true;

  auditFallbackSeen.set(key, { at: now });
  return false;
}

function channelTypeLabel(type) {
  if (type === ChannelType.GuildText) return "Yazı";
  if (type === ChannelType.GuildVoice) return "Ses";
  if (type === ChannelType.GuildCategory) return "Kategori";
  if (type === ChannelType.GuildAnnouncement) return "Duyuru";
  if (type === ChannelType.GuildForum) return "Forum";
  if (type === ChannelType.GuildStageVoice) return "Sahne";
  return String(type);
}

function forumNameList(forumDef) {
  const list = [forumDef?.name, ...(forumDef?.aliases || [])].filter(Boolean);
  return [...new Set(list)];
}

function topicNameList(topic) {
  const list = [topic?.name, ...(topic?.aliases || [])].filter(Boolean);
  return [...new Set(list)];
}

function textTemplateNameList(template) {
  const list = [template?.name, ...(template?.aliases || [])].filter(Boolean);
  return [...new Set(list)];
}

function getKnownTextLogNames() {
  const names = new Set();
  for (const template of [...LOG_CHANNELS, ...EXTRA_LOG_CHANNELS]) {
    for (const name of textTemplateNameList(template)) {
      names.add(name);
    }
  }
  return names;
}

function createForumTopicIntroEmbed(topic) {
  const description = topic?.about || `${topic?.name || "Bu sayfa"} log kayıtları için kullanılır.`;
  return createEmbed()
    .setTitle(topic?.name || "Log Sayfası")
    .setDescription(description);
}

const TOGGLE_KAPALI = "<:toggle_kapali:1479575724359811348>";
const TOGGLE_ACIK = "<:toggle_acik:1479575688259309789>";

function panelStatusBadge(id) {
  return id ? TOGGLE_ACIK : TOGGLE_KAPALI;
}

function parseCustomEmojiToken(token) {
  const raw = String(token || "").trim();
  const match = raw.match(/^<(a)?:([a-zA-Z0-9_]+):(\d+)>$/);
  if (!match) return null;
  return {
    id: match[3],
    name: match[2],
    animated: Boolean(match[1]),
  };
}

function resolvePanelChannelId(cfg, key, opts = {}) {
  if (opts?.source === "extra") {
    return cfg?.extraChannels?.[key] || cfg?.channels?.[opts?.fallbackChannelKey || ""] || null;
  }
  if (opts?.source === "forum") {
    return cfg?.forums?.[key] || null;
  }

  const fromChannels = cfg?.channels?.[key] || null;
  const fromForums = opts?.forumKey ? cfg?.forums?.[opts.forumKey] || null : null;
  return fromChannels || fromForums || null;
}

function panelToken(cfg, key, icon, label, opts = {}) {
  const id = resolvePanelChannelId(cfg, key, opts);
  return `${icon} **${label}:** ${panelStatusBadge(id)}`;
}

function panelRows(items, perRow = 2, gapLines = 1) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return ["\u200b"];

  const rowGap = "⠀⠀⠀⠀⠀⠀";
  const lines = [];
  for (let i = 0; i < list.length; i += perRow) {
    lines.push(list.slice(i, i + perRow).join(rowGap));
    if (i + perRow < list.length) {
      for (let g = 0; g < gapLines; g += 1) lines.push("");
    }
  }
  return lines;
}

function panelSectionHeading(icon, text) {
  return `${icon} **__${text}__**`;
}

function hasExistingChannelByIds(guild, values, opts = {}) {
  const wantType = Number.isInteger(opts?.type) ? opts.type : null;
  const requireThread = opts?.thread === true;
  const list = Array.isArray(values) ? values : [];

  for (const id of list) {
    if (!id) continue;
    const channel = guild?.channels?.cache?.get?.(id);
    if (!channel) continue;
    if (wantType !== null && channel.type !== wantType) continue;
    if (requireThread && !channel?.isThread?.()) continue;
    return true;
  }
  return false;
}

function buildDefaultLogPermissionOverwrites(guild) {
  const out = [
    {
      id: guild.roles.everyone.id,
      deny: EVERYONE_LOG_DENY,
    },
  ];

  const meId = guild.members?.me?.id;
  if (meId) {
    out.push({
      id: meId,
      allow: BOT_LOG_ALLOW,
    });
  }

  return out;
}

async function fetchChannelMaybeCached(guild, channelId) {
  const id = String(channelId || "").trim();
  if (!id) return null;
  const cached = guild.channels.cache.get(id);
  if (cached) return cached;
  return guild.channels.fetch(id).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
}

async function runWithConcurrency(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];

  const cap = Math.max(1, Math.min(Number(concurrency) || 1, list.length));
  const results = new Array(list.length);
  let cursor = 0;

  const consume = async () => {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= list.length) return;
      results[i] = await worker(list[i], i);
    }
  };

  await Promise.all(Array.from({ length: cap }, () => consume()));
  return results;
}

function panelUpdatedAtText(ts) {
  const value = Number(ts || 0);
  if (!Number.isFinite(value) || value <= 0) return "-";
  return formatDate(value);
}

function isLogRouteEnabled(cfg, key) {
  const mode = String(cfg?.mode || "channels");
  if (mode === "forum" && key === "kanal") {
    return Object.values(cfg?.extraChannels || {}).some((id) => Boolean(id));
  }
  return Boolean(cfg?.channels?.[key]);
}

function buildLogToggleOptions(cfg) {
  const emojiOn = parseCustomEmojiToken(TOGGLE_ACIK) || "🟢";
  const emojiOff = parseCustomEmojiToken(TOGGLE_KAPALI) || "⚫";

  return LOG_CHANNELS.map((template) => {
    const enabled = isLogRouteEnabled(cfg, template.key);
    return {
      label: template.label,
      value: template.key,
      description: `Durum: ${enabled ? "acik" : "kapali"} (secince tersine cevirir)`,
      emoji: enabled ? emojiOn : emojiOff,
    };
  });
}

function findForumTopicByMapKey(key) {
  for (const forumDef of FORUM_LAYOUT) {
    for (const topic of forumDef.topics || []) {
      if (topic?.mapKey === key) {
        return { forumDef, topic };
      }
    }
  }
  return null;
}

async function ensureForumTopicIntroMessage(thread, topic) {
  if (!thread?.messages?.fetch) return;

  if (thread.archived) {
    await (thread.setArchived(false) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  const expectedTitle = topic?.name || "Log Sayfası";
  const expectedDescription = topic?.about || `${topic?.name || "Bu sayfa"} log kayıtları için kullanılır.`;
  const botId = thread.client?.user?.id;

  const fetched = await (thread.messages.fetch({ limit: 25 }) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (fetched?.size) {
    const hasIntro = [...fetched.values()].some((msg) => {
      if (botId && msg.author?.id !== botId) return false;
      const embed = msg.embeds?.[0];
      if (!embed) return false;
      return embed.title === expectedTitle || embed.description === expectedDescription;
    });
    if (hasIntro) return;
  }

  await (thread.send({ embeds: [createForumTopicIntroEmbed(topic)] }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
}

function renderPanel(cfg, interaction) {
  const modRows = panelRows([
    panelToken(cfg, "ban", "🔨", "ban-log"),
    panelToken(cfg, "kick", "👢", "kick-log"),
    panelToken(cfg, "ceza", "⛔", "ceza-log"),
    panelToken(cfg, "jail", "🚔", "jail-log"),
    panelToken(cfg, "mod", "🛠️", "mod-log"),
    "⠀",
  ], 2, 1);

  const generalRows = panelRows([
    panelToken(cfg, "girisCikis", "📥", "giris-cikis-log"),
    panelToken(cfg, "mesaj", "💬", "mesaj-log"),
    panelToken(cfg, "isim", "🏷️", "isim-log"),
    panelToken(cfg, "seviye", "📈", "seviye-log"),
    panelToken(cfg, "talep", "🎫", "talep-log"),
    panelToken(cfg, "davet", "🔗", "davet-log"),
    panelToken(cfg, "ses", "🔊", "ses-log"),
  ], 2, 1);

  const channelRows = [
    ...panelRows([
      panelToken(cfg, "kanalOlusturma", "🆕", "kanal-olusturma", { source: "extra", fallbackChannelKey: "kanal" }),
      panelToken(cfg, "kanalSilme", "🗑️", "kanal-silme", { source: "extra", fallbackChannelKey: "kanal" }),
    ], 2, 1),
    "",
    ...panelRows([
      panelToken(cfg, "kanalIsimDuzenleme", "✏️", "kanal-isim-duzenleme", { source: "extra", fallbackChannelKey: "kanal" }),
    ], 1, 1),
    "",
    ...panelRows([
      panelToken(cfg, "kanalIzinDegistirme", "🔐", "kanal-izinleri-degistirme", { source: "extra", fallbackChannelKey: "kanal" }),
    ], 1, 1),
    "",
    ...panelRows([
      panelToken(cfg, "kanalAyarDegistirme", "⚙️", "kanal-ayarlari-degistirme", { source: "extra", fallbackChannelKey: "kanal" }),
    ], 1, 0),
  ];

  const descriptionLines = [
    panelSectionHeading("🛡️", "MODERASYON LOGLARI"),
    "",
    ...modRows,
    "",
    panelSectionHeading("📋", "GENEL LOGLAR"),
    "",
    ...generalRows,
    "",
    panelSectionHeading("🧩", "KANAL LOGLARI"),
    "",
    ...channelRows,
  ];

  const embed = createEmbed()
    .setThumbnail(LOG_PANEL_IMAGE_URL)
    .setDescription(descriptionLines.join("\n"));

  const guildName = interaction?.guild?.name || "Sunucu";
  const guildIcon = interaction?.guild?.iconURL?.({ forceStatic: false, size: 256 });
  if (guildIcon) {
    embed.setAuthor({ name: `${guildName} Logları`, iconURL: guildIcon });
  } else {
    embed.setTitle(`${guildName} Logları`);
  }

  const updatedText = panelUpdatedAtText(cfg?.updatedAt);
  const asker = interaction?.user?.tag || "-";
  embed.setFooter({ text: `Sorgulayan: ${asker} | Son güncelleme: ${updatedText}` });

  const setupBtn = new ButtonBuilder()
    .setCustomId("log:all:setup")
    .setLabel("Bütün Logu Kur")
    .setStyle(ButtonStyle.Primary);

  const deleteBtn = new ButtonBuilder()
    .setCustomId("log:all:delete")
    .setLabel("Logu Sil")
    .setStyle(ButtonStyle.Danger);

  const toggleSelect = new StringSelectMenuBuilder()
    .setCustomId(LOG_TOGGLE_SELECT_ID)
    .setPlaceholder("Log seç (Kur/Sil)")
    .addOptions(buildLogToggleOptions(cfg));

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(setupBtn, deleteBtn),
      new ActionRowBuilder().addComponents(toggleSelect),
    ],
  };
}

function isLogPanelMessage(msg) {
  const rows = msg?.components || [];
  for (const row of rows) {
    for (const c of row?.components || []) {
      if (
        c?.customId === "log:all:setup" ||
        c?.customId === "log:all:delete" ||
        c?.customId === LOG_ACTION_SELECT_ID ||
        c?.customId === LOG_TOGGLE_SELECT_ID
      ) return true;
    }
  }
  return false;
}

async function fetchPanelMessageFromRef(guild, ref) {
  if (!ref?.channelId || !ref?.messageId) return null;
  const ch = await (guild.channels.fetch(ref.channelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!ch?.messages?.fetch) return null;
  const msg = await (ch.messages.fetch(ref.messageId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  return msg || null;
}

async function searchPanelMessages(channel, botId) {
  if (!channel?.messages?.fetch) return null;
  const fetched = await (channel.messages.fetch({ limit: 100 }) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!fetched) return [];

  const list = [];
  for (const msg of fetched.values()) {
    if (msg.author?.id !== botId) continue;
    if (!isLogPanelMessage(msg)) continue;
    list.push(msg);
  }
  list.sort((a, b) => Number(b.createdTimestamp || 0) - Number(a.createdTimestamp || 0));
  return list;
}

async function sendOrUpdatePanel(interaction, cfg, opts = {}) {
  const guild = interaction?.guild;
  let channel = interaction?.channel;
  if (!guild || !channel?.send) throw new Error("Log paneli sadece yazı kanalında çalışır.");

  const recreate = !!opts?.recreate;
  const rendered = renderPanel(cfg, interaction);
  const botId = guild.members?.me?.id || guild.client?.user?.id;

  const ref = await getPanelRef(interaction.client.db, guild.id);
  const refMsg = await fetchPanelMessageFromRef(guild, ref);
  const panelMsgs = await searchPanelMessages(channel, botId);

  if (refMsg && refMsg.channelId !== channel.id) {
    await (refMsg.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  if (recreate) {
    if (refMsg && refMsg.channelId === channel.id) {
      await (refMsg.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
    for (const msg of panelMsgs) {
      await (msg.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }

    const sent = await channel.send(rendered);
    await setPanelRef(interaction.client.db, guild.id, { channelId: sent.channelId, messageId: sent.id });
    return true;
  }

  let primary = null;
  if (refMsg && refMsg.channelId === channel.id) {
    primary = refMsg;
  } else if (panelMsgs.length) {
    primary = panelMsgs[0];
  }

  if (primary) {
    await (primary.edit(rendered) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    await setPanelRef(interaction.client.db, guild.id, { channelId: primary.channelId, messageId: primary.id });

    for (const msg of panelMsgs) {
      if (msg.id === primary.id) continue;
      await (msg.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
    return true;
  }

  const sent = await channel.send(rendered);
  await setPanelRef(interaction.client.db, guild.id, { channelId: sent.channelId, messageId: sent.id });
  return true;
}

async function ensureCategory(guild, cfg) {
  let category = null;
  if (cfg?.categoryId) {
    const ch = await fetchChannelMaybeCached(guild, cfg.categoryId);
    if (ch?.type === ChannelType.GuildCategory) category = ch;
  }

  if (!category) {
    category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === LOG_CATEGORY_NAME) || null;
  }

  if (category) {
    await applyLogChannelOverwrites(category, guild);
    return { category, created: false };
  }

  category = await guild.channels.create({
    name: LOG_CATEGORY_NAME,
    type: ChannelType.GuildCategory,
    permissionOverwrites: buildDefaultLogPermissionOverwrites(guild),
    reason: "Log sistemi kurulumu",
  });
  return { category, created: true };
}

async function applyLogChannelOverwrites(channel, guild) {
  if (!channel?.permissionOverwrites?.edit) return;

  const meId = guild.members?.me?.id;
  const tasks = [
    channel.permissionOverwrites
      .edit(guild.roles.everyone.id, {
        ViewChannel: false,
        SendMessages: false,
        SendMessagesInThreads: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
      })
      .catch((err) => { globalThis.__airWarnSuppressedError?.(err); }),
  ];

  if (meId) {
    tasks.push(
      channel.permissionOverwrites
        .edit(meId, {
          ViewChannel: true,
          SendMessages: true,
          SendMessagesInThreads: true,
          CreatePublicThreads: true,
          CreatePrivateThreads: true,
          ReadMessageHistory: true,
          ManageChannels: true,
          ManageMessages: true,
          EmbedLinks: true,
          AttachFiles: true,
        })
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); })
    );
  }

  await Promise.all(tasks);
}

async function consolidateLogCategories(guild, primaryCategory) {
  if (!primaryCategory?.id) return;

  const textNames = getKnownTextLogNames();
  const forumNames = new Set(FORUM_LAYOUT.flatMap((x) => forumNameList(x)));

  const duplicateCategories = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildCategory && c.name === LOG_CATEGORY_NAME && c.id !== primaryCategory.id)
    .sort((a, b) => Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0));

  for (const category of duplicateCategories.values()) {
    const children = [...guild.channels.cache.values()].filter((c) => c.parentId === category.id);

    for (const child of children) {
      const isKnownText = child.type === ChannelType.GuildText && textNames.has(child.name);
      const isKnownForum = child.type === ChannelType.GuildForum && forumNames.has(child.name);
      if (!isKnownText && !isKnownForum) continue;

      await (child.setParent(primaryCategory.id, { lockPermissions: false }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }

    const hasChild = guild.channels.cache.some((c) => c.parentId === category.id);
    if (!hasChild) {
      await (category.delete("Tekrarlanan log kategorisi temizligi") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  }
}

async function detectExistingLogModes(guild, cfg) {
  const mode = String(cfg?.mode || "");
  const hasCfgText = mode === "channels"
    ? hasExistingChannelByIds(guild, Object.values(cfg?.channels || {}), { type: ChannelType.GuildText })
    : false;
  const hasCfgForum = mode === "forum"
    ? hasExistingChannelByIds(guild, Object.values(cfg?.forums || {}), { type: ChannelType.GuildForum })
    : false;
  const hasCfgExtra = mode === "forum"
    ? hasExistingChannelByIds(guild, Object.values(cfg?.extraChannels || {}), { thread: true })
    : false;

  let hasTextByName = false;
  let hasForumByName = false;
  const textNames = getKnownTextLogNames();
  const forumNames = new Set(FORUM_LAYOUT.flatMap((x) => forumNameList(x)));
  const configuredCategoryId = cfg?.categoryId ? String(cfg.categoryId) : null;

  const isInsideLogCategory = (channel) => {
    const parentId = channel?.parentId ? String(channel.parentId) : null;
    if (!parentId) return false;
    if (configuredCategoryId && parentId === configuredCategoryId) return true;
    const parent = guild.channels.cache.get(parentId);
    return parent?.type === ChannelType.GuildCategory && parent?.name === LOG_CATEGORY_NAME;
  };

  for (const ch of guild.channels.cache.values()) {
    if (!isInsideLogCategory(ch)) continue;
    if (ch.type === ChannelType.GuildText && textNames.has(ch.name)) {
      hasTextByName = true;
    }
    if (ch.type === ChannelType.GuildForum && forumNames.has(ch.name)) {
      hasForumByName = true;
    }
    if (hasTextByName && hasForumByName) break;
  }

  return {
    hasTextLogs: hasCfgText || hasTextByName,
    hasForumLogs: hasCfgForum || hasCfgExtra || hasForumByName,
  };
}

async function ensureTextLogChannel(guild, category, cfg, template, opts = {}) {
  const source = opts?.source === "extra" ? "extra" : "channels";
  const sourceMap = source === "extra" ? cfg?.extraChannels : cfg?.channels;
  const existingId = sourceMap?.[template.key];
  const names = new Set(textTemplateNameList(template));

  if (existingId) {
    const byId = await fetchChannelMaybeCached(guild, existingId);
    if (byId?.type === ChannelType.GuildText) {
      if (byId.parentId !== category.id) {
        await (byId.setParent(category.id, { lockPermissions: false }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      if (byId.name !== template.name) {
        await (byId.setName(template.name, "Log kanal isim güncelleme") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      await applyLogChannelOverwrites(byId, guild);
      return { channel: byId, created: false };
    }
  }

  const byNames = guild.channels.cache.filter(
    (c) =>
      c.type === ChannelType.GuildText &&
      c.parentId === category.id &&
      names.has(c.name)
  );
  if (byNames.size) {
    const sorted = [...byNames.values()].sort((a, b) => Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0));
    const primary = sorted[0];
    if (primary.name !== template.name) {
      await (primary.setName(template.name, "Log kanal isim güncelleme") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
    for (const duplicate of sorted.slice(1)) {
      await (duplicate.delete("Tekrarlanan log kanalı temizliği") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
    await applyLogChannelOverwrites(primary, guild);
    return { channel: primary, created: false };
  }

  const conflictingForums = guild.channels.cache.filter(
    (c) =>
      c.type === ChannelType.GuildForum &&
      c.parentId === category.id &&
      names.has(c.name)
  );
  for (const conflict of conflictingForums.values()) {
    await (conflict.delete("Text log kurulumu: ayni isimli forum temizligi") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  const created = await guild.channels.create({
    name: template.name,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: buildDefaultLogPermissionOverwrites(guild),
    reason: "Log sistemi kurulumu",
  });
  return { channel: created, created: true };
}

async function ensureForumLogChannel(guild, category, cfg, forumDef) {
  const existingId = cfg?.forums?.[forumDef.key];
  if (existingId) {
    const byId = await fetchChannelMaybeCached(guild, existingId);
    if (byId?.type === ChannelType.GuildForum) {
      if (byId.name !== forumDef.name) {
        await (byId.setName(forumDef.name, "Forum log isim güncelleme") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      await applyLogChannelOverwrites(byId, guild);
      return { channel: byId, created: false };
    }
  }

  const names = new Set(forumNameList(forumDef));
  const byNames = guild.channels.cache.filter(
    (c) =>
      c.type === ChannelType.GuildForum &&
      c.parentId === category.id &&
      names.has(c.name)
  );
  if (byNames.size) {
    const sorted = [...byNames.values()].sort((a, b) => Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0));
    const primary = sorted[0];
    if (primary.name !== forumDef.name) {
      await (primary.setName(forumDef.name, "Forum log isim güncelleme") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
    for (const duplicate of sorted.slice(1)) {
      await (duplicate.delete("Tekrarlanan log foruma temizligi") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
    await applyLogChannelOverwrites(primary, guild);
    return { channel: primary, created: false };
  }

  const conflictingText = guild.channels.cache.filter(
    (c) =>
      c.type === ChannelType.GuildText &&
      c.parentId === category.id &&
      names.has(c.name)
  );
  for (const conflict of conflictingText.values()) {
    await (conflict.delete("Forum log kurulumu: ayni isimli text log temizligi") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  const created = await guild.channels.create({
    name: forumDef.name,
    type: ChannelType.GuildForum,
    parent: category.id,
    permissionOverwrites: buildDefaultLogPermissionOverwrites(guild),
    reason: "Log forum kurulumu",
  });
  return { channel: created, created: true };
}

function findTopicInThreadsCollection(threads, topicName) {
  if (!threads?.size) return null;
  const names = Array.isArray(topicName) ? topicName : [topicName];
  return threads.find((thread) => names.includes(thread.name)) || null;
}

async function fetchActiveForumThreads(forum, cache = null) {
  const loader = async () => {
    const active = await (forum.threads.fetchActive() || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    return active?.threads || null;
  };

  if (!(cache instanceof Map)) return loader();
  if (!cache.has(forum.id)) {
    cache.set(forum.id, loader());
  }

  const cached = cache.get(forum.id);
  const threads = typeof cached?.then === "function" ? await cached : cached;
  if (typeof cached?.then === "function") {
    cache.set(forum.id, threads);
  }
  return threads;
}

async function fetchArchivedForumThreads(forum, cache = null) {
  const loader = async () => {
    const attempts = [
      { type: "public", fetchAll: true },
      { type: "public" },
      { fetchAll: true },
      null,
    ];

    for (const options of attempts) {
      const fetched = options
        ? await forum.threads.fetchArchived(options).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; })
        : await (forum.threads.fetchArchived() || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
      if (fetched?.threads) return fetched.threads;
    }
    return null;
  };

  if (!(cache instanceof Map)) return loader();
  if (!cache.has(forum.id)) {
    cache.set(forum.id, loader());
  }

  const cached = cache.get(forum.id);
  const threads = typeof cached?.then === "function" ? await cached : cached;
  if (typeof cached?.then === "function") {
    cache.set(forum.id, threads);
  }
  return threads;
}

async function ensureForumTopic(guild, forum, cfg, topic, ctx = {}) {
  const allowRename = ctx?.allowRename !== false;
  const ensureIntroOnExisting = ctx?.ensureIntroOnExisting !== false;
  const unarchiveExisting = ctx?.unarchiveExisting !== false;
  const includeArchivedSearch = ctx?.includeArchivedSearch === true;
  const createIfMissing = ctx?.createIfMissing !== false;
  const activeCache = ctx?.activeThreadCache instanceof Map ? ctx.activeThreadCache : null;
  const archivedCache = ctx?.archivedThreadCache instanceof Map ? ctx.archivedThreadCache : null;

  const mappedId = topic.mapKey
    ? cfg?.channels?.[topic.mapKey]
    : topic.extraKey
      ? cfg?.extraChannels?.[topic.extraKey]
      : null;

  if (mappedId) {
    const byId = await fetchChannelMaybeCached(guild, mappedId);
    if (byId?.isThread?.() && byId.parentId === forum.id) {
      if (byId.archived && unarchiveExisting) {
        await (byId.setArchived(false, "Forum başlık güncelleme") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      if (allowRename && byId.name !== topic.name) {
        await (byId.setName(topic.name, "Forum başlık isim güncelleme") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      if (ensureIntroOnExisting) {
        await ensureForumTopicIntroMessage(byId, topic);
      }
      return { channel: byId, created: false };
    }
  }

  let active = findTopicInThreadsCollection(
    await fetchActiveForumThreads(forum, activeCache),
    topicNameList(topic)
  );

  if (!active && includeArchivedSearch) {
    active = findTopicInThreadsCollection(
      await fetchArchivedForumThreads(forum, archivedCache),
      topicNameList(topic)
    );
  }

  if (active) {
    if (allowRename && active.name !== topic.name) {
      await (active.setName(topic.name, "Forum başlık isim güncelleme") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
    if (ensureIntroOnExisting) {
      await ensureForumTopicIntroMessage(active, topic);
    }
    return { channel: active, created: false };
  }

  if (!createIfMissing) {
    return { channel: null, created: false };
  }

  const created = await forum.threads.create({
    name: topic.name,
    message: { embeds: [createForumTopicIntroEmbed(topic)] },
    reason: "Log forum basligi olusturma",
  });
  if (activeCache) {
    const cached = activeCache.get(forum.id);
    const existing = typeof cached?.then === "function" ? await cached : cached;
    if (typeof cached?.then === "function") {
      activeCache.set(forum.id, existing);
    }
    if (existing?.set && created?.id) {
      existing.set(created.id, created);
    }
  }
  return { channel: created, created: true };
}

async function syncForumTopicsForGuild(guild, db) {
  if (!guild || !db) return;

  const now = Date.now();
  const lastSync = Number((await db.get(FORUM_TOPIC_SYNC_KEY(guild.id)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; })) || 0);
  if (lastSync > 0 && now - lastSync < FORUM_TOPIC_SYNC_MIN_INTERVAL_MS) return;

  const cfg = await getConfig(db, guild.id);
  if (String(cfg?.mode || "") !== "forum") return;

  let changed = false;
  const syncCtx = {
    allowRename: false,
    ensureIntroOnExisting: false,
    unarchiveExisting: false,
    includeArchivedSearch: true,
    createIfMissing: false,
    activeThreadCache: new Map(),
    archivedThreadCache: new Map(),
  };

  for (const forumDef of FORUM_LAYOUT) {
    const forumId = cfg?.forums?.[forumDef.key];
    if (!forumId) continue;

    const forum = await (guild.channels.fetch(forumId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (!forum || forum.type !== ChannelType.GuildForum) continue;

    for (const topic of forumDef.topics) {
      const ensured = await (ensureForumTopic(guild, forum, cfg, topic, syncCtx) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
      const thread = ensured?.channel;
      if (!thread) continue;

      if (topic.mapKey && cfg.channels[topic.mapKey] !== thread.id) {
        cfg.channels[topic.mapKey] = thread.id;
        changed = true;
      }
      if (topic.extraKey && cfg.extraChannels[topic.extraKey] !== thread.id) {
        cfg.extraChannels[topic.extraKey] = thread.id;
        changed = true;
      }
    }
  }

  if (changed) {
    await (setConfig(db, guild.id, cfg) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  await (db.set(FORUM_TOPIC_SYNC_KEY(guild.id), now) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
}

async function setupAllChannels(guild, cfg) {
  const next = normalizeConfig(cfg);
  const { category, created: categoryCreated } = await ensureCategory(guild, next);
  await consolidateLogCategories(guild, category);

  let createdCount = 0;
  const ensuredBase = await runWithConcurrency(LOG_CHANNELS, LOG_SETUP_CHANNEL_CONCURRENCY, async (template) => {
    const result = await ensureTextLogChannel(guild, category, next, template);
    return { template, ...result };
  });

  for (const item of ensuredBase) {
    if (!item?.channel || !item?.template) continue;
    const { template, channel, created } = item;
    next.channels[template.key] = channel.id;
    if (created) createdCount += 1;
  }

  // Kanal modunda tüm kanal olayları tek `kanal-log` kanalında tutulur.
  const knownMainNames = new Set(LOG_CHANNELS.flatMap((x) => textTemplateNameList(x)));
  const knownExtraNames = new Set(EXTRA_LOG_CHANNELS.flatMap((x) => textTemplateNameList(x)));

  const extraIds = new Set(
    Object.values(cfg?.extraChannels || {})
      .map((x) => String(x || "").trim())
      .filter(Boolean)
  );

  for (const channelId of extraIds) {
    const channel = await (guild.channels.fetch(channelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (!channel || channel.type !== ChannelType.GuildText) continue;
    await (channel.delete("Kanal modu sadeleştirme: extra kanal log birlestirme") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  for (const channel of guild.channels.cache.values()) {
    if (channel?.type !== ChannelType.GuildText) continue;
    if (channel.parentId !== category.id) continue;
    if (!knownExtraNames.has(channel.name)) continue;
    if (knownMainNames.has(channel.name)) continue;
    await (channel.delete("Kanal modu sadeleştirme: extra kanal log birlestirme") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  next.extraChannels = emptyExtraChannelsMap();
  next.forums = emptyForumsMap();
  next.mode = "channels";
  next.categoryId = category.id;
  return { cfg: next, createdCount, categoryCreated };
}

async function setupForumChannels(guild, cfg) {
  const next = normalizeConfig(cfg);
  const { category, created: categoryCreated } = await ensureCategory(guild, next);
  await consolidateLogCategories(guild, category);

  let createdForumCount = 0;
  let createdTopicCount = 0;
  const forumEntries = [];
  // Forum sırası sabit: moderasyon -> tum -> kanal
  for (const forumDef of FORUM_LAYOUT) {
    const result = await ensureForumLogChannel(guild, category, next, forumDef);
    forumEntries.push({ forumDef, ...result });
  }

  const validForums = forumEntries.filter((entry) => entry?.channel && entry?.forumDef);
  const forumTopicResults = [];
  for (const entry of validForums) {
    const { forumDef, channel: forum, created: forumCreated } = entry;
    const activeThreadCache = new Map();
    // Forum başlık sırası stabil olsun diye topic'leri paralel değil sırayla işliyoruz.
    const topics = [];
    for (const topic of forumDef.topics || []) {
      const result = await ensureForumTopic(guild, forum, next, topic, { activeThreadCache });
      topics.push({ topic, ...result });
    }
    forumTopicResults.push({ forumDef, forum, forumCreated, topics });
  }

  for (const entry of forumTopicResults) {
    if (!entry?.forumDef || !entry?.forum) continue;
    const { forumDef, forum, forumCreated, topics } = entry;
    next.forums[forumDef.key] = forum.id;
    if (forumCreated) createdForumCount += 1;

    for (const topicEntry of topics || []) {
      if (!topicEntry?.channel || !topicEntry?.topic) continue;
      const { topic, channel: thread, created: topicCreated } = topicEntry;
      if (topic.mapKey) next.channels[topic.mapKey] = thread.id;
      if (topic.extraKey) next.extraChannels[topic.extraKey] = thread.id;
      if (topicCreated) createdTopicCount += 1;
    }
  }

  next.channels.kanal = null;
  next.mode = "forum";
  next.categoryId = category.id;
  return { cfg: next, createdForumCount, createdTopicCount, categoryCreated };
}

async function deleteAllChannels(guild, cfg) {
  const next = normalizeConfig(cfg);
  let deletedCount = 0;

  for (const template of LOG_CHANNELS) {
    const channelId = next.channels[template.key];
    next.channels[template.key] = null;
    if (!channelId) continue;

    const channel = await (guild.channels.fetch(channelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (!channel) continue;

    const deleted = await channel.delete("Log sistemi kaldırıldı").then(() => true).catch(() => false);
    if (deleted) deletedCount += 1;
  }

  for (const key of EXTRA_CHANNEL_KEYS) {
    const channelId = next.extraChannels[key];
    next.extraChannels[key] = null;
    if (!channelId) continue;

    const channel = await (guild.channels.fetch(channelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (!channel) continue;

    const deleted = await channel.delete("Log sistemi kaldırıldı").then(() => true).catch(() => false);
    if (deleted) deletedCount += 1;
  }

  for (const forumDef of FORUM_LAYOUT) {
    const forumId = next.forums[forumDef.key];
    next.forums[forumDef.key] = null;
    if (!forumId) continue;

    const forum = await (guild.channels.fetch(forumId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (!forum) continue;

    const deleted = await forum.delete("Log sistemi kaldırıldı").then(() => true).catch(() => false);
    if (deleted) deletedCount += 1;
  }

  const knownTextNames = getKnownTextLogNames();
  const knownForumNames = new Set(FORUM_LAYOUT.flatMap((x) => forumNameList(x)));

  for (const ch of guild.channels.cache.values()) {
    const parent = ch.parentId ? guild.channels.cache.get(ch.parentId) : null;
    if (!parent || parent.type !== ChannelType.GuildCategory || parent.name !== LOG_CATEGORY_NAME) continue;

    const isKnownText = ch.type === ChannelType.GuildText && knownTextNames.has(ch.name);
    const isKnownForum = ch.type === ChannelType.GuildForum && knownForumNames.has(ch.name);
    if (!isKnownText && !isKnownForum) continue;

    const deleted = await ch.delete("Log sistemi kaldırıldı").then(() => true).catch(() => false);
    if (deleted) deletedCount += 1;
  }

  let categoryDeleted = false;
  const categories = guild.channels.cache.filter(
    (c) => c.type === ChannelType.GuildCategory && c.name === LOG_CATEGORY_NAME
  );
  for (const category of categories.values()) {
    const hasChild = guild.channels.cache.some((c) => c.parentId === category.id);
    if (!hasChild) {
      const deleted = await category.delete("Log sistemi kaldırıldı").then(() => true).catch(() => false);
      if (deleted) categoryDeleted = true;
    }
  }

  next.mode = "channels";
  next.categoryId = null;
  return { cfg: next, deletedCount, categoryDeleted };
}

function setupModePromptPayload() {
  const channelsBtn = new ButtonBuilder()
    .setCustomId("log:mode:channels")
    .setLabel("Kanal Olarak Kur")
    .setStyle(ButtonStyle.Success);

  const forumBtn = new ButtonBuilder()
    .setCustomId("log:mode:forum")
    .setLabel("Forum Olarak Kur")
    .setStyle(ButtonStyle.Primary);

  return {
    content:
      "Log kurulum tipini seç.\n" +
      "- Kanal olarak kur: Tüm log kanalları kategori altına açılır.\n" +
      "- Forum olarak kur: Forum kanallarında başlıklar oluşturulur.",
    components: [new ActionRowBuilder().addComponents(channelsBtn, forumBtn)],
    ephemeral: true,
  };
}

function deleteConfirmPromptPayload() {
  const confirmBtn = new ButtonBuilder()
    .setCustomId(LOG_DELETE_CONFIRM_ID)
    .setLabel("Evet, Logu Sil")
    .setStyle(ButtonStyle.Danger);

  const cancelBtn = new ButtonBuilder()
    .setCustomId(LOG_DELETE_CANCEL_ID)
    .setLabel("Vazgec")
    .setStyle(ButtonStyle.Secondary);

  return {
    content: "Bu islem tum log kanallarini ve kategorisini siler. Onayliyor musun?",
    components: [new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)],
    ephemeral: true,
  };
}

function toggleModePromptPayload(key, label) {
  const channelsBtn = new ButtonBuilder()
    .setCustomId(`${LOG_TOGGLE_MODE_CHANNEL_PREFIX}${key}`)
    .setLabel("Kanal Olarak Kur")
    .setStyle(ButtonStyle.Success);

  const forumBtn = new ButtonBuilder()
    .setCustomId(`${LOG_TOGGLE_MODE_FORUM_PREFIX}${key}`)
    .setLabel("Forum Olarak Kur")
    .setStyle(ButtonStyle.Primary);

  const cancelBtn = new ButtonBuilder()
    .setCustomId(`${LOG_TOGGLE_MODE_CANCEL_PREFIX}${key}`)
    .setLabel("Vazgec")
    .setStyle(ButtonStyle.Secondary);

  return {
    content:
      `**${label}** logu kapali.\n` +
      `Hangi turde kurayim?`,
    components: [new ActionRowBuilder().addComponents(channelsBtn, forumBtn, cancelBtn)],
    ephemeral: true,
  };
}

function toggleDisablePromptPayload(key, label) {
  const confirmBtn = new ButtonBuilder()
    .setCustomId(`${LOG_TOGGLE_DISABLE_CONFIRM_PREFIX}${key}`)
    .setLabel("Evet, Kapat")
    .setStyle(ButtonStyle.Danger);

  const cancelBtn = new ButtonBuilder()
    .setCustomId(`${LOG_TOGGLE_DISABLE_CANCEL_PREFIX}${key}`)
    .setLabel("Vazgec")
    .setStyle(ButtonStyle.Secondary);

  return {
    content:
      `**${label}** logunu kapatmak istiyor musun?\n` +
      "Bu islem secili log kanalini siler. Baska log kanali kalmazsa log kategorisi de silinir.",
    components: [new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)],
    ephemeral: true,
  };
}

function parseToggleModeKey(id, prefix) {
  const raw = String(id || "");
  if (!raw.startsWith(prefix)) return null;
  const key = raw.slice(prefix.length).trim();
  return key || null;
}

function hasAnyKnownLogChannelInsideCategory(guild) {
  const textNames = getKnownTextLogNames();
  const forumNames = new Set(FORUM_LAYOUT.flatMap((x) => forumNameList(x)));

  for (const ch of guild.channels.cache.values()) {
    const parentId = ch?.parentId;
    if (!parentId) continue;

    const parent = guild.channels.cache.get(parentId);
    if (!parent || parent.type !== ChannelType.GuildCategory || parent.name !== LOG_CATEGORY_NAME) continue;

    const isKnownText = ch.type === ChannelType.GuildText && textNames.has(ch.name);
    const isKnownForum = ch.type === ChannelType.GuildForum && forumNames.has(ch.name);
    if (isKnownText || isKnownForum) return true;
  }

  return false;
}

async function cleanupCategoryIfNoOtherLogs(guild, cfg) {
  if (hasAnyKnownLogChannelInsideCategory(guild)) return false;

  let deleted = false;
  const categoryIds = new Set();

  if (cfg?.categoryId) categoryIds.add(String(cfg.categoryId));
  for (const ch of guild.channels.cache.values()) {
    if (ch.type === ChannelType.GuildCategory && ch.name === LOG_CATEGORY_NAME) {
      categoryIds.add(String(ch.id));
    }
  }

  for (const categoryId of categoryIds) {
    const category = await fetchChannelMaybeCached(guild, categoryId);
    if (!category || category.type !== ChannelType.GuildCategory) continue;
    if (category.name !== LOG_CATEGORY_NAME) continue;

    const ok = await category.delete("Log kanallari kapandigi icin kategori temizligi")
      .then(() => true)
      .catch(() => false);
    if (ok) deleted = true;
  }

  if (deleted) cfg.categoryId = null;
  return deleted;
}

async function enableLogRoute(guild, cfg, key, modeOverride = null) {
  const mode = modeOverride === "forum"
    ? "forum"
    : modeOverride === "channels"
      ? "channels"
      : String(cfg?.mode || "channels");
  const categoryRes = await ensureCategory(guild, cfg);
  const category = categoryRes.category;

  if (mode === "forum") {
    if (key === "kanal") {
      const forumDef = FORUM_LAYOUT.find((x) => x.key === "kanal");
      if (!forumDef) throw new Error("Kanal forum tanimi bulunamadi.");

      const forumRes = await ensureForumLogChannel(guild, category, cfg, forumDef);
      cfg.forums[forumDef.key] = forumRes.channel.id;

      for (const topic of forumDef.topics || []) {
        const topicRes = await ensureForumTopic(guild, forumRes.channel, cfg, topic);
        if (topic?.extraKey) cfg.extraChannels[topic.extraKey] = topicRes.channel.id;
      }
      cfg.mode = "forum";
      return;
    }

    const mapping = findForumTopicByMapKey(key);
    if (!mapping?.forumDef || !mapping?.topic) {
      throw new Error("Secilen log forum modunda acilamiyor.");
    }

    const forumRes = await ensureForumLogChannel(guild, category, cfg, mapping.forumDef);
    cfg.forums[mapping.forumDef.key] = forumRes.channel.id;
    const topicRes = await ensureForumTopic(guild, forumRes.channel, cfg, mapping.topic);
    cfg.channels[key] = topicRes.channel.id;
    return;
  }

  const template = LOG_CHANNELS.find((x) => x.key === key);
  if (!template) throw new Error("Secilen log tanimi bulunamadi.");
  const logRes = await ensureTextLogChannel(guild, category, cfg, template);
  cfg.channels[key] = logRes.channel.id;
  if (key === "kanal") cfg.mode = "channels";
}

async function disableLogRoute(guild, cfg, key) {
  const mode = String(cfg?.mode || "channels");
  if (mode === "forum" && key === "kanal") {
    const forumId = cfg?.forums?.kanal || null;
    if (forumId) {
      const forum = await (guild.channels.fetch(forumId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
      if (forum) {
        await (forum.delete("Log panelinden kapatildi") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      cfg.forums.kanal = null;
    }
    for (const extraKey of EXTRA_CHANNEL_KEYS) {
      const channelId = cfg?.extraChannels?.[extraKey] || null;
      if (channelId) {
        const ch = await (guild.channels.fetch(channelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
        if (ch) {
          await (ch.delete("Log panelinden kapatildi") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }
      }
      cfg.extraChannels[extraKey] = null;
    }
    return;
  }

  const channelId = cfg?.channels?.[key] || null;
  if (channelId) {
    const channel = await (guild.channels.fetch(channelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (channel) {
      await (channel.delete("Log panelinden kapatildi") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  }
  cfg.channels[key] = null;
}

async function handleInteraction(interaction, client) {
  if (!interaction?.guildId) return false;
  const isButton = interaction?.isButton?.();
  const isSelect = interaction?.isStringSelectMenu?.();
  if (!isButton && !isSelect) return false;

  const id = interaction.customId || "";
  if (!id.startsWith("log:")) return false;

  if (!isAdmin(interaction)) {
    if (!interaction.replied && !interaction.deferred) {
      await (interaction.reply({ content: "Bu işlem için Yönetici yetkisi gerekli.", ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
    return true;
  }

  if (id === LOG_TOGGLE_SELECT_ID && isSelect) {
    const key = String(interaction.values?.[0] || "").trim();
    const validKeys = new Set(LOG_CHANNELS.map((x) => x.key));
    if (!validKeys.has(key)) {
      if (!interaction.replied && !interaction.deferred) {
        await (interaction.reply({ content: "Gecersiz log secimi.", ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return true;
    }

    const current = await getConfig(client.db, interaction.guildId);
    const wasEnabled = isLogRouteEnabled(current, key);
    const selectedLabel = LOG_CHANNELS.find((x) => x.key === key)?.label || key;

    if (!wasEnabled) {
      const payload = toggleModePromptPayload(key, selectedLabel);
      if (!interaction.deferred && !interaction.replied) {
        await (interaction.reply(payload) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      } else {
        await (interaction.followUp(payload) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return true;
    }

    const payload = toggleDisablePromptPayload(key, selectedLabel);
    if (!interaction.deferred && !interaction.replied) {
      await (interaction.reply(payload) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } else {
      await (interaction.followUp(payload) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
    return true;
  }

  const keyForChannels = parseToggleModeKey(id, LOG_TOGGLE_MODE_CHANNEL_PREFIX);
  const keyForForum = parseToggleModeKey(id, LOG_TOGGLE_MODE_FORUM_PREFIX);
  const keyForCancel = parseToggleModeKey(id, LOG_TOGGLE_MODE_CANCEL_PREFIX);
  const keyForDisableConfirm = parseToggleModeKey(id, LOG_TOGGLE_DISABLE_CONFIRM_PREFIX);
  const keyForDisableCancel = parseToggleModeKey(id, LOG_TOGGLE_DISABLE_CANCEL_PREFIX);

  if ((keyForDisableConfirm || keyForDisableCancel) && isButton) {
    const chosenKey = keyForDisableConfirm || keyForDisableCancel;
    const validKeys = new Set(LOG_CHANNELS.map((x) => x.key));
    if (!validKeys.has(chosenKey)) {
      if (!interaction.replied && !interaction.deferred) {
        await (interaction.reply({ content: "Gecersiz log secimi.", ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return true;
    }

    if (keyForDisableCancel) {
      if (!interaction.deferred && !interaction.replied) {
        const updated = await interaction
          .update({ content: "Log kapatma islemi iptal edildi.", components: [] })
          .then(() => true)
          .catch(() => false);
        if (updated) return true;
      }
      await (interaction.reply({ content: "Log kapatma islemi iptal edildi.", ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return true;
    }

    let usedUpdate = false;
    if (!interaction.deferred && !interaction.replied) {
      usedUpdate = await interaction
        .update({ content: "Log kapatiliyor...", components: [] })
        .then(() => true)
        .catch(() => false);
      if (!usedUpdate) {
        await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
    }

    const current = await getConfig(client.db, interaction.guildId);
    const selectedLabel = LOG_CHANNELS.find((x) => x.key === chosenKey)?.label || chosenKey;
    if (!isLogRouteEnabled(current, chosenKey)) {
      const already = `${selectedLabel} logu zaten kapali.`;
      if (usedUpdate) {
        await (interaction.followUp({ content: already, ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      } else if (interaction.deferred || interaction.replied) {
        await (interaction.editReply({ content: already }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      } else {
        await (interaction.reply({ content: already, ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return true;
    }

    let categoryDeleted = false;
    try {
      await disableLogRoute(interaction.guild, current, chosenKey);
      categoryDeleted = await cleanupCategoryIfNoOtherLogs(interaction.guild, current);
    } catch (err) {
      const msg = String(err?.message || err || "Bilinmeyen hata");
      const fail = `Log durumu guncellenemedi.\n\`\`\`${msg.slice(0, 1500)}\`\`\``;
      if (usedUpdate) {
        await (interaction.followUp({ content: fail, ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      } else if (interaction.deferred || interaction.replied) {
        await (interaction.editReply(fail) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      } else {
        await (interaction.reply({ content: fail, ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return true;
    }

    const merged = await setConfig(client.db, interaction.guildId, current);
    await (sendOrUpdatePanel(interaction, merged) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

    const out =
      `${selectedLabel} logu kapatildi ve silindi.` +
      `\nKategori silindi: ${categoryDeleted ? "evet" : "hayir"}`;
    if (usedUpdate) {
      await (interaction.followUp({ content: out, ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } else if (interaction.deferred || interaction.replied) {
      await (interaction.editReply({ content: out }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } else {
      await (interaction.reply({ content: out, ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
    return true;
  }

  if ((keyForChannels || keyForForum || keyForCancel) && isButton) {
    const chosenKey = keyForChannels || keyForForum || keyForCancel;
    const validKeys = new Set(LOG_CHANNELS.map((x) => x.key));
    if (!validKeys.has(chosenKey)) {
      if (!interaction.replied && !interaction.deferred) {
        await (interaction.reply({ content: "Gecersiz log secimi.", ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return true;
    }

    if (keyForCancel) {
      if (!interaction.deferred && !interaction.replied) {
        const updated = await interaction
          .update({ content: "Log kurulum secimi iptal edildi.", components: [] })
          .then(() => true)
          .catch(() => false);
        if (updated) return true;
      }
      await (interaction.reply({ content: "Log kurulum secimi iptal edildi.", ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return true;
    }

    if (!interaction.deferred && !interaction.replied) {
      await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }

    const mode = keyForForum ? "forum" : "channels";
    const current = await getConfig(client.db, interaction.guildId);
    const selectedLabel = LOG_CHANNELS.find((x) => x.key === chosenKey)?.label || chosenKey;

    try {
      await enableLogRoute(interaction.guild, current, chosenKey, mode);
    } catch (err) {
      const msg = String(err?.message || err || "Bilinmeyen hata");
      await interaction
        .editReply(`Log durumu guncellenemedi.\n\`\`\`${msg.slice(0, 1500)}\`\`\``)
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return true;
    }

    const merged = await setConfig(client.db, interaction.guildId, current);
    await (sendOrUpdatePanel(interaction, merged) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

    await interaction
      .editReply(`${selectedLabel} logu ${mode === "forum" ? "forum" : "kanal"} olarak acildi.`)
      .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    return true;
  }

  if (id === LOG_ACTION_SELECT_ID && isSelect) {
    const selected = String(interaction.values?.[0] || "").trim().toLowerCase();
    if (selected === "setup") {
      if (!interaction.deferred && !interaction.replied) {
        await (interaction.reply(setupModePromptPayload()) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      } else {
        await (interaction.followUp(setupModePromptPayload()) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return true;
    }

    if (selected === "delete") {
      if (!interaction.deferred && !interaction.replied) {
        await (interaction.reply(deleteConfirmPromptPayload()) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      } else {
        await (interaction.followUp(deleteConfirmPromptPayload()) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return true;
    }

    if (!interaction.deferred && !interaction.replied) {
      await (interaction.reply({ content: "Gecersiz log islemi.", ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
    return true;
  }

  if (id === "log:all:setup") {
    if (interaction.replied || interaction.deferred) {
      await (interaction.followUp(setupModePromptPayload()) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } else {
      await (interaction.reply(setupModePromptPayload()) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
    return true;
  }

  if (id === "log:all:delete") {
    if (interaction.replied || interaction.deferred) {
      await (interaction.followUp(deleteConfirmPromptPayload()) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } else {
      await (interaction.reply(deleteConfirmPromptPayload()) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
    return true;
  }

  if (id === LOG_DELETE_CANCEL_ID) {
    if (!interaction.deferred && !interaction.replied) {
      const updated = await interaction
        .update({ content: "Log silme islemi iptal edildi.", components: [] })
        .then(() => true)
        .catch(() => false);
      if (updated) return true;
      await (interaction.reply({ content: "Log silme islemi iptal edildi.", ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return true;
    }
    await (interaction.followUp({ content: "Log silme islemi iptal edildi.", ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    return true;
  }

  if (id === LOG_DELETE_CONFIRM_ID) {
    let usedUpdate = false;
    if (!interaction.deferred && !interaction.replied) {
      usedUpdate = await interaction
        .update({ content: "Log sistemi siliniyor...", components: [] })
        .then(() => true)
        .catch(() => false);
      if (!usedUpdate) {
        await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
    }

    const current = await getConfig(client.db, interaction.guildId);
    const res = await deleteAllChannels(interaction.guild, current);
    const merged = await setConfig(client.db, interaction.guildId, res.cfg);
    await (sendOrUpdatePanel(interaction, merged) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

    const out =
      `Log sistemi temizlendi.\n` +
      `- Silinen log kanalı: ${res.deletedCount}\n` +
      `- Kategori silindi: ${res.categoryDeleted ? "evet" : "hayır"}`;

    if (usedUpdate) {
      await (interaction.followUp({ content: out, ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } else if (interaction.deferred || interaction.replied) {
      await (interaction.editReply({ content: out }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } else {
      await (interaction.reply({ content: out, ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
    return true;
  }

  if (id === "log:mode:forum") {
    if (!interaction.deferred && !interaction.replied) {
      await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }

    const current = await getConfig(client.db, interaction.guildId);
    const infra = await detectExistingLogModes(interaction.guild, current);
    if (infra.hasTextLogs) {
      await interaction
        .editReply("Kanal log kurulumu aktif görünüyor. Forum olarak kurmak için önce `Logu Sil` kullan.")
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return true;
    }
    let res;
    try {
      res = await setupForumChannels(interaction.guild, current);
    } catch (err) {
      console.error("log forum setup error:", err);
      const msg = String(err?.message || err || "Bilinmeyen hata");
      await (interaction.editReply(`Forum log kurulumu başarısız oldu.\n\`\`\`${msg.slice(0, 1500)}\`\`\``) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return true;
    }
    const merged = await setConfig(client.db, interaction.guildId, res.cfg);
    await (sendOrUpdatePanel(interaction, merged) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

    const out =
      `Başarılı: Forum log kurulumu tamamlandı.\n` +
      `- Kategori: ${res.categoryCreated ? "oluşturuldu" : "hazır bulundu"}\n` +
      `- Yeni forum: ${res.createdForumCount}\n` +
      `- Yeni başlık: ${res.createdTopicCount}`;

    await (interaction.editReply({ content: out }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    return true;
  }

  if (id === "log:mode:channels") {
    if (!interaction.deferred && !interaction.replied) {
      await (interaction.deferReply({ ephemeral: true }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }

    const current = await getConfig(client.db, interaction.guildId);
    const infra = await detectExistingLogModes(interaction.guild, current);
    if (infra.hasForumLogs) {
      await interaction
        .editReply("Forum log kurulumu aktif görünüyor. Kanal olarak kurmak için önce `Logu Sil` kullan.")
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return true;
    }
    let res;
    try {
      res = await setupAllChannels(interaction.guild, current);
    } catch (err) {
      console.error("log channel setup error:", err);
      const msg = String(err?.message || err || "Bilinmeyen hata");
      await (interaction.editReply(`Kanal log kurulumu başarısız oldu.\n\`\`\`${msg.slice(0, 1500)}\`\`\``) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return true;
    }
    const merged = await setConfig(client.db, interaction.guildId, res.cfg);
    await (sendOrUpdatePanel(interaction, merged) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

    const out =
      `Başarılı: Log kurulumu tamamlandı.\n` +
      `- Kategori: ${res.categoryCreated ? "oluşturuldu" : "hazır bulundu"}\n` +
      `- Yeni kanal: ${res.createdCount}`;

    await (interaction.editReply({ content: out }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    return true;
  }

  return false;
}

async function sendByKey(guild, cfg, key, payload) {
  const id = cfg?.channels?.[key];
  if (!id) return false;
  const ch = await (guild.channels.fetch(id) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!ch?.isTextBased?.()) return false;
  if (ch?.isThread?.() && ch.archived) {
    await (ch.setArchived(false) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }
  const enrichedPayload = applyRelatedThumbnailToPayload(payload);
  await (ch.send(enrichedPayload) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  return true;
}

async function sendByExtra(guild, cfg, key, payload) {
  const id = cfg?.extraChannels?.[key];
  if (!id) return false;
  const ch = await (guild.channels.fetch(id) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!ch?.isTextBased?.()) return false;
  if (ch?.isThread?.() && ch.archived) {
    await (ch.setArchived(false) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }
  const enrichedPayload = applyRelatedThumbnailToPayload(payload);
  await (ch.send(enrichedPayload) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  return true;
}

function colorizePayloadEmbeds(payload, color) {
  if (!payload || typeof payload !== "object") return payload;
  const embeds = Array.isArray(payload.embeds) ? payload.embeds : null;
  if (!embeds?.length) return payload;

  const nextEmbeds = embeds.map((embed) => {
    if (!embed) return embed;
    if (typeof embed.setColor === "function") {
      embed.setColor(color);
      return embed;
    }
    if (embed && typeof embed === "object") {
      return { ...embed, color };
    }
    return embed;
  });

  return { ...payload, embeds: nextEmbeds };
}

async function sendTicketPayload(guild, db, payload, opts = {}) {
  if (!guild || !db || !payload) return false;
  const cfg = await getConfig(db, guild.id);
  const talepId = cfg?.channels?.talep || null;
  if (!talepId) return false;

  const excluded = new Set(
    Array.isArray(opts?.excludeChannelIds)
      ? opts.excludeChannelIds.map((x) => String(x || "").trim()).filter(Boolean)
      : []
  );
  if (excluded.has(String(talepId))) return false;

  const coloredPayload = colorizePayloadEmbeds(payload, COLOR_WHITE);
  return sendByKey(guild, cfg, "talep", coloredPayload);
}

function isSameId(a, b) {
  return String(a || "") === String(b || "");
}

function getEntryTargetIds(entry) {
  const out = [];
  if (entry?.target?.id) out.push(entry.target.id);
  if (entry?.extra?.id) out.push(entry.extra.id);
  if (entry?.extra?.channel?.id) out.push(entry.extra.channel.id);
  if (entry?.extra?.messageId) out.push(entry.extra.messageId);
  return out;
}

function getAuditChannelTargetId(entry) {
  const targetId = String(entry?.target?.id || "").trim();
  if (targetId) return targetId;
  const fromExtraChannel = String(entry?.extra?.channel?.id || "").trim();
  if (fromExtraChannel) return fromExtraChannel;
  return null;
}

function getAuditExecutorId(entry) {
  const direct = String(entry?.executorId || "").trim();
  if (direct) return direct;
  const nested = String(entry?.executor?.id || "").trim();
  if (nested) return nested;
  return null;
}

function cleanupChannelAuditActorCache(now = Date.now()) {
  for (const [key, item] of channelAuditActorCache.entries()) {
    const at = Number(item?.at || 0);
    if (!at || now - at > CHANNEL_AUDIT_ACTOR_TTL_MS) {
      channelAuditActorCache.delete(key);
    }
  }
}

function setRecentChannelAuditActor(guildId, channelId, executorId, at = Date.now()) {
  const gid = String(guildId || "").trim();
  const cid = String(channelId || "").trim();
  const eid = String(executorId || "").trim();
  if (!gid || !cid || !eid) return;
  cleanupChannelAuditActorCache();
  channelAuditActorCache.set(`${gid}:${cid}`, {
    executorId: eid,
    at: Number(at || Date.now()),
  });
}

function getRecentChannelAuditActor(guildId, channelId, maxAgeMs = CHANNEL_AUDIT_ACTOR_TTL_MS) {
  const gid = String(guildId || "").trim();
  const cid = String(channelId || "").trim();
  if (!gid || !cid) return null;

  cleanupChannelAuditActorCache();
  const item = channelAuditActorCache.get(`${gid}:${cid}`);
  if (!item) return null;

  const at = Number(item?.at || 0);
  const ageLimit = Math.max(1_000, Number(maxAgeMs || CHANNEL_AUDIT_ACTOR_TTL_MS));
  if (!at || Date.now() - at > ageLimit) {
    channelAuditActorCache.delete(`${gid}:${cid}`);
    return null;
  }

  const executorId = String(item?.executorId || "").trim();
  if (!executorId) return null;
  return { executorId, at };
}

function isBotExecutor(guild, executorId) {
  return executorId && executorId === guild?.members?.me?.id;
}

async function isBotActor(guild, executorId) {
  if (!guild || !executorId) return false;

  if (isBotExecutor(guild, executorId)) return true;

  const cached = guild.members?.cache?.get?.(executorId) || null;
  if (cached?.user) return Boolean(cached.user.bot);

  const fetched = await (guild.members?.fetch?.(executorId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (fetched?.user) return Boolean(fetched.user.bot);

  return false;
}

function mentionUser(userId) {
  return userId ? `<@${userId}>` : "Bilinmiyor";
}

async function fetchAuditEntry(guild, opts = {}) {
  const {
    type,
    targetId = null,
    maxAgeMs = 45_000,
    retries = 3,
    delayMs = 700,
    limit = 14,
    match = null,
  } = opts;

  if (!guild?.fetchAuditLogs || !type) return null;

  for (let i = 0; i <= retries; i++) {
    const logs = await (guild.fetchAuditLogs({ type, limit }) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    const entries = logs?.entries ? [...logs.entries.values()] : [];
    const now = Date.now();

    for (const entry of entries) {
      const created = Number(entry?.createdTimestamp || 0);
      if (!created || now - created > maxAgeMs) continue;

      if (targetId) {
        const ids = getEntryTargetIds(entry);
        if (!ids.some((id) => isSameId(id, targetId))) continue;
      }

      if (typeof match === "function" && !match(entry)) continue;
      return entry;
    }

    if (i < retries) await wait(delayMs);
  }

  return null;
}

async function fetchWebhookAuditEntry(guild, channelId) {
  const types = [
    AuditLogEvent.WebhookCreate,
    AuditLogEvent.WebhookUpdate,
    AuditLogEvent.WebhookDelete,
  ];

  let latest = null;
  for (const type of types) {
    const entry = await fetchAuditEntry(guild, {
      type,
      targetId: channelId || null,
      maxAgeMs: 30_000,
      retries: 1,
      delayMs: 600,
      limit: 12,
    });
    if (!entry) continue;
    if (!latest || (entry.createdTimestamp || 0) > (latest.createdTimestamp || 0)) {
      latest = entry;
    }
  }
  return latest;
}

async function resolveAuditActor(guild, opts = {}) {
  const type = opts?.type;
  const targetId = opts?.targetId || null;
  const match = typeof opts?.match === "function" ? opts.match : null;
  const fallbackReason = opts?.fallbackReason || null;
  const maxAgeMs = Number(opts?.maxAgeMs || 45_000);
  const retries = Number.isFinite(Number(opts?.retries)) ? Number(opts.retries) : 3;
  const delayMs = Number.isFinite(Number(opts?.delayMs)) ? Number(opts.delayMs) : 700;
  const limit = Number.isFinite(Number(opts?.limit)) ? Number(opts.limit) : 14;

  let entry = opts?.entry || null;
  let executorId = getAuditExecutorId(entry);

  if ((!entry || !executorId) && type) {
    entry = await fetchAuditEntry(guild, {
      type,
      targetId,
      maxAgeMs,
      retries,
      delayMs,
      limit,
      match,
    }) || entry;
    executorId = getAuditExecutorId(entry);
  }

  if ((!entry || !executorId) && type && !opts?.disableLooseFallback) {
    // Hedef eşleşmesi kaçarsa son fallback: aynı tipte en güncel kaydı dene.
    entry = await fetchAuditEntry(guild, {
      type,
      maxAgeMs: Math.min(maxAgeMs, 20_000),
      retries: 1,
      delayMs: 400,
      limit: 8,
      match,
    }) || entry;
    executorId = getAuditExecutorId(entry);
  }

  return {
    entry,
    executorId,
    reason: entry?.reason || fallbackReason || "Belirtilmedi",
    at: Number(entry?.createdTimestamp || Date.now()),
  };
}

async function resolveChannelUpdateAuditActor(guild, channelId) {
  if (!guild || !channelId) {
    return {
      entry: null,
      executorId: null,
      reason: "Belirtilmedi",
      at: Date.now(),
    };
  }

  const options = {
    targetId: channelId,
    maxAgeMs: 60_000,
    retries: 3,
    delayMs: 700,
    limit: 40,
    disableLooseFallback: true,
  };

  const types = [
    AuditLogEvent.ChannelUpdate,
    AuditLogEvent.ChannelOverwriteUpdate,
    AuditLogEvent.ChannelOverwriteCreate,
    AuditLogEvent.ChannelOverwriteDelete,
  ];

  let best = null;
  for (const type of types) {
    const resolved = await resolveAuditActor(guild, { type, ...options });
    const resolvedEntry = resolved?.entry || null;
    if (!resolvedEntry) continue;

    const targetIds = getEntryTargetIds(resolvedEntry);
    if (targetIds.length && !targetIds.some((id) => isSameId(id, channelId))) continue;

    if (!best || Number(resolved.at || 0) > Number(best.at || 0)) {
      best = resolved;
    }
  }

  const recentCached = getRecentChannelAuditActor(guild.id, channelId, 90_000);
  if (best) {
    if (!best.executorId && recentCached?.executorId) {
      return {
        ...best,
        executorId: recentCached.executorId,
        at: Math.max(Number(best.at || 0), Number(recentCached.at || 0)),
      };
    }
    return best;
  }

  const resolved = await resolveAuditActor(guild, {
    type: AuditLogEvent.ChannelUpdate,
    targetId: channelId,
    maxAgeMs: 60_000,
    retries: 4,
    delayMs: 700,
    limit: 50,
  });

  if (!resolved?.executorId && recentCached?.executorId) {
    return {
      ...resolved,
      executorId: recentCached.executorId,
      at: Math.max(Number(resolved?.at || 0), Number(recentCached.at || 0)),
    };
  }

  return resolved;
}

function toInviteSnapshot(invite) {
  return {
    code: invite.code,
    uses: Number(invite.uses || 0),
    inviterId: invite.inviter?.id || null,
    maxUses: Number(invite.maxUses || 0),
    temporary: Boolean(invite.temporary),
    channelId: invite.channel?.id || null,
  };
}

async function fetchInviteSnapshot(guild) {
  if (!guild?.invites?.fetch) return null;
  const invites = await (guild.invites.fetch() || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!invites) return null;

  const snapshot = new Map();
  for (const invite of invites.values()) {
    snapshot.set(invite.code, toInviteSnapshot(invite));
  }
  return snapshot;
}

async function refreshInviteCache(guild) {
  const snapshot = await fetchInviteSnapshot(guild);
  if (snapshot) inviteCache.set(guild.id, snapshot);
  return snapshot;
}

function normalizeInviteUniqueMap(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;

  for (const [code, value] of Object.entries(raw)) {
    if (!code) continue;
    const list = Array.isArray(value?.users)
      ? value.users
      : Array.isArray(value)
        ? value
        : [];

    const users = [...new Set(list.map((x) => String(x || "").trim()).filter(Boolean))];
    if (!users.length) continue;
    out[code] = { users };
  }

  return out;
}

async function getInviteUniqueMap(db, guildId) {
  if (!db || !guildId) return {};

  const cached = inviteUniqueCache.get(guildId);
  if (cached) return cached;

  const raw = await (db.get(INVITE_UNIQUE_KEY(guildId)) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  const normalized = normalizeInviteUniqueMap(raw);
  inviteUniqueCache.set(guildId, normalized);
  return normalized;
}

async function setInviteUniqueMap(db, guildId, map) {
  if (!db || !guildId) return;
  const normalized = normalizeInviteUniqueMap(map);
  inviteUniqueCache.set(guildId, normalized);
  await (db.set(INVITE_UNIQUE_KEY(guildId), normalized) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
}

async function trackInviteUniqueUse(db, guildId, code, userId) {
  const inviteCode = String(code || "").trim();
  const uid = String(userId || "").trim();
  if (!db || !guildId || !inviteCode || !uid) return null;

  const map = await getInviteUniqueMap(db, guildId);
  const entry = map[inviteCode] || { users: [] };
  const users = new Set(
    Array.isArray(entry.users)
      ? entry.users.map((x) => String(x || "").trim()).filter(Boolean)
      : []
  );

  const before = users.size;
  users.add(uid);
  const after = users.size;
  map[inviteCode] = { users: [...users] };

  if (after !== before) {
    await setInviteUniqueMap(db, guildId, map);
  }

  return {
    code: inviteCode,
    before,
    after,
    duplicate: after === before,
  };
}

function pickUsedInvite(previous, current) {
  let best = null;

  for (const [code, after] of current || []) {
    const before = previous?.get(code);
    const beforeUses = Number(before?.uses || 0);
    const afterUses = Number(after?.uses || 0);
    const delta = afterUses - beforeUses;
    if (delta <= 0) continue;

    const candidate = { code, data: after, beforeUses, afterUses, delta };
    if (!best || candidate.delta > best.delta || (candidate.delta === best.delta && candidate.afterUses > best.afterUses)) {
      best = candidate;
    }
  }

  if (best) return best;

  if (!previous || !previous.size) {
    for (const [code, after] of current || []) {
      const afterUses = Number(after?.uses || 0);
      if (afterUses <= 0) continue;
      const candidate = { code, data: after, beforeUses: Math.max(0, afterUses - 1), afterUses, delta: 1 };
      if (!best || candidate.afterUses > best.afterUses) best = candidate;
    }
    if (best) return best;
  }

  for (const [code, before] of previous || []) {
    if (current?.has?.(code)) continue;
    const maxUses = Number(before?.maxUses || 0);
    const uses = Number(before?.uses || 0);
    if (maxUses > 0 && uses >= maxUses) {
      return { code, data: before, beforeUses: Math.max(0, uses - 1), afterUses: uses, delta: 1 };
    }
  }

  return null;
}

async function detectUsedInvite(guild) {
  const previous = inviteCache.get(guild.id) || null;
  const current = await fetchInviteSnapshot(guild);
  if (!current) return null;
  inviteCache.set(guild.id, current);
  return pickUsedInvite(previous, current);
}

function trimContent(s, max = 1200) {
  const t = String(s || "").trim();
  if (!t) return "(içerik yok)";
  if (t.length <= max) return t;
  return `${t.slice(0, max)}...`;
}

function makeEmbed(color, title, description) {
  const parsedColor = Number(color);
  const safeColor = Number.isFinite(parsedColor) ? parsedColor : 0x000000;
  return createEmbed()
    .setColor(safeColor)
    .setTitle(title)
    .setDescription(description)
    .setImage(LOG_EVENT_IMAGE_URL);
}

async function sendModAction(guild, cfg, action, lines, opts = {}) {
  const at = Number(opts.at || Date.now());
  const executorId = String(opts?.executorId || "").trim() || null;
  if (!executorId) return false;
  if (executorId && (await isBotActor(guild, executorId))) return false;

  const detail = Array.isArray(lines) ? lines.filter(Boolean).join("\n") : String(lines || "");
  const color = Number.isFinite(Number(opts.color)) ? Number(opts.color) : 0x000000;

  const embed = makeEmbed(
    color,
    "Mod Log",
    `İşlem: **${action}**\n${detail}\nSaat: ${formatDate(at)}`
  );

  await sendByKey(guild, cfg, "mod", { embeds: [embed] });
  return true;
}

async function sendChannelActionLog(guild, cfg, title, lines, extraKey, at, opts = {}) {
  const detail = Array.isArray(lines) ? lines.filter(Boolean).join("\n") : String(lines || "");
  const color = Number.isFinite(Number(opts.color)) ? Number(opts.color) : 0x000000;
  const embed = makeEmbed(
    color,
    title,
    `${detail}\nSaat: ${formatDate(at)}`
  );

  let actorType = String(opts?.actorType || "").trim().toLowerCase();
  const executorId = String(opts?.executorId || "").trim() || null;
  if ((!actorType || actorType === "unknown") && executorId) {
    actorType = (await isBotActor(guild, executorId)) ? "bot" : "human";
  }
  const routing = resolveChannelRouting(extraKey, actorType, {
    strict: opts?.strictActorRouting === true,
  });
  if (routing.blocked) {
    return false;
  }

  const routedExtraKey = routing.routedExtraKey;

  if (routedExtraKey) {
    const sentToExtra = await sendByExtra(guild, cfg, routedExtraKey, { embeds: [embed] });
    if (sentToExtra) return true;
  }

  if (opts?.fallbackToKanal === false) return false;
  return sendByKey(guild, cfg, "kanal", { embeds: [embed] });
}

function hasAuditChange(entry, patterns) {
  const changes = entry?.changes || [];
  const loweredPatterns = (patterns || []).map((x) => String(x).toLowerCase());
  return changes.some((ch) => {
    const key = String(ch?.key || "").toLowerCase();
    return loweredPatterns.some((p) => key.includes(p));
  });
}

function humanizePermissionName(name) {
  return String(name || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (x) => x.toUpperCase())
    .trim();
}

function permissionNamesFromBits(bitfield) {
  let bits = 0n;
  try {
    bits = BigInt(bitfield || 0);
  } catch {
    bits = 0n;
  }

  return new PermissionsBitField(bits)
    .toArray()
    .map((x) => humanizePermissionName(x));
}

function formatPermissionList(bitfield, emptyText = "-") {
  const list = permissionNamesFromBits(bitfield);
  if (!list.length) return emptyText;
  return list.slice(0, 8).join(", ") + (list.length > 8 ? ` (+${list.length - 8})` : "");
}

function stringifyAuditValue(value) {
  if (value === undefined) return "-";
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "string") return value || "(boş)";

  try {
    const asJson = JSON.stringify(value);
    if (!asJson) return "-";
    return asJson.length > 120 ? `${asJson.slice(0, 117)}...` : asJson;
  } catch {
    return String(value);
  }
}

function describeAuditChanges(entry, maxLines = 8) {
  const changes = Array.isArray(entry?.changes) ? entry.changes : [];
  if (!changes.length) return [];

  const skipKeys = new Set([
    "permission_overwrites",
    "overwrites",
    "$add",
    "$remove",
  ]);

  const lines = [];
  for (const change of changes) {
    const key = String(change?.key || "").trim();
    if (!key || skipKeys.has(key)) continue;

    const trKey =
      key === "communication_disabled_until"
        ? "Zaman Aşımı Bitiş Tarihi"
        : key;
    const oldValue = stringifyAuditValue(change?.old);
    const newValue = stringifyAuditValue(change?.new);
    lines.push(`${trKey}: \`${oldValue}\` -> \`${newValue}\``);
    if (lines.length >= maxLines) break;
  }
  return lines;
}

function humanizeAuditActionName(action) {
  const numeric = Number(action);
  const rawName = AUDIT_EVENT_NAME_BY_VALUE.get(numeric) || (Number.isFinite(numeric) ? `Action ${numeric}` : "Bilinmeyen Action");
  return String(rawName)
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim() || "Bilinmeyen İşlem";
}

function describeAuditTarget(entry, guild) {
  const targetType = String(entry?.targetType || "").trim();
  const targetId =
    entry?.target?.id ||
    entry?.targetId ||
    entry?.extra?.channel?.id ||
    entry?.extra?.id ||
    null;

  if (targetType === "Channel" && targetId) return `<#${targetId}>`;
  if (targetType === "Role" && targetId) return `<@&${targetId}>`;
  if (targetType === "User" && targetId) return mentionUser(targetId);
  if (targetType === "Guild") {
    return `\`${trimContent(entry?.target?.name || guild?.name || targetId || "Bilinmiyor", 120)}\``;
  }

  const targetName =
    entry?.target?.name ||
    entry?.target?.tag ||
    entry?.target?.code ||
    entry?.target?.id ||
    null;

  if (targetName && targetId && targetName !== targetId) {
    return `\`${trimContent(targetName, 120)}\` (\`${targetId}\`)`;
  }
  if (targetName) return `\`${trimContent(targetName, 120)}\``;
  if (targetId) return `\`${targetId}\``;
  return "Bilinmiyor";
}

function describeAuditExtraLines(entry) {
  const extra = entry?.extra;
  if (!extra || typeof extra !== "object") return [];

  const lines = [];
  if (extra?.channel?.id) {
    lines.push(`Kanal: <#${extra.channel.id}>`);
  }
  if (extra?.count !== undefined && extra?.count !== null) {
    lines.push(`Sayı: \`${extra.count}\``);
  }
  if (extra?.type !== undefined && extra?.type !== null) {
    lines.push(`Tip: \`${extra.type}\``);
  }
  if (extra?.messageId) {
    lines.push(`Mesaj ID: \`${extra.messageId}\``);
  }

  if (!lines.length) {
    const raw = stringifyAuditValue(extra);
    if (raw && raw !== "-" && raw !== "null") {
      lines.push(`Ek veri: \`${trimContent(raw, 220)}\``);
    }
  }

  return lines.slice(0, 5);
}

function getAutoModAuditRuleName(entry) {
  const extra = entry?.extra || {};
  const name =
    extra?.autoModerationRuleName ||
    extra?.ruleName ||
    entry?.target?.name ||
    "";
  return String(name || "").trim();
}

function getAutoModAuditContent(entry) {
  const extra = entry?.extra || {};
  const directCandidates = [
    extra?.content,
    extra?.messageContent,
    extra?.keywordMatchedContent,
    extra?.matchedContent,
    extra?.keyword,
  ];

  for (const candidate of directCandidates) {
    const text = String(candidate || "").trim();
    if (text) return text;
  }

  const changes = Array.isArray(entry?.changes) ? entry.changes : [];
  for (const change of changes) {
    const key = String(change?.key || "").trim().toLowerCase();
    if (
      key === "content" ||
      key === "message_content" ||
      key === "keyword_matched_content" ||
      key === "matched_content" ||
      key === "keyword"
    ) {
      const next = String(change?.new || change?.old || "").trim();
      if (next) return next;
    }
  }

  return "";
}

function isAutoModBlockAuditAction(action) {
  const numeric = Number(action);
  if (!Number.isFinite(numeric)) return false;

  const autoModBlockValue = Number(AuditLogEvent.AutoModerationBlockMessage);
  if (Number.isFinite(autoModBlockValue)) {
    return numeric === autoModBlockValue;
  }

  const rawName = String(AUDIT_EVENT_NAME_BY_VALUE.get(numeric) || "").trim();
  return rawName === "AutoModerationBlockMessage";
}

async function tryFetchAuditMessageContent(guild, channelId, messageId) {
  if (!channelId || !messageId) return "";
  const channel = await fetchChannelMaybeCached(guild, channelId);
  if (!channel?.messages?.fetch) return "";

  const msg = await (channel.messages.fetch(messageId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  return String(msg?.content || "").trim();
}

async function onAutoModBlockAuditLogEntry(entry, guild, cfg) {
  const executorId = getAuditExecutorId(entry);
  const targetId = String(
    entry?.target?.id ||
    entry?.targetId ||
    entry?.extra?.user?.id ||
    executorId ||
    ""
  ).trim() || null;
  const channelId = String(entry?.extra?.channel?.id || "").trim() || null;
  const messageId = String(entry?.extra?.messageId || "").trim() || null;

  let content = getAutoModAuditContent(entry);
  if (!content) {
    content = await tryFetchAuditMessageContent(guild, channelId, messageId);
  }

  const reason = String(entry?.reason || "").trim();
  const ruleName = getAutoModAuditRuleName(entry);
  const lines = [
    `İşlem: **Auto Moderation Block Message**`,
    `Kullanıcı: ${mentionUser(targetId)}`,
    `Yapan: ${mentionUser(executorId)}`,
    `Kanal: ${channelId ? `<#${channelId}>` : "Bilinmiyor"}`,
  ];

  if (ruleName) {
    lines.push(`Kural: \`${trimContent(ruleName, 120)}\``);
  }
  if (messageId) {
    lines.push(`Mesaj ID: \`${messageId}\``);
  }
  lines.push(`Mesaj İçeriği: ${trimContent(content || "(Discord audit kaydinda içerik yok)", 700)}`);
  if (reason) {
    lines.push(`Neden: ${trimContent(reason, 400)}`);
  }
  lines.push(`Saat: ${formatDate(Number(entry?.createdTimestamp || Date.now()))}`);

  const embed = createEmbed()
    .setColor(COLOR_DANGER)
    .setTitle("Mesaj Log")
    .setDescription(lines.join("\n"))
    .setImage(LOG_EVENT_IMAGE_URL);

  const sent = await sendByKey(guild, cfg, "mesaj", { embeds: [embed] });

  if (!sent) {
    await sendModAction(
      guild,
      cfg,
      "Auto Moderation Block Message",
      lines,
      {
        at: Number(entry?.createdTimestamp || Date.now()),
        executorId,
        color: COLOR_DANGER,
      }
    );
  }
}

function getChannelOverwriteMap(channel) {
  const map = new Map();
  const overwrites = channel?.permissionOverwrites?.cache;
  if (!overwrites?.size) return map;

  for (const ow of overwrites.values()) {
    const targetId = String(ow?.id || "").trim();
    if (!targetId) continue;
    const type = Number(ow?.type || 0);
    const key = `${targetId}:${type}`;
    map.set(key, {
      id: targetId,
      type,
      allow: String(ow?.allow?.bitfield || "0"),
      deny: String(ow?.deny?.bitfield || "0"),
    });
  }
  return map;
}

function overwriteTargetLabel(guild, item) {
  if (!item?.id) return "Bilinmiyor";
  if (item.type === 0) {
    if (item.id === guild?.roles?.everyone?.id) return "@everyone";
    if (guild?.roles?.cache?.has(item.id)) return `<@&${item.id}>`;
    return `Rol:${item.id}`;
  }
  return `<@${item.id}>`;
}

function diffChannelOverwriteLines(guild, oldChannel, newChannel, maxLines = 8) {
  const oldMap = getChannelOverwriteMap(oldChannel);
  const newMap = getChannelOverwriteMap(newChannel);
  const keys = [...new Set([...oldMap.keys(), ...newMap.keys()])];
  const lines = [];

  for (const key of keys) {
    const before = oldMap.get(key) || null;
    const after = newMap.get(key) || null;

    if (!before && after) {
      lines.push(
        `Eklendi: ${overwriteTargetLabel(guild, after)} | İzin+: ${formatPermissionList(after.allow)} | İzin-: ${formatPermissionList(after.deny)}`
      );
      if (lines.length >= maxLines) break;
      continue;
    }

    if (before && !after) {
      lines.push(`Kaldırıldı: ${overwriteTargetLabel(guild, before)}`);
      if (lines.length >= maxLines) break;
      continue;
    }

    if (!before || !after) continue;
    if (before.allow === after.allow && before.deny === after.deny) continue;

    let oldAllow = 0n;
    let newAllow = 0n;
    let oldDeny = 0n;
    let newDeny = 0n;
    try {
      oldAllow = BigInt(before.allow || "0");
      newAllow = BigInt(after.allow || "0");
      oldDeny = BigInt(before.deny || "0");
      newDeny = BigInt(after.deny || "0");
    } catch {
      // no-op
    }

    const allowAdded = formatPermissionList(newAllow & ~oldAllow, null);
    const allowRemoved = formatPermissionList(oldAllow & ~newAllow, null);
    const denyAdded = formatPermissionList(newDeny & ~oldDeny, null);
    const denyRemoved = formatPermissionList(oldDeny & ~newDeny, null);

    const parts = [];
    if (allowAdded) parts.push(`+İzin: ${allowAdded}`);
    if (allowRemoved) parts.push(`-İzin: ${allowRemoved}`);
    if (denyAdded) parts.push(`+Yasak: ${denyAdded}`);
    if (denyRemoved) parts.push(`-Yasak: ${denyRemoved}`);
    if (!parts.length) {
      parts.push(`İzin+: ${formatPermissionList(after.allow)}`);
      parts.push(`İzin-: ${formatPermissionList(after.deny)}`);
    }

    lines.push(`Değişti: ${overwriteTargetLabel(guild, after)} | ${parts.join(" | ")}`);
    if (lines.length >= maxLines) break;
  }

  const totalChanges = keys.length;
  if (lines.length >= maxLines && totalChanges > maxLines) {
    lines.push(`... +${totalChanges - maxLines} değişiklik daha`);
  }
  return lines;
}

function diffChannelSettingLines(oldChannel, newChannel) {
  const lines = [];
  if (!oldChannel || !newChannel) return lines;

  if (oldChannel?.name !== newChannel?.name) {
    lines.push(`İsim: \`${oldChannel?.name || "-"}\` -> \`${newChannel?.name || "-"}\``);
  }
  if (oldChannel?.parentId !== newChannel?.parentId) {
    lines.push(`Kategori: ${oldChannel?.parentId ? `<#${oldChannel.parentId}>` : "-"} -> ${newChannel?.parentId ? `<#${newChannel.parentId}>` : "-"}`);
  }

  if (oldChannel?.topic !== newChannel?.topic) {
    lines.push(`Konu: \`${trimContent(oldChannel?.topic || "-", 90)}\` -> \`${trimContent(newChannel?.topic || "-", 90)}\``);
  }

  if (Number(oldChannel?.rateLimitPerUser || 0) !== Number(newChannel?.rateLimitPerUser || 0)) {
    lines.push(`Yavaş Mod: \`${Number(oldChannel?.rateLimitPerUser || 0)}s\` -> \`${Number(newChannel?.rateLimitPerUser || 0)}s\``);
  }

  if (Boolean(oldChannel?.nsfw) !== Boolean(newChannel?.nsfw)) {
    lines.push(`NSFW: \`${oldChannel?.nsfw ? "Açık" : "Kapalı"}\` -> \`${newChannel?.nsfw ? "Açık" : "Kapalı"}\``);
  }

  if (Number(oldChannel?.bitrate || 0) !== Number(newChannel?.bitrate || 0)) {
    lines.push(`Bitrate: \`${Number(oldChannel?.bitrate || 0)}\` -> \`${Number(newChannel?.bitrate || 0)}\``);
  }

  if (Number(oldChannel?.userLimit || 0) !== Number(newChannel?.userLimit || 0)) {
    lines.push(`Kullanıcı Limiti: \`${Number(oldChannel?.userLimit || 0)}\` -> \`${Number(newChannel?.userLimit || 0)}\``);
  }

  if (String(oldChannel?.rtcRegion || "") !== String(newChannel?.rtcRegion || "")) {
    lines.push(`RTC Bölgesi: \`${oldChannel?.rtcRegion || "Otomatik"}\` -> \`${newChannel?.rtcRegion || "Otomatik"}\``);
  }

  if (
    Number(oldChannel?.defaultAutoArchiveDuration || 0) !==
    Number(newChannel?.defaultAutoArchiveDuration || 0)
  ) {
    lines.push(
      `Varsayılan Arşiv Süresi: \`${Number(oldChannel?.defaultAutoArchiveDuration || 0)}\` -> \`${Number(newChannel?.defaultAutoArchiveDuration || 0)}\``
    );
  }

  if (
    Number(oldChannel?.defaultThreadRateLimitPerUser || 0) !==
    Number(newChannel?.defaultThreadRateLimitPerUser || 0)
  ) {
    lines.push(
      `Varsayılan Thread Slowmode: \`${Number(oldChannel?.defaultThreadRateLimitPerUser || 0)}s\` -> \`${Number(newChannel?.defaultThreadRateLimitPerUser || 0)}s\``
    );
  }

  return lines;
}

function auditHasTimeoutChange(entry) {
  return (entry?.changes || []).some((ch) => String(ch?.key || "").toLowerCase().includes("communication_disabled_until"));
}

function auditAppliesTimeout(entry) {
  const change = (entry?.changes || []).find((ch) =>
    String(ch?.key || "").toLowerCase().includes("communication_disabled_until")
  );
  if (!change) return false;

  const untilTs = Number(new Date(change?.new || "").getTime() || 0);
  return untilTs > Date.now() + 2_000;
}

function auditHasRoleAdd(entry, roleId) {
  const changes = entry?.changes || [];
  for (const change of changes) {
    if (change?.key !== "$add") continue;
    const list = Array.isArray(change?.new) ? change.new : [];
    if (list.some((x) => isSameId(x?.id, roleId))) return true;
  }
  return false;
}

async function resolveMuteRoleId(guild, db) {
  const savedId = await getMuteRoleId(db, guild.id);
  if (savedId && guild.roles.cache.has(savedId)) return savedId;

  const byName = guild.roles.cache.find((r) => /mute/i.test(r.name || ""));
  if (!byName) return null;

  await (setMuteRoleId(db, guild.id, byName.id) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  return byName.id;
}

async function onReady(client) {
  const guilds = [...(client?.guilds?.cache?.values?.() || [])];
  await Promise.allSettled(guilds.map((guild) => refreshInviteCache(guild)));
  for (const guild of guilds) {
    await (syncForumTopicsForGuild(guild, client?.db) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    await wait(120);
  }
}

async function onGuildCreate(guild) {
  await refreshInviteCache(guild);
  await syncForumTopicsForGuild(guild, guild?.client?.db);
}

async function onInviteCreate(invite) {
  if (!invite?.guild) return;
  await refreshInviteCache(invite.guild);
}

async function onInviteDelete(invite) {
  if (!invite?.guild) return;
  await refreshInviteCache(invite.guild);

  const cfg = await getConfig(invite.guild.client.db, invite.guild.id);
  const code = String(invite.code || "").trim();
  const entry = await resolveAuditActor(invite.guild, {
    type: AuditLogEvent.InviteDelete,
    targetId: code || null,
    maxAgeMs: 30_000,
    retries: 2,
    delayMs: 600,
    limit: 10,
  });

  const executorId = entry.executorId;
  if (executorId && (await isBotActor(invite.guild, executorId))) return;

  await sendModAction(
    invite.guild,
    cfg,
    "Davet Silme",
    [
      `Yapan: ${mentionUser(executorId)}`,
      `Kod: \`${code || "Bilinmiyor"}\``,
      `Kanal: ${invite.channel?.id ? `<#${invite.channel.id}>` : "Bilinmiyor"}`,
      `Son kullanım: ${Number(invite.uses || 0)}`,
    ],
    { at: entry.at, executorId }
  );
}

async function onEmojiCreate(emoji, client) {
  if (!emoji?.guild) return;
  const guild = emoji.guild;
  const cfg = await getConfig(client.db, guild.id);

  const entry = await resolveAuditActor(guild, {
    type: AuditLogEvent.EmojiCreate,
    targetId: emoji.id,
    maxAgeMs: 30_000,
    retries: 2,
    delayMs: 600,
    limit: 10,
  });
  const targets = getEntryTargetIds(entry.entry);
  if (targets.length && !targets.some((id) => isSameId(id, emoji.id))) return;

  const executorId = entry.executorId;
  if (executorId && (await isBotActor(guild, executorId))) return;

  await sendModAction(
    guild,
    cfg,
    "Emoji Oluşturma",
    [
      `Yapan: ${mentionUser(executorId)}`,
      `Emoji: ${emoji.toString?.() || emoji.name || "Bilinmiyor"}`,
      `Ad: \`${emoji.name || "Bilinmiyor"}\``,
      `ID: \`${emoji.id}\``,
      `Animasyonlu: ${emoji.animated ? "Evet" : "Hayır"}`,
    ],
    { at: entry.at, executorId }
  );
}

async function onEmojiDelete(emoji, client) {
  if (!emoji?.guild) return;
  const guild = emoji.guild;
  const cfg = await getConfig(client.db, guild.id);

  const entry = await resolveAuditActor(guild, {
    type: AuditLogEvent.EmojiDelete,
    targetId: emoji.id,
    maxAgeMs: 30_000,
    retries: 2,
    delayMs: 600,
    limit: 10,
  });
  const targets = getEntryTargetIds(entry.entry);
  if (targets.length && !targets.some((id) => isSameId(id, emoji.id))) return;

  const executorId = entry.executorId;
  if (executorId && (await isBotActor(guild, executorId))) return;

  await sendModAction(
    guild,
    cfg,
    "Emoji Silme",
    [
      `Yapan: ${mentionUser(executorId)}`,
      `Ad: \`${emoji.name || "Bilinmiyor"}\``,
      `ID: \`${emoji.id}\``,
      `Animasyonlu: ${emoji.animated ? "Evet" : "Hayır"}`,
    ],
    { at: entry.at, color: COLOR_DANGER, executorId }
  );
}

async function onEmojiUpdate(oldEmoji, newEmoji, client) {
  const guild = newEmoji?.guild || oldEmoji?.guild;
  if (!guild || !newEmoji) return;
  const cfg = await getConfig(client.db, guild.id);

  const entry = await resolveAuditActor(guild, {
    type: AuditLogEvent.EmojiUpdate,
    targetId: newEmoji.id,
    maxAgeMs: 30_000,
    retries: 2,
    delayMs: 600,
    limit: 10,
  });
  const targets = getEntryTargetIds(entry.entry);
  if (targets.length && !targets.some((id) => isSameId(id, newEmoji.id))) return;

  const executorId = entry.executorId;
  if (executorId && (await isBotActor(guild, executorId))) return;

  const lines = [
    `Yapan: ${mentionUser(executorId)}`,
    `Emoji: ${newEmoji.toString?.() || newEmoji.name || "Bilinmiyor"}`,
    `Ad: \`${oldEmoji?.name || "-"}\` -> \`${newEmoji.name || "-"}\``,
    `ID: \`${newEmoji.id}\``,
  ];

  const changeLines = describeAuditChanges(entry.entry, 8);
  if (changeLines.length) {
    lines.push("Detaylar:");
    lines.push(...changeLines.map((x) => `- ${x}`));
  }

  await sendModAction(guild, cfg, "Emoji Güncelleme", lines, { at: entry.at, executorId });
}

async function onStickerCreate(sticker, client) {
  if (!sticker?.guild) return;
  const guild = sticker.guild;
  const cfg = await getConfig(client.db, guild.id);

  const entry = await resolveAuditActor(guild, {
    type: AuditLogEvent.StickerCreate,
    targetId: sticker.id,
    maxAgeMs: 30_000,
    retries: 2,
    delayMs: 600,
    limit: 10,
  });
  const targets = getEntryTargetIds(entry.entry);
  if (targets.length && !targets.some((id) => isSameId(id, sticker.id))) return;

  const executorId = entry.executorId;
  if (executorId && (await isBotActor(guild, executorId))) return;

  await sendModAction(
    guild,
    cfg,
    "Sticker Oluşturma",
    [
      `Yapan: ${mentionUser(executorId)}`,
      `Sticker: \`${sticker.name || "Bilinmiyor"}\``,
      `ID: \`${sticker.id}\``,
      `Açıklama: ${trimContent(sticker.description || "-", 300)}`,
      `Etiket: \`${sticker.tags || "-"}\``,
    ],
    { at: entry.at, executorId }
  );
}

async function onStickerDelete(sticker, client) {
  if (!sticker?.guild) return;
  const guild = sticker.guild;
  const cfg = await getConfig(client.db, guild.id);

  const entry = await resolveAuditActor(guild, {
    type: AuditLogEvent.StickerDelete,
    targetId: sticker.id,
    maxAgeMs: 30_000,
    retries: 2,
    delayMs: 600,
    limit: 10,
  });
  const targets = getEntryTargetIds(entry.entry);
  if (targets.length && !targets.some((id) => isSameId(id, sticker.id))) return;

  const executorId = entry.executorId;
  if (executorId && (await isBotActor(guild, executorId))) return;

  await sendModAction(
    guild,
    cfg,
    "Sticker Silme",
    [
      `Yapan: ${mentionUser(executorId)}`,
      `Sticker: \`${sticker.name || "Bilinmiyor"}\``,
      `ID: \`${sticker.id}\``,
    ],
    { at: entry.at, color: COLOR_DANGER, executorId }
  );
}

async function onStickerUpdate(oldSticker, newSticker, client) {
  const guild = newSticker?.guild || oldSticker?.guild;
  if (!guild || !newSticker) return;
  const cfg = await getConfig(client.db, guild.id);

  const entry = await resolveAuditActor(guild, {
    type: AuditLogEvent.StickerUpdate,
    targetId: newSticker.id,
    maxAgeMs: 30_000,
    retries: 2,
    delayMs: 600,
    limit: 10,
  });
  const targets = getEntryTargetIds(entry.entry);
  if (targets.length && !targets.some((id) => isSameId(id, newSticker.id))) return;

  const executorId = entry.executorId;
  if (executorId && (await isBotActor(guild, executorId))) return;

  const lines = [
    `Yapan: ${mentionUser(executorId)}`,
    `Sticker: \`${oldSticker?.name || "-"}\` -> \`${newSticker.name || "-"}\``,
    `ID: \`${newSticker.id}\``,
  ];

  if ((oldSticker?.description || "") !== (newSticker?.description || "")) {
    lines.push(`Açıklama: \`${trimContent(oldSticker?.description || "-", 90)}\` -> \`${trimContent(newSticker?.description || "-", 90)}\``);
  }
  if ((oldSticker?.tags || "") !== (newSticker?.tags || "")) {
    lines.push(`Etiket: \`${oldSticker?.tags || "-"}\` -> \`${newSticker?.tags || "-"}\``);
  }

  const changeLines = describeAuditChanges(entry.entry, 8);
  if (changeLines.length) {
    lines.push("Detaylar:");
    lines.push(...changeLines.map((x) => `- ${x}`));
  }

  await sendModAction(guild, cfg, "Sticker Güncelleme", lines, { at: entry.at, executorId });
}

async function onGuildMemberAdd(member, client) {
  if (!member?.guild) return;
  const cfg = await getConfig(client.db, member.guild.id);
  const now = Date.now();
  const joinedAt = Number(member.joinedTimestamp || now);
  await (client.db.set(JOIN_TRACK_KEY(member.guild.id, member.id), joinedAt) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

  const girisEmbed = makeEmbed(
    COLOR_SUCCESS,
    "Giriş Çıkış Log",
    `Üye girişi: <@${member.id}>\n` +
      `Hesap: ${member.user?.tag || member.id}\n` +
      `Katılım: ${formatDiscordTimestamp(joinedAt, "F")} (${formatDiscordTimestamp(joinedAt, "R")})\n` +
      `Saat: ${formatDate(now)}`
  );

  await sendByKey(member.guild, cfg, "girisCikis", { embeds: [girisEmbed] });

  const usedInvite = await detectUsedInvite(member.guild);
  const inviterId = usedInvite?.data?.inviterId || null;
  const code = usedInvite?.code || null;
  const inviteLink = code ? `https://discord.gg/${code}` : "Bilinmiyor";
  const inviteUses = usedInvite ? `${usedInvite.beforeUses} -> ${usedInvite.afterUses}` : "Bilinmiyor";
  const uniqueUse = code
    ? await trackInviteUniqueUse(client.db, member.guild.id, code, member.id)
    : null;
  const uniqueUses = uniqueUse ? `${uniqueUse.before} -> ${uniqueUse.after}` : "Bilinmiyor";

  const davetEmbed = makeEmbed(
    COLOR_PURPLE,
    "Davet Log",
    `Katılan: <@${member.id}> (\`${member.user?.tag || member.id}\`)\n` +
      `Davet eden: ${mentionUser(inviterId)}\n` +
      `Davet linki: ${inviteLink}\n` +
      `Kullanım: ${uniqueUses}\n` +
      `Discord ham kullanım: ${inviteUses}\n` +
      `${uniqueUse?.duplicate ? "Not: Aynı üye aynı daveti tekrar kullandı, tekil kullanım artmadı.\n" : ""}` +
      `Saat: ${formatDate(now)}`
  );

  await sendByKey(member.guild, cfg, "davet", { embeds: [davetEmbed] });
}

async function onGuildMemberRemove(member, client) {
  if (!member?.guild) return;
  const cfg = await getConfig(client.db, member.guild.id);
  const now = Date.now();
  const key = JOIN_TRACK_KEY(member.guild.id, member.id);
  const storedJoinedAt = Number((await client.db.get(key).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; })) || 0);
  const joinedAt = storedJoinedAt || Number(member.joinedTimestamp || 0) || null;
  if (storedJoinedAt) {
    await (client.db.delete(key) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  const [kickEntryRaw, banEntryRaw, currentBan] = await Promise.all([
    fetchAuditEntry(member.guild, {
      type: AuditLogEvent.MemberKick,
      targetId: member.id,
      maxAgeMs: 20_000,
      retries: 2,
      delayMs: 700,
      limit: 8,
    }),
    fetchAuditEntry(member.guild, {
      type: AuditLogEvent.MemberBanAdd,
      targetId: member.id,
      maxAgeMs: 20_000,
      retries: 2,
      delayMs: 700,
      limit: 8,
    }),
    (member.guild.bans?.fetch?.(member.id) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; }),
  ]);

  const kickEntry = await resolveAuditActor(member.guild, {
    entry: kickEntryRaw,
    type: AuditLogEvent.MemberKick,
    targetId: member.id,
    maxAgeMs: 20_000,
    retries: 2,
    delayMs: 700,
    limit: 8,
  });

  const kickTargets = getEntryTargetIds(kickEntry?.entry);
  const hasKickEntry = Boolean(
    kickEntry?.entry &&
      (!kickTargets.length || kickTargets.some((id) => isSameId(id, member.id)))
  );

  const banTargets = getEntryTargetIds(banEntryRaw);
  const hasBanEntry = Boolean(
    banEntryRaw &&
      (!banTargets.length || banTargets.some((id) => isSameId(id, member.id)))
  );
  const isBanned = Boolean(currentBan || hasBanEntry);

  if (!isBanned && !hasKickEntry) {
    const cikisEmbed = makeEmbed(
      COLOR_DANGER,
      "Giriş Çıkış Log",
      `Üye çıkışı: <@${member.id}>\n` +
        `Hesap: ${member.user?.tag || member.id}\n` +
        `Katılım: ${joinedAt ? `${formatDiscordTimestamp(joinedAt, "F")} (${formatDiscordTimestamp(joinedAt, "R")})` : "Bilinmiyor"}\n` +
        `Ayrılış: ${formatDiscordTimestamp(now, "F")} (${formatDiscordTimestamp(now, "R")})\n` +
        `Sunucuda kalma: ${joinedAt ? formatDurationShort(now - joinedAt) : "Bilinmiyor"}\n` +
        `Saat: ${formatDate(now)}`
    );
    await sendByKey(member.guild, cfg, "girisCikis", { embeds: [cikisEmbed] });
  }

  if (isBanned || !hasKickEntry) return;

  const executorId = kickEntry.executorId;
  const reason = trimContent(kickEntry.reason, 400);
  const at = kickEntry.at;

  const kickEmbed = makeEmbed(
    COLOR_DANGER,
    "Kick Log",
    `Kicklenen: <@${member.id}> (\`${member.user?.tag || member.id}\`)\n` +
      `Yapan: ${mentionUser(executorId)}\n` +
      `Neden: ${reason}\n` +
      `Saat: ${formatDate(at)}`
  );
  const kickThumb = getKickThumbnailUrl();
  if (kickThumb) {
    kickEmbed.setThumbnail(kickThumb);
  }

  const sentKick = await sendByKey(member.guild, cfg, "kick", { embeds: [kickEmbed] });

  if (!sentKick && executorId && !(await isBotActor(member.guild, executorId))) {
    await sendModAction(
      member.guild,
      cfg,
      "Kick",
      [
        `Hedef: <@${member.id}> (\`${member.user?.tag || member.id}\`)`,
        `Yapan: ${mentionUser(executorId)}`,
        `Neden: ${reason}`,
      ],
      { at, color: COLOR_DANGER, executorId }
    );
  }
}

async function logNameChanges(oldMember, newMember, cfg) {
  const oldNick = oldMember?.nickname || null;
  const newNick = newMember?.nickname || null;

  if (oldNick === newNick) return;

  const embed = makeEmbed(
    0xfee75c,
    "İsim Log",
    `Üye: <@${newMember.id}>\n` +
      `Sunucu ismi: \`${oldNick || "-"}\` -> \`${newNick || "-"}\`\n` +
      `Saat: ${formatDate(Date.now())}`
  );

  await sendByKey(newMember.guild, cfg, "isim", { embeds: [embed] });
}

async function onUserUpdate(oldUser, newUser, client) {
  if (!oldUser || !newUser || !client?.db) return;
  if (newUser.bot) return;

  const oldGlobal = oldUser?.username || null;
  const newGlobal = newUser?.username || null;
  const oldDisplay = oldUser?.globalName || oldGlobal || null;
  const newDisplay = newUser?.globalName || newGlobal || null;
  const globalChanged = oldGlobal !== newGlobal;
  const displayChanged = oldDisplay !== newDisplay;
  const displayMirrorsGlobal =
    globalChanged &&
    oldDisplay === oldGlobal &&
    newDisplay === newGlobal;

  if (!globalChanged && !displayChanged) {
    return;
  }

  const guilds = [...(client.guilds?.cache?.values?.() || [])];
  for (const guild of guilds) {
    const member =
      guild.members?.cache?.get?.(newUser.id) ||
      await (guild.members.fetch(newUser.id) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (!member) continue;

    const cfg = await getConfig(client.db, guild.id);
    const lines = [];

    if (globalChanged) {
      lines.push(`Global ad: \`${oldGlobal || "-"}\` -> \`${newGlobal || "-"}\``);
    }
    if (displayChanged && !displayMirrorsGlobal) {
      lines.push(`Görünen ad: \`${oldDisplay || "-"}\` -> \`${newDisplay || "-"}\``);
    }
    if (!lines.length) continue;

    const embed = makeEmbed(
      0xfee75c,
      "İsim Log",
      `Üye: <@${newUser.id}>\n` +
        `${lines.join("\n")}\n` +
        `Saat: ${formatDate(Date.now())}`
    );

    await sendByKey(guild, cfg, "isim", { embeds: [embed] });
  }
}

async function logTimeoutChanges(oldMember, newMember, client, cfg) {
  const oldUntil = Number(oldMember?.communicationDisabledUntilTimestamp || 0);
  const newUntil = Number(newMember?.communicationDisabledUntilTimestamp || 0);
  const now = Date.now();

  const maybeApplied = newUntil > now + 2000;
  const maybeRemoved = oldUntil > now + 2000 && newUntil <= now + 2000;
  if (!maybeApplied && !maybeRemoved) return;

  const entryRaw = await fetchAuditEntry(newMember.guild, {
    type: AuditLogEvent.MemberUpdate,
    targetId: newMember.id,
    maxAgeMs: 40_000,
    retries: 3,
    delayMs: 800,
    limit: 12,
    match: (auditEntry) => auditHasTimeoutChange(auditEntry),
  });

  const entry = await resolveAuditActor(newMember.guild, {
    entry: entryRaw,
    type: AuditLogEvent.MemberUpdate,
    targetId: newMember.id,
    maxAgeMs: 40_000,
    retries: 3,
    delayMs: 800,
    limit: 12,
    match: (auditEntry) => auditHasTimeoutChange(auditEntry),
  });

  const hasAuditTimeoutChange = auditHasTimeoutChange(entry?.entry);
  const auditSaysApply = hasAuditTimeoutChange && auditAppliesTimeout(entry?.entry);

  const timeoutApplied =
    (newUntil > now + 2000 && (oldUntil <= now + 2000 || Math.abs(newUntil - oldUntil) > 1000)) ||
    (newUntil > now + 2000 && auditSaysApply);
  const timeoutRemoved =
    (oldUntil > now + 2000 && newUntil <= now + 2000) ||
    (hasAuditTimeoutChange && !auditSaysApply && newUntil <= now + 2000);

  if (!timeoutApplied && !timeoutRemoved) return;
  if (timeoutApplied && isMarkedProtectionTimeout(newMember.guild.id, newMember.id, newUntil)) return;

  const executorId = entry.executorId;
  const reason = entry.reason;
  const at = entry.at;
  const isBotAction = executorId ? await isBotActor(newMember.guild, executorId) : false;

  if (timeoutApplied) {
    const cezaEmbed = makeEmbed(
      COLOR_TIMEOUT_APPLY,
      "Ceza Log",
        `Üye: <@${newMember.id}> (\`${newMember.user?.tag || newMember.id}\`)\n` +
        `Ceza: **Zaman Aşımı**\n` +
        `Veren: ${mentionUser(executorId)}\n` +
        `Bitiş: ${formatDiscordTimestamp(newUntil, "F")} (${formatDiscordTimestamp(newUntil, "R")})\n` +
        `Neden: **${trimContent(reason, 400)}**\n` +
        `Saat: ${formatDate(at)}`
    );

    await sendByKey(newMember.guild, cfg, "ceza", { embeds: [cezaEmbed] });

    if (executorId && !isBotAction) {
      await sendModAction(
        newMember.guild,
        cfg,
        "Zaman Aşımı",
        [
          `Hedef: <@${newMember.id}> (\`${newMember.user?.tag || newMember.id}\`)`,
          `Yapan: ${mentionUser(executorId)}`,
          `Bitiş: ${formatDiscordTimestamp(newUntil, "F")} (${formatDiscordTimestamp(newUntil, "R")})`,
          `Neden: ${trimContent(reason, 400)}`,
        ],
        { at, color: COLOR_TIMEOUT_APPLY, executorId }
      );
    }
  }

  if (timeoutRemoved) {
    const cezaEmbed = makeEmbed(
      COLOR_TIMEOUT_REMOVE,
      "Ceza Log",
      `Üye: <@${newMember.id}> (\`${newMember.user?.tag || newMember.id}\`)\n` +
        `Ceza: **Zaman Aşımı Kaldırıldı**\n` +
        `İşlemi yapan: ${mentionUser(executorId)}\n` +
        `Önceki bitiş: ${formatDiscordTimestamp(oldUntil, "F")} (${formatDiscordTimestamp(oldUntil, "R")})\n` +
        `Neden: **${trimContent(reason, 400)}**\n` +
        `Saat: ${formatDate(at)}`
    );

    await sendByKey(newMember.guild, cfg, "ceza", { embeds: [cezaEmbed] });

    if (executorId && !isBotAction) {
      await sendModAction(
        newMember.guild,
        cfg,
        "Zaman Aşımı Kaldırıldı",
        [
          `Hedef: <@${newMember.id}> (\`${newMember.user?.tag || newMember.id}\`)`,
          `Yapan: ${mentionUser(executorId)}`,
          `Önceki bitiş: ${formatDiscordTimestamp(oldUntil, "F")} (${formatDiscordTimestamp(oldUntil, "R")})`,
          `Neden: ${trimContent(reason, 400)}`,
        ],
        { at, color: COLOR_TIMEOUT_REMOVE, executorId }
      );
    }
  }
}

async function onProtectionTimeout(member, client, data = {}) {
  const guild = member?.guild;
  if (!guild || !client?.db) return;

  const untilTs = Number(data?.untilTs || 0);
  if (!Number.isFinite(untilTs) || untilTs <= Date.now() + 1000) return;

  const cfg = await getConfig(client.db, guild.id);
  const executorId = guild.members?.me?.id || guild.client?.user?.id || null;
  const reason = data?.reason || "Protection";
  const at = Date.now();

  markProtectionTimeout(guild.id, member.id, untilTs);

  const cezaEmbed = makeEmbed(
    COLOR_TIMEOUT_APPLY,
    "Ceza Log",
    `Üye: <@${member.id}> (\`${member.user?.tag || member.id}\`)\n` +
      `Ceza: **Zaman Aşımı**\n` +
      `Veren: ${mentionUser(executorId)}\n` +
      `Bitiş: ${formatDiscordTimestamp(untilTs, "F")} (${formatDiscordTimestamp(untilTs, "R")})\n` +
      `Neden: **${trimContent(reason, 400)}**\n` +
      `Saat: ${formatDate(at)}`
  );

  await sendByKey(guild, cfg, "ceza", { embeds: [cezaEmbed] });
}

async function logMuteRoleChanges(oldMember, newMember, client, cfg) {
  const muteRoleId = await resolveMuteRoleId(newMember.guild, client.db);
  if (!muteRoleId) return;

  const oldHas = oldMember?.roles?.cache?.has?.(muteRoleId);
  const newHas = newMember?.roles?.cache?.has?.(muteRoleId);
  if (oldHas || !newHas) return;

  const entryRaw = await fetchAuditEntry(newMember.guild, {
    type: AuditLogEvent.MemberRoleUpdate,
    targetId: newMember.id,
    maxAgeMs: 40_000,
    retries: 3,
    delayMs: 800,
    limit: 12,
    match: (auditEntry) => auditHasRoleAdd(auditEntry, muteRoleId),
  });

  const entry = await resolveAuditActor(newMember.guild, {
    entry: entryRaw,
    type: AuditLogEvent.MemberRoleUpdate,
    targetId: newMember.id,
    maxAgeMs: 40_000,
    retries: 3,
    delayMs: 800,
    limit: 12,
    match: (auditEntry) => auditHasRoleAdd(auditEntry, muteRoleId),
  });

  const executorId = entry.executorId;
  const at = entry.at;
  const reason = entry.reason;

  const jailEmbed = makeEmbed(
    COLOR_DANGER,
    "Jail Log",
      `Üye: <@${newMember.id}> (\`${newMember.user?.tag || newMember.id}\`)\n` +
      `Aldığı rol: <@&${muteRoleId}>\n` +
      `Veren: ${mentionUser(executorId)}\n` +
      `Neden: ${trimContent(reason, 400)}\n` +
      `Saat: ${formatDate(at)}`
  );

  const sentJail = await sendByKey(newMember.guild, cfg, "jail", { embeds: [jailEmbed] });

  if (!sentJail && executorId && !(await isBotActor(newMember.guild, executorId))) {
    await sendModAction(
      newMember.guild,
      cfg,
      "Mute Rolü Verildi",
      [
        `Hedef: <@${newMember.id}> (\`${newMember.user?.tag || newMember.id}\`)`,
        `Rol: <@&${muteRoleId}>`,
        `Yapan: ${mentionUser(executorId)}`,
        `Neden: ${trimContent(reason, 400)}`,
      ],
      { at, color: COLOR_DANGER, executorId }
    );
  }
}

async function logMemberRoleChanges(oldMember, newMember, cfg) {
  const oldRoles = oldMember?.roles?.cache;
  const newRoles = newMember?.roles?.cache;
  if (!oldRoles || !newRoles) return;

  const added = newRoles.filter((role) => !oldRoles.has(role.id));
  const removed = oldRoles.filter((role) => !newRoles.has(role.id));
  if (!added.size && !removed.size) return;

  const raw = await fetchAuditEntry(newMember.guild, {
    type: AuditLogEvent.MemberRoleUpdate,
    targetId: newMember.id,
    maxAgeMs: 40_000,
    retries: 3,
    delayMs: 700,
    limit: 12,
  });
  const resolved = await resolveAuditActor(newMember.guild, {
    entry: raw,
    type: AuditLogEvent.MemberRoleUpdate,
    targetId: newMember.id,
    maxAgeMs: 40_000,
    retries: 3,
    delayMs: 700,
    limit: 12,
  });

  const executorId = resolved.executorId;
  if (!executorId || (await isBotActor(newMember.guild, executorId))) return;

  const addedText = added.size
    ? added.map((role) => `<@&${role.id}>`).slice(0, 10).join(", ") + (added.size > 10 ? ` (+${added.size - 10})` : "")
    : null;
  const removedText = removed.size
    ? removed.map((role) => `<@&${role.id}>`).slice(0, 10).join(", ") + (removed.size > 10 ? ` (+${removed.size - 10})` : "")
    : null;

  const action = added.size && removed.size
    ? "Rol Güncelleme"
    : added.size
      ? "Rol Verme"
      : "Rol Alma";

  const lines = [
    `Hedef: <@${newMember.id}> (\`${newMember.user?.tag || newMember.id}\`)`,
    `Yapan: ${mentionUser(executorId)}`,
  ];
  if (addedText) lines.push(`Verilen roller: ${addedText}`);
  if (removedText) lines.push(`Alınan roller: ${removedText}`);
  lines.push(`Neden: ${trimContent(resolved.reason, 400)}`);

  await sendModAction(newMember.guild, cfg, action, lines, {
    at: resolved.at,
    color: added.size && !removed.size ? COLOR_PRIMARY : 0xfee75c,
    executorId,
  });
}

async function onGuildMemberUpdate(oldMember, newMember, client) {
  if (!newMember?.guild) return;
  const cfg = await getConfig(client.db, newMember.guild.id);

  await logMemberRoleChanges(oldMember, newMember, cfg);
  await logNameChanges(oldMember, newMember, cfg);
  await logTimeoutChanges(oldMember, newMember, client, cfg);
  await logMuteRoleChanges(oldMember, newMember, client, cfg);
}

async function onVoiceStateUpdate(oldState, newState, client) {
  const guild = newState?.guild || oldState?.guild;
  const member = newState?.member || oldState?.member;
  if (!guild || !member || member.user?.bot) return;

  const oldChannelId = oldState?.channelId || null;
  const newChannelId = newState?.channelId || null;
  if (oldChannelId === newChannelId) return;

  const cfg = await getConfig(client.db, guild.id);
  const now = Date.now();
  const key = buildVoiceSessionKey(guild.id, member.id);
  const session = voiceSessionCache.get(key) || null;

  if (!oldChannelId && newChannelId) {
    voiceSessionCache.set(key, { joinedAt: now, channelId: newChannelId });
  const embed = makeEmbed(
      COLOR_SUCCESS,
      "Ses Log",
      `Üye: <@${member.id}>\n` +
        `Durum: **Sese girdi**\n` +
        `Kanal: <#${newChannelId}>\n` +
        `Saat: ${formatDate(now)}`
    );
    await sendByKey(guild, cfg, "ses", { embeds: [embed] });
    return;
  }

  if (oldChannelId && !newChannelId) {
    const joinedAt = Number(session?.joinedAt || 0) || now;
    const duration = Math.max(0, now - joinedAt);
    voiceSessionCache.delete(key);

  const embed = makeEmbed(
      COLOR_DANGER,
      "Ses Log",
      `Üye: <@${member.id}>\n` +
        `Durum: **Sesten çıktı**\n` +
        `Kanal: <#${oldChannelId}>\n` +
        `Seste kalma süresi: **${formatDurationShort(duration)}**\n` +
        `Saat: ${formatDate(now)}`
    );
    await sendByKey(guild, cfg, "ses", { embeds: [embed] });
    return;
  }

  if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
    const joinedAt = Number(session?.joinedAt || 0) || now;
    const duration = Math.max(0, now - joinedAt);
    voiceSessionCache.set(key, { joinedAt: now, channelId: newChannelId });

  const embed = makeEmbed(
      COLOR_INFO,
      "Ses Log",
      `Üye: <@${member.id}>\n` +
        `Durum: **Kanal değiştirdi**\n` +
        `Eski kanal: <#${oldChannelId}>\n` +
        `Yeni kanal: <#${newChannelId}>\n` +
        `Eski kanalda kalma süresi: **${formatDurationShort(duration)}**\n` +
        `Saat: ${formatDate(now)}`
    );
    await sendByKey(guild, cfg, "ses", { embeds: [embed] });
    return;
  }

  if (newChannelId && !session) {
    voiceSessionCache.set(key, { joinedAt: now, channelId: newChannelId });
  }
}

async function onMessageDelete(message, client) {
  let msg = message;
  if (msg?.partial) {
    msg = await (msg.fetch() || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  }
  if (!msg?.guild) return;
  if (msg.author?.bot) return;

  const cfg = await getConfig(client.db, msg.guild.id);
  const markedReason = consumeMessageDeleteReason(msg.guild.id, msg.channelId, msg.id);
  const meId = msg.guild.members?.me?.id || msg.guild.client?.user?.id || null;

  const matchByChannel = (auditEntry) => {
    const auditChannelId = auditEntry?.extra?.channel?.id || null;
    if (auditChannelId && !isSameId(auditChannelId, msg.channelId)) return false;
    return true;
  };

  const rawEntry = await fetchAuditEntry(msg.guild, {
    type: AuditLogEvent.MessageDelete,
    targetId: msg.author?.id || null,
    maxAgeMs: 20_000,
    retries: 2,
    delayMs: 500,
    limit: 8,
    match: matchByChannel,
  });

  const audit = await resolveAuditActor(msg.guild, {
    entry: rawEntry,
    type: AuditLogEvent.MessageDelete,
    targetId: msg.author?.id || null,
    maxAgeMs: 20_000,
    retries: 1,
    delayMs: 400,
    limit: 8,
    match: matchByChannel,
    disableLooseFallback: true,
  });

  let executorId = audit.executorId;
  if (!executorId && markedReason && meId) {
    executorId = meId;
  }
  const isBotDelete = Boolean(meId && executorId && isSameId(meId, executorId));

  const lines = [
    `Yazar: <@${msg.author?.id || "0"}>`,
    `Kanal: <#${msg.channelId}>`,
    `Mesaj ID: \`${msg.id}\``,
    `Yapan: ${mentionUser(executorId)}`,
  ];

  if (isBotDelete && markedReason) {
    lines.push(`Bot silme nedeni: **${trimContent(markedReason, 300)}**`);
  } else if (audit?.entry?.reason) {
    lines.push(`Silme nedeni: ${trimContent(audit.entry.reason, 300)}`);
  }

  lines.push(`Saat: ${formatDate(Date.now())}`);
  lines.push("");
  lines.push(`İçerik:\n${trimContent(msg.content)}`);

  const embed = createEmbed()
    .setColor(COLOR_DANGER)
    .setTitle("Mesaj Log")
    .setDescription(lines.join("\n"))
    .setImage(LOG_EVENT_IMAGE_URL);

  if (msg.attachments?.size) {
    const urls = [...msg.attachments.values()].slice(0, 4).map((a) => a.url).join("\n");
    embed.addFields({ name: "Ekler", value: urls || "-", inline: false });
  }

  await sendByKey(msg.guild, cfg, "mesaj", { embeds: [embed] });
}

async function onMessageUpdate(oldMessage, newMessage, client) {
  let oldMsg = oldMessage;
  let newMsg = newMessage;

  if (newMsg?.partial) {
    newMsg = await (newMsg.fetch() || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  }
  if (!newMsg?.guild) return;
  if (newMsg.author?.bot) return;

  if (oldMsg?.partial) {
    oldMsg = await oldMsg.fetch().catch(() => oldMsg);
  }

  const oldContent = String(oldMsg?.content || "").trim();
  const newContent = String(newMsg?.content || "").trim();
  if (oldContent === newContent) return;

  const cfg = await getConfig(client.db, newMsg.guild.id);
  const beforeText = oldContent || "(önceki içerik önbellekte yok)";
  const afterText = newContent || "(içerik boş)";

  const embed = createEmbed()
    .setColor(COLOR_PRIMARY)
    .setTitle("Mesaj Log")
    .setDescription(
      `Yazar: <@${newMsg.author?.id || "0"}>\n` +
      `Kanal: <#${newMsg.channelId}>\n` +
      `Mesaj ID: \`${newMsg.id}\`\n` +
      `Saat: ${formatDate(Date.now())}\n\n` +
      `Önceki mesaj:\n${trimContent(beforeText)}\n\n` +
      `Değiştirilmiş mesaj:\n${trimContent(afterText)}`
    )
    .setImage(LOG_EVENT_IMAGE_URL);

  await sendByKey(newMsg.guild, cfg, "mesaj", { embeds: [embed] });
}

async function onMessageDeleteBulk(messages, client) {
  if (!messages?.size) return;

  const first = messages.first?.() || [...messages.values()][0];
  const guild = first?.guild || null;
  if (!guild) return;

  const cfg = await getConfig(client.db, guild.id);
  const meId = guild.members?.me?.id || guild.client?.user?.id || null;
  const channelId = first?.channelId || first?.channel?.id || null;

  const authorCounts = new Map();
  const reasonCounts = new Map();

  for (const msg of messages.values()) {
    if (!msg?.author || msg.author.bot) continue;

    const authorId = String(msg.author.id || "").trim();
    if (authorId) {
      authorCounts.set(authorId, (authorCounts.get(authorId) || 0) + 1);
    }

    const reason = consumeMessageDeleteReason(guild.id, msg.channelId, msg.id);
    if (reason) {
      reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
    }
  }

  const matchByChannel = (auditEntry) => {
    const auditChannelId = auditEntry?.extra?.channel?.id || null;
    if (channelId && auditChannelId && !isSameId(auditChannelId, channelId)) return false;
    return true;
  };

  const rawEntry = await fetchAuditEntry(guild, {
    type: AuditLogEvent.MessageBulkDelete,
    targetId: channelId || null,
    maxAgeMs: 20_000,
    retries: 2,
    delayMs: 500,
    limit: 8,
    match: matchByChannel,
  });

  const audit = await resolveAuditActor(guild, {
    entry: rawEntry,
    type: AuditLogEvent.MessageBulkDelete,
    targetId: channelId || null,
    maxAgeMs: 20_000,
    retries: 1,
    delayMs: 400,
    limit: 8,
    match: matchByChannel,
    disableLooseFallback: true,
  });

  let executorId = audit.executorId;
  if (!executorId && reasonCounts.size && meId) {
    executorId = meId;
  }

  const topAuthors = [...authorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([uid, count]) => `<@${uid}> (${count})`)
    .join(", ");

  const topReason = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const lines = [
    `Kanal: ${channelId ? `<#${channelId}>` : "Bilinmiyor"}`,
    `Silinen mesaj: **${messages.size}**`,
    `Yapan: ${mentionUser(executorId)}`,
  ];

  if (topAuthors) {
    lines.push(`Etkilenen kullanıcılar: ${topAuthors}`);
  }
  if (topReason) {
    lines.push(`Bot silme nedeni: **${trimContent(topReason, 300)}**`);
  } else if (audit?.entry?.reason) {
    lines.push(`Silme nedeni: ${trimContent(audit.entry.reason, 300)}`);
  }
  lines.push(`Saat: ${formatDate(Date.now())}`);

  const embed = createEmbed()
    .setColor(COLOR_DANGER)
    .setTitle("Mesaj Log")
    .setDescription(lines.join("\n"))
    .setImage(LOG_EVENT_IMAGE_URL);

  await sendByKey(guild, cfg, "mesaj", { embeds: [embed] });
}

async function onGuildBanAdd(ban, client) {
  if (!ban?.guild || !ban?.user) return;
  const cfg = await getConfig(client.db, ban.guild.id);
  const entryRaw = await fetchAuditEntry(ban.guild, {
    type: AuditLogEvent.MemberBanAdd,
    targetId: ban.user.id,
    maxAgeMs: 40_000,
    retries: 3,
    delayMs: 800,
    limit: 12,
  });

  const entry = await resolveAuditActor(ban.guild, {
    entry: entryRaw,
    type: AuditLogEvent.MemberBanAdd,
    targetId: ban.user.id,
    maxAgeMs: 40_000,
    retries: 3,
    delayMs: 800,
    limit: 12,
    fallbackReason: ban.reason || "Belirtilmedi",
  });
  const banTargets = getEntryTargetIds(entry.entry);
  if (banTargets.length && !banTargets.some((id) => isSameId(id, ban.user.id))) return;

  const executorId = entry.executorId;
  const reason = entry.reason;
  const at = entry.at;
  const banCount = await shiftGuildBanTotal(ban.guild, client.db, 1);

  const embed = createEmbed()
    .setColor(COLOR_DANGER)
    .setTitle("Ban Log")
    .setDescription(
      `Banlanan: <@${ban.user.id}> (\`${ban.user.tag || ban.user.id}\`)\n` +
      `Yapan: ${mentionUser(executorId)}\n` +
      `Neden: ${trimContent(reason, 400)}\n` +
      `Kaçıncı ban: **#${banCount}**\n` +
      `Saat: ${formatDate(at)}`
    )
    .setImage(LOG_EVENT_IMAGE_URL);
  const banThumb = getBanThumbnailUrl();
  if (banThumb) {
    embed.setThumbnail(banThumb);
  }

  const sentBan = await sendByKey(ban.guild, cfg, "ban", { embeds: [embed] });

  if (!sentBan && executorId && !(await isBotActor(ban.guild, executorId))) {
    await sendModAction(
      ban.guild,
      cfg,
      "Ban",
      [
        `Hedef: <@${ban.user.id}> (\`${ban.user.tag || ban.user.id}\`)`,
        `Yapan: ${mentionUser(executorId)}`,
        `Neden: ${trimContent(reason, 400)}`,
      ],
      { at, color: COLOR_DANGER, executorId }
    );
  }
}

async function onGuildBanRemove(ban, client) {
  if (!ban?.guild || !ban?.user) return;
  const cfg = await getConfig(client.db, ban.guild.id);
  const banCount = await shiftGuildBanTotal(ban.guild, client.db, -1);
  const entryRaw = await fetchAuditEntry(ban.guild, {
    type: AuditLogEvent.MemberBanRemove,
    targetId: ban.user.id,
    maxAgeMs: 40_000,
    retries: 3,
    delayMs: 800,
    limit: 12,
  });

  const entry = await resolveAuditActor(ban.guild, {
    entry: entryRaw,
    type: AuditLogEvent.MemberBanRemove,
    targetId: ban.user.id,
    maxAgeMs: 40_000,
    retries: 3,
    delayMs: 800,
    limit: 12,
    fallbackReason: "Belirtilmedi",
  });

  const banTargets = getEntryTargetIds(entry.entry);
  if (banTargets.length && !banTargets.some((id) => isSameId(id, ban.user.id))) return;

  const executorId = entry.executorId;
  const reason = entry.reason;
  const at = entry.at;
  const isBotAction = executorId ? await isBotActor(ban.guild, executorId) : false;

  const embed = createEmbed()
    .setColor(COLOR_SUCCESS)
    .setTitle("Ban Log")
    .setDescription(
      `Banı kaldırılan: <@${ban.user.id}> (\`${ban.user.tag || ban.user.id}\`)\n` +
      `Yapan: ${mentionUser(executorId)}\n` +
      `Neden: ${trimContent(reason, 400)}\n` +
      `Sunucudaki aktif ban sayısı: **#${banCount}**\n` +
      `Saat: ${formatDate(at)}`
    )
    .setImage(LOG_EVENT_IMAGE_URL);
  const unbanThumb = getUnbanThumbnailUrl();
  if (unbanThumb) {
    embed.setThumbnail(unbanThumb);
  }

  const sentUnban = await sendByKey(ban.guild, cfg, "ban", { embeds: [embed] });

  if (!sentUnban && executorId && !isBotAction) {
    await sendModAction(
      ban.guild,
      cfg,
      "Ban Kaldırma",
      [
        `Hedef: <@${ban.user.id}> (\`${ban.user.tag || ban.user.id}\`)`,
        `Yapan: ${mentionUser(executorId)}`,
        `Neden: ${trimContent(reason, 400)}`,
      ],
      { at, color: COLOR_SUCCESS, executorId }
    );
  }
}

async function onLevelUp(message, client, data) {
  const guild = message?.guild;
  if (!guild) return;

  const cfg = await getConfig(client.db, guild.id);
  const userId = data?.userId || message.author?.id || "0";
  const userTag = data?.userTag || message.author?.tag || userId;
  const oldLevel = Number(data?.oldLevel || 0);
  const newLevel = Number(data?.newLevel || oldLevel);
  const gain = Number(data?.gain || 0);
  const totalXp = Number(data?.totalXp || 0);
  const isVoiceLevel = data?.levelType === "voice";
  const levelType = isVoiceLevel ? "Voice Level" : "Text Level";
  const channelId = data?.channelId || message?.channelId || null;

  const embed = createEmbed()
    .setColor(COLOR_INFO)
    .setTitle("Seviye Log")
    .setDescription(
      `Üye: <@${userId}> (\`${userTag}\`)\n` +
      `${levelType} Atladı: **${oldLevel} -> ${newLevel}**\n` +
      `Kazanılan XP: **+${gain}**\n` +
      `Toplam XP: **${totalXp}**\n` +
      `Kanal: ${channelId ? `<#${channelId}>` : "Bilinmiyor"}\n` +
      `Saat: ${formatDate(Date.now())}`
    )
    .setImage(LOG_EVENT_IMAGE_URL);

  await sendByKey(guild, cfg, "seviye", { embeds: [embed] });
}

async function onChannelCreate(channel, client) {
  if (!channel?.guild) return;
  const cfg = await getConfig(client.db, channel.guild.id);
  const entryRaw = await fetchAuditEntry(channel.guild, {
    type: AuditLogEvent.ChannelCreate,
    targetId: channel.id,
    maxAgeMs: 40_000,
    retries: 2,
    delayMs: 700,
    limit: 10,
  });

  const entry = await resolveAuditActor(channel.guild, {
    entry: entryRaw,
    type: AuditLogEvent.ChannelCreate,
    targetId: channel.id,
    maxAgeMs: 40_000,
    retries: 2,
    delayMs: 700,
    limit: 10,
  });
  const createTargets = getEntryTargetIds(entry.entry);
  if (createTargets.length && !createTargets.some((id) => isSameId(id, channel.id))) return;
  const executorId = entry.executorId;
  const at = entry.at;
  const isBotAction = executorId ? await isBotActor(channel.guild, executorId) : false;

  const lines = [
    `Kanal: <#${channel.id}> (\`${channel.name}\`)`,
    `Tür: ${channelTypeLabel(channel.type)}`,
    `Yapan: ${mentionUser(executorId)}`,
  ];

  const sentCreate = await sendChannelActionLog(
    channel.guild,
    cfg,
    "Kanal Oluşturma",
    lines,
    "kanalOlusturma",
    at,
    {
      executorId,
      actorType: isBotAction ? "bot" : "human",
      color: COLOR_SUCCESS,
    }
  );

  if (!sentCreate && executorId && !isBotAction) {
    await sendModAction(channel.guild, cfg, "Kanal Oluşturma", lines, { at, executorId });
  }
}

async function onChannelDelete(channel, client) {
  if (!channel?.guild) return;
  const cfg = await getConfig(client.db, channel.guild.id);
  const entryRaw = await fetchAuditEntry(channel.guild, {
    type: AuditLogEvent.ChannelDelete,
    targetId: channel.id,
    maxAgeMs: 40_000,
    retries: 2,
    delayMs: 700,
    limit: 10,
  });

  const entry = await resolveAuditActor(channel.guild, {
    entry: entryRaw,
    type: AuditLogEvent.ChannelDelete,
    targetId: channel.id,
    maxAgeMs: 40_000,
    retries: 2,
    delayMs: 700,
    limit: 10,
  });
  const deleteTargets = getEntryTargetIds(entry.entry);
  if (deleteTargets.length && !deleteTargets.some((id) => isSameId(id, channel.id))) return;
  const executorId = entry.executorId;
  const at = entry.at;
  const isBotAction = executorId ? await isBotActor(channel.guild, executorId) : false;

  const lines = [
    `Kanal: \`${channel.name}\` (\`${channel.id}\`)`,
    `Tür: ${channelTypeLabel(channel.type)}`,
    `Yapan: ${mentionUser(executorId)}`,
  ];

  const sentDelete = await sendChannelActionLog(
    channel.guild,
    cfg,
    "Kanal Silme",
    lines,
    "kanalSilme",
    at,
    {
      executorId,
      actorType: isBotAction ? "bot" : "human",
      color: COLOR_DANGER,
    }
  );

  if (!sentDelete && executorId && !isBotAction) {
    await sendModAction(channel.guild, cfg, "Kanal Silme", lines, {
      at,
      color: COLOR_DANGER,
      executorId,
    });
  }

  const parentId = String(channel.parentId || "").trim();
  if (!parentId) return;
  const parent =
    channel.guild.channels.cache.get(parentId) ||
    await (channel.guild.channels.fetch(parentId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!parent || parent.type !== ChannelType.GuildCategory || parent.name !== LOG_CATEGORY_NAME) return;

  const hasAnyChild = channel.guild.channels.cache.some((c) => c.parentId === parent.id);
  if (hasAnyChild) return;

  await (parent.delete("Log klasoru bosaldi, otomatik temizleme") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
}

async function onChannelUpdate(oldChannel, newChannel, client) {
  if (!newChannel?.guild) return;
  const cfg = await getConfig(client.db, newChannel.guild.id);
  const entry = await resolveChannelUpdateAuditActor(newChannel.guild, newChannel.id);
  const updateTargets = getEntryTargetIds(entry.entry);
  if (updateTargets.length && !updateTargets.some((id) => isSameId(id, newChannel.id))) return;

  const executorId = entry.executorId;
  const at = entry.at;
  const isBotAction = executorId ? await isBotActor(newChannel.guild, executorId) : false;
  const actorType = isBotAction ? "bot" : (executorId ? "human" : "unknown");

  const baseLines = [
    `Kanal: <#${newChannel.id}> (\`${newChannel.name}\`)`,
    `Tür: ${channelTypeLabel(newChannel.type)}`,
    `Yapan: ${mentionUser(executorId)}`,
  ];

  const settingLines = diffChannelSettingLines(oldChannel, newChannel);
  const permissionLines = diffChannelOverwriteLines(newChannel.guild, oldChannel, newChannel, 8);
  const auditFallbackLines = describeAuditChanges(entry.entry, 8);

  const combined = [...baseLines];
  if (settingLines.length) {
    combined.push("Ayar değişiklikleri:");
    combined.push(...settingLines.map((x) => `- ${x}`));
  }
  if (permissionLines.length) {
    combined.push("İzin değişiklikleri:");
    combined.push(...permissionLines.map((x) => `- ${x}`));
  }
  if (!settingLines.length && !permissionLines.length && auditFallbackLines.length) {
    combined.push("Audit değişiklikleri:");
    combined.push(...auditFallbackLines.map((x) => `- ${x}`));
  }

  const channelUpdateColor = isBotAction ? COLOR_CHANNEL_BOT : COLOR_CHANNEL_HUMAN;
  const generalEmbed = makeEmbed(channelUpdateColor, "Kanal Güncelleme", `${combined.join("\n")}\nSaat: ${formatDate(at)}`);
  // Bot aksiyonlarini normal kanal loguna dusurmeyelim; sadece BOT kanallarina yonlendir.
  const sentGeneral = actorType === "human"
    ? await sendByKey(newChannel.guild, cfg, "kanal", { embeds: [generalEmbed] })
    : false;
  let sentSpecific = false;

  const nameChanged = oldChannel?.name !== newChannel?.name;

  if (nameChanged) {
    const sent = await sendChannelActionLog(
      newChannel.guild,
      cfg,
      "Kanal İsim Düzenleme",
      [...baseLines, `İsim: \`${oldChannel?.name || "-"}\` -> \`${newChannel?.name || "-"}\``],
      "kanalIsimDuzenleme",
      at,
      {
        fallbackToKanal: false,
        strictActorRouting: true,
        executorId,
        actorType,
        color: COLOR_INFO,
      }
    );
    if (sent) sentSpecific = true;
  }

  if (permissionLines.length) {
    const sent = await sendChannelActionLog(
      newChannel.guild,
      cfg,
      "Kanal İzinleri Değiştirme",
      [...baseLines, ...permissionLines.map((x) => `- ${x}`)],
      "kanalIzinDegistirme",
      at,
      {
        fallbackToKanal: false,
        strictActorRouting: true,
        executorId,
        actorType,
        color: COLOR_PRIMARY,
      }
    );
    if (sent) sentSpecific = true;
  }

  if (settingLines.length || auditFallbackLines.length) {
    const detail = settingLines.length ? settingLines : auditFallbackLines;
    const sent = await sendChannelActionLog(
      newChannel.guild,
      cfg,
      "Kanal Ayarları Değiştirme",
      [...baseLines, ...detail.map((x) => `- ${x}`)],
      "kanalAyarDegistirme",
      at,
      {
        fallbackToKanal: false,
        strictActorRouting: true,
        executorId,
        actorType,
        color: channelUpdateColor,
      }
    );
    if (sent) sentSpecific = true;
  }

  let sentFallback = false;
  if (!sentGeneral && !sentSpecific) {
    sentFallback = await sendChannelActionLog(
      newChannel.guild,
      cfg,
      "Kanal Güncelleme",
      combined,
      "kanalAyarDegistirme",
      at,
      {
        fallbackToKanal: false,
        strictActorRouting: true,
        executorId,
        actorType,
        color: channelUpdateColor,
      }
    );
  }

  const sentAnyChannelLog = sentGeneral || sentSpecific || sentFallback;
  if (!sentAnyChannelLog && executorId && actorType === "human") {
    await sendModAction(newChannel.guild, cfg, "Kanal Güncelleme", combined, {
      at,
      executorId,
    });
  }
}

async function onRoleCreate(role, client) {
  if (!role?.guild) return;
  const cfg = await getConfig(client.db, role.guild.id);
  const entryRaw = await fetchAuditEntry(role.guild, {
    type: AuditLogEvent.RoleCreate,
    targetId: role.id,
    maxAgeMs: 40_000,
    retries: 2,
    delayMs: 700,
    limit: 10,
  });

  const entry = await resolveAuditActor(role.guild, {
    entry: entryRaw,
    type: AuditLogEvent.RoleCreate,
    targetId: role.id,
    maxAgeMs: 40_000,
    retries: 2,
    delayMs: 700,
    limit: 10,
  });
  const createTargets = getEntryTargetIds(entry.entry);
  if (createTargets.length && !createTargets.some((id) => isSameId(id, role.id))) return;

  const executorId = entry.executorId;
  if (!executorId || (await isBotActor(role.guild, executorId))) return;

  await sendModAction(
    role.guild,
    cfg,
    "Rol Oluşturma",
    [
      `Rol: <@&${role.id}> (\`${role.name}\`)`,
      `Yapan: ${mentionUser(executorId)}`,
    ],
    { at: entry.at, color: COLOR_PRIMARY, executorId }
  );
}

async function onRoleDelete(role, client) {
  if (!role?.guild) return;
  const cfg = await getConfig(client.db, role.guild.id);
  const entryRaw = await fetchAuditEntry(role.guild, {
    type: AuditLogEvent.RoleDelete,
    targetId: role.id,
    maxAgeMs: 40_000,
    retries: 2,
    delayMs: 700,
    limit: 10,
  });

  const entry = await resolveAuditActor(role.guild, {
    entry: entryRaw,
    type: AuditLogEvent.RoleDelete,
    targetId: role.id,
    maxAgeMs: 40_000,
    retries: 2,
    delayMs: 700,
    limit: 10,
  });
  const deleteTargets = getEntryTargetIds(entry.entry);
  if (deleteTargets.length && !deleteTargets.some((id) => isSameId(id, role.id))) return;

  const executorId = entry.executorId;
  if (!executorId || (await isBotActor(role.guild, executorId))) return;

  await sendModAction(
    role.guild,
    cfg,
    "Rol Silme",
    [
      `Rol: \`${role.name}\` (\`${role.id}\`)`,
      `Yapan: ${mentionUser(executorId)}`,
    ],
    { at: entry.at, color: COLOR_DANGER, executorId }
  );
}

async function onRoleUpdate(oldRole, newRole, client) {
  if (!newRole?.guild) return;
  const cfg = await getConfig(client.db, newRole.guild.id);
  const entryRaw = await fetchAuditEntry(newRole.guild, {
    type: AuditLogEvent.RoleUpdate,
    targetId: newRole.id,
    maxAgeMs: 40_000,
    retries: 2,
    delayMs: 700,
    limit: 10,
  });

  const entry = await resolveAuditActor(newRole.guild, {
    entry: entryRaw,
    type: AuditLogEvent.RoleUpdate,
    targetId: newRole.id,
    maxAgeMs: 40_000,
    retries: 2,
    delayMs: 700,
    limit: 10,
  });
  const updateTargets = getEntryTargetIds(entry.entry);
  if (updateTargets.length && !updateTargets.some((id) => isSameId(id, newRole.id))) return;

  const executorId = entry.executorId;
  if (!executorId || (await isBotActor(newRole.guild, executorId))) return;

  const lines = [
    `Rol: <@&${newRole.id}> (\`${newRole.name}\`)`,
    `Yapan: ${mentionUser(executorId)}`,
  ];
  if (oldRole?.name !== newRole?.name) {
    lines.push(`İsim: \`${oldRole?.name || "-"}\` -> \`${newRole?.name || "-"}\``);
  }
  if (String(oldRole?.permissions?.bitfield || "0") !== String(newRole?.permissions?.bitfield || "0")) {
    lines.push("İzinler değişti.");
  }
  const detailLines = describeAuditChanges(entry.entry, 8);
  if (detailLines.length) {
    lines.push("Detaylar:");
    lines.push(...detailLines.map((x) => `- ${x}`));
  }

  await sendModAction(newRole.guild, cfg, "Rol Güncelleme", lines, {
    at: entry.at,
    color: COLOR_INFO,
    executorId,
  });
}

async function onGuildUpdate(oldGuild, newGuild, client) {
  if (!newGuild) return;
  const cfg = await getConfig(client.db, newGuild.id);
  const entryRaw = await fetchAuditEntry(newGuild, {
    type: AuditLogEvent.GuildUpdate,
    targetId: newGuild.id,
    maxAgeMs: 40_000,
    retries: 2,
    delayMs: 700,
    limit: 10,
  });

  const entry = await resolveAuditActor(newGuild, {
    entry: entryRaw,
    type: AuditLogEvent.GuildUpdate,
    targetId: newGuild.id,
    maxAgeMs: 40_000,
    retries: 2,
    delayMs: 700,
    limit: 10,
  });
  const guildTargets = getEntryTargetIds(entry.entry);
  if (guildTargets.length && !guildTargets.some((id) => isSameId(id, newGuild.id))) return;

  const executorId = entry.executorId;
  if (!executorId || (await isBotActor(newGuild, executorId))) return;

  const lines = [
    `Sunucu: \`${oldGuild?.name || newGuild.name}\``,
    `Yapan: ${mentionUser(executorId)}`,
  ];
  if (oldGuild?.name !== newGuild?.name) {
    lines.push(`İsim: \`${oldGuild?.name || "-"}\` -> \`${newGuild?.name || "-"}\``);
  }
  const detailLines = describeAuditChanges(entry.entry, 10);
  if (detailLines.length) {
    lines.push("Detaylar:");
    lines.push(...detailLines.map((x) => `- ${x}`));
  }

  await sendModAction(newGuild, cfg, "Sunucu Güncelleme", lines, {
    at: entry.at,
    executorId,
  });
}

async function onWebhookUpdate(channel, client) {
  const guild = channel?.guild;
  if (!guild) return;
  const cfg = await getConfig(client.db, guild.id);

  const entryRaw = await fetchWebhookAuditEntry(guild, channel?.id);
  if (!entryRaw) return;

  const entry = await resolveAuditActor(guild, {
    entry: entryRaw,
    type: entryRaw.action,
    maxAgeMs: 30_000,
    retries: 1,
    delayMs: 500,
    limit: 10,
  });

  const executorId = entry.executorId;
  if (!executorId || (await isBotActor(guild, executorId))) return;

  const actionType =
    entryRaw?.action === AuditLogEvent.WebhookCreate ? "Webhook Oluşturma" :
      entryRaw?.action === AuditLogEvent.WebhookDelete ? "Webhook Silme" :
        "Webhook Güncelleme";

  await sendModAction(
    guild,
    cfg,
    actionType,
    [
      `Kanal: ${channel?.id ? `<#${channel.id}>` : "Bilinmiyor"}`,
      `Webhook: \`${entryRaw?.target?.name || entryRaw?.target?.id || "Bilinmiyor"}\``,
      `Yapan: ${mentionUser(executorId)}`,
    ],
    { at: entry.at, executorId }
  );
}

function shouldSkipAuditFallbackEntry(entry) {
  const action = Number(entry?.action);
  if (!Number.isFinite(action)) return false;
  if (HANDLED_AUDIT_ACTIONS.has(action)) return true;

  if (action === AuditLogEvent.MemberUpdate) {
    if (auditHasTimeoutChange(entry)) return true;
    if (hasAuditChange(entry, ["nick"])) return true;
  }

  return false;
}

async function onGuildAuditLogEntryCreate(entry, guild, client) {
  if (!entry || !guild || !client?.db) return;
  const action = Number(entry?.action);
  const executorIdFromEntry = getAuditExecutorId(entry);
  const channelTargetId = getAuditChannelTargetId(entry);
  if (
    channelTargetId &&
    executorIdFromEntry &&
    CHANNEL_AUDIT_ACTIONS.has(action)
  ) {
    setRecentChannelAuditActor(
      guild.id,
      channelTargetId,
      executorIdFromEntry,
      Number(entry?.createdTimestamp || Date.now())
    );
  }

  if (isAutoModBlockAuditAction(action)) {
    if (isAuditFallbackDuplicate(guild.id, entry.id)) return;
    const cfg = await getConfig(client.db, guild.id);
    await onAutoModBlockAuditLogEntry(entry, guild, cfg);
    return;
  }

  if (shouldSkipAuditFallbackEntry(entry)) return;

  const executorId = executorIdFromEntry;
  if (executorId && (await isBotActor(guild, executorId))) return;
  if (isAuditFallbackDuplicate(guild.id, entry.id)) return;

  const cfg = await getConfig(client.db, guild.id);
  const actionName = humanizeAuditActionName(entry.action);
  const targetType = String(entry?.targetType || "").trim();
  const targetLabel = describeAuditTarget(entry, guild);
  const lines = [
    `Yapan: ${mentionUser(executorId)}`,
  ];

  if (targetType || targetLabel !== "Bilinmiyor") {
    lines.push(`Hedef${targetType ? ` (${targetType})` : ""}: ${targetLabel}`);
  }

  const reason = String(entry?.reason || "").trim();
  if (reason) {
    lines.push(`Neden: **${trimContent(reason, 400)}**`);
  }

  const extraLines = describeAuditExtraLines(entry);
  if (extraLines.length) {
    lines.push(...extraLines);
  }

  const changeLines = describeAuditChanges(entry, 10);
  if (changeLines.length) {
    lines.push("Detaylar:");
    lines.push(...changeLines.map((x) => `- ${x}`));
  }

  await sendModAction(guild, cfg, actionName, lines, {
    at: Number(entry?.createdTimestamp || Date.now()),
    executorId,
  });
}

function init() {}

module.exports = {
  init,
  getConfig,
  setConfig,
  getMuteRoleId,
  setMuteRoleId,
  sendTicketPayload,
  markMessageDeleteReason,
  markMessageDeleteReasons,
  sendOrUpdatePanel,
  handleInteraction,
  onReady,
  onGuildCreate,
  onInviteCreate,
  onInviteDelete,
  onEmojiCreate,
  onEmojiDelete,
  onEmojiUpdate,
  onStickerCreate,
  onStickerDelete,
  onStickerUpdate,
  onUserUpdate,
  onGuildMemberAdd,
  onGuildMemberRemove,
  onGuildMemberUpdate,
  onProtectionTimeout,
  onVoiceStateUpdate,
  onMessageUpdate,
  onMessageDelete,
  onMessageDeleteBulk,
  onGuildBanAdd,
  onGuildBanRemove,
  onLevelUp,
  onChannelCreate,
  onChannelDelete,
  onChannelUpdate,
  onRoleCreate,
  onRoleDelete,
  onRoleUpdate,
  onGuildUpdate,
  onWebhookUpdate,
  onGuildAuditLogEntryCreate,
  __private: {
    getGuildBanTotal,
    resolveGuildBanTotal,
    shiftGuildBanTotal,
    logsConfigCache,
    LOG_CFG_CACHE_TTL_MS,
  },
};



