const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

const COLOR = 0x000000;

const CHAT_IMG = "https://i.imgur.com/w8eBoEc.png";
const SERVER_IMG = "https://i.imgur.com/RbF3MFF.png";
const LIMIT_IMG = "https://i.imgur.com/yxCwSSQ.png";

const APP_EMOJI = {
  caps_lock: "1479575753161965698",
  tehlikeli_bot_ekleme: "1479575968749453564",
  spam_koruma: "1479575871944921118",
  kufur_engel: "1479576528735047750",
  role_izin_koruma: "1479576004090532001",
  rol_verme_koruma: "1479576034436452352",
  link_engeli: "1479576128204177609",
  invite_engel: "1479576554764767272",
  flood_koruma: "1479575836540796980",
  everyone_limit: "1479575945550631003",
  etiket_limit: "1479575780898902108",
  emoji_limit: "1479576148559007824",
  rol_silme_limit: "1479576086063874160",
  rol_olusturma_limit: "1479576067504214096",
  ozel_url_bildirim: "1479575812721277627",
  kick_limit: "1479576180955811920",
  kanal_silme_limit: "1479576294374113362",
  kanal_olusturma_limit: "1479576274962874535",
  ban_limit: "1479576197821366485",
  toggle_kapali: "1479575724359811348",
  toggle_acik: "1479575688259309789",
  anti_raid: "1479576472070127716",
  webhook_koruma: "1479576410535497917",
  snapshot_koruma: "1479576445906063371",
  yetkikoruma_big: "1479575640653959260",
  sunucukoruma_big: "1479575615395991773",
  Sohbetkoruma_Big: "1479571981593608396",
};

const FALLBACK_ICON = {
  caps_lock: "🔠",
  tehlikeli_bot_ekleme: "🤖",
  spam_koruma: "🚫",
  kufur_engel: "🚫",
  role_izin_koruma: "🛡️",
  rol_verme_koruma: "🛡️",
  link_engeli: "🔗",
  invite_engel: "📨",
  flood_koruma: "🌊",
  everyone_limit: "📢",
  etiket_limit: "🏷️",
  emoji_limit: "😀",
  rol_silme_limit: "🧩",
  rol_olusturma_limit: "🧩",
  ozel_url_bildirim: "🔔",
  kick_limit: "🥾",
  kanal_silme_limit: "🗑️",
  kanal_olusturma_limit: "🧱",
  ban_limit: "⛔",
  toggle_kapali: "OFF",
  toggle_acik: "ON",
  anti_raid: "🚨",
  webhook_koruma: "🪝",
  snapshot_koruma: "📸",
  yetkikoruma_big: "🛡️",
  sunucukoruma_big: "🛡️",
  Sohbetkoruma_Big: "💬",
};

function findGuildEmoji(guild, name, id) {
  const cache = guild?.emojis?.cache;
  if (!cache) return null;

  if (id) {
    const byId = cache.get(id);
    if (byId) return byId;
  }

  const target = String(name || "").trim().toLowerCase();
  if (!target) return null;
  const exact = cache.find((emoji) => String(emoji?.name || "").trim().toLowerCase() === target);
  if (exact) return exact;

  const normalizedTarget = normalizeEmojiLookupName(target);
  if (!normalizedTarget) return null;

  return (
    cache.find(
      (emoji) =>
        normalizeEmojiLookupName(String(emoji?.name || "").trim().toLowerCase()) ===
        normalizedTarget
    ) || null
  );
}

function findClientEmoji(client, name, id) {
  const cache = client?.emojis?.cache;
  if (!cache) return null;

  if (id) {
    const byId = cache.get(id);
    if (byId) return byId;
  }

  const target = String(name || "").trim().toLowerCase();
  if (!target) return null;
  const exact = cache.find((emoji) => String(emoji?.name || "").trim().toLowerCase() === target);
  if (exact) return exact;

  const normalizedTarget = normalizeEmojiLookupName(target);
  if (!normalizedTarget) return null;
  return (
    cache.find(
      (emoji) =>
        normalizeEmojiLookupName(String(emoji?.name || "").trim().toLowerCase()) ===
        normalizedTarget
    ) || null
  );
}

function findLookupEmoji(lookup, name, id) {
  if (!lookup) return null;

  if (id) {
    const byId = lookup?.byId?.get?.(id);
    if (byId) return byId;
  }

  const target = String(name || "").trim().toLowerCase();
  if (!target) return null;
  const exact = lookup?.byName?.get?.(target);
  if (exact) return exact;

  const normalizedTarget = normalizeEmojiLookupName(target);
  if (!normalizedTarget) return null;
  return lookup?.byNormalizedName?.get?.(normalizedTarget) || null;
}

function resolveEmoji(opts, name, id) {
  const allowExternalEmoji = opts?.allowExternalEmoji !== false;
  return (
    findLookupEmoji(opts?.emojiLookup, name, id) ||
    findGuildEmoji(opts?.guild, name, id) ||
    (allowExternalEmoji ? findClientEmoji(opts?.guild?.client, name, id) : null) ||
    null
  );
}

function normalizeEmojiLookupName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeRawEmojiName(name) {
  const raw = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  if (!raw) return "air";
  if (raw.length < 2) return `${raw}x`;
  return raw.slice(0, 32);
}

function buildEmojiLookup(guild) {
  const byId = new Map();
  const byName = new Map();
  const byNormalizedName = new Map();

  const cache = guild?.emojis?.cache;
  if (!cache?.size) return { byId, byName, byNormalizedName };

  for (const emoji of cache.values()) {
    const id = String(emoji?.id || "").trim();
    const lowerName = String(emoji?.name || "").trim().toLowerCase();
    if (id && !byId.has(id)) byId.set(id, emoji);
    if (lowerName && !byName.has(lowerName)) byName.set(lowerName, emoji);

    const normalized = normalizeEmojiLookupName(lowerName);
    if (normalized && !byNormalizedName.has(normalized)) {
      byNormalizedName.set(normalized, emoji);
    }
  }

  return { byId, byName, byNormalizedName };
}

function e(name, fallback = "", opts = {}) {
  const id = APP_EMOJI[name];
  const resolved = resolveEmoji({ ...opts, allowExternalEmoji: true }, name, id);

  if (resolved) {
    const safeName = String(resolved.name || name).trim() || name;
    return resolved.animated
      ? `<a:${safeName}:${resolved.id}>`
      : `<:${safeName}:${resolved.id}>`;
  }

  if (id) {
    return `<:${normalizeRawEmojiName(name)}:${id}>`;
  }
  return fallback || FALLBACK_ICON[name] || "";
}

function canUseOptionEmoji(emojiName, opts = {}) {
  if (opts?.disableOptionEmoji) return false;
  const id = APP_EMOJI[emojiName];
  const resolved = resolveEmoji({ ...opts, allowExternalEmoji: true }, emojiName, id);
  if (!resolved?.id) return false;

  return true;
}

function withEmoji(label, value, emojiName, description, opts = {}) {
  const out = { label, value };
  if (description) out.description = description;

  if (canUseOptionEmoji(emojiName, opts)) {
    const id = APP_EMOJI[emojiName];
    const guildEmoji = resolveEmoji(opts, emojiName, id);
    if (guildEmoji?.id) {
      out.emoji = { id: guildEmoji.id, name: guildEmoji.name || emojiName };
    }
  }

  return out;
}

const onOff = (on, opts = {}) => (on ? e("toggle_acik", "ON", opts) : e("toggle_kapali", "OFF", opts));
const line = (iconName, text, on, opts = {}) =>
  `- ${e(iconName, FALLBACK_ICON[iconName] || "", opts)} **${text}:** ${onOff(on, opts)}`;

function getActorLabel(opts = {}) {
  const actor = opts?.actor || null;
  if (!actor) return "";

  const tag = String(actor?.tag || "").trim();
  if (tag && !tag.endsWith("#0")) return tag;

  const globalName = String(actor?.globalName || "").trim();
  if (globalName) return globalName;

  const username = String(actor?.username || "").trim();
  if (username) return username;

  const id = String(actor?.id || "").trim();
  if (id) return id;

  return "";
}

function withActorFooter(baseText, opts = {}) {
  const actorLabel = getActorLabel(opts);
  if (!actorLabel) return baseText;
  return `${baseText} | Son kullanan: ${actorLabel}`;
}

function chatEmbed(cfg, opts = {}) {
  const t = cfg?.toggles || {};

  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`${e("Sohbetkoruma_Big")} Sohbet Korumaları`)
    .setThumbnail(CHAT_IMG)
    .setDescription(
      [
        line("caps_lock", "Caps Lock Koruma", !!t.caps, opts),
        line("link_engeli", "Link Koruma", !!t.links, opts),
        line("invite_engel", "Invite Engeli", !!t.invite, opts),
        line("kufur_engel", "Küfür Engeli", !!t.profanity, opts),
        line("emoji_limit", "Emoji Koruma", !!t.emoji, opts),
        line("etiket_limit", "Etiket Koruma", !!t.mentions, opts),
        line("flood_koruma", "Flood Koruma", !!t.flood, opts),
        line("spam_koruma", "Spam Koruma", !!t.spam, opts),
        line("everyone_limit", "Everyone Koruma", !!t.everyone, opts),
      ].join("\n")
    )
    .setFooter({ text: withActorFooter("Panel: sohbet", opts) });
}

function serverEmbed(cfg, opts = {}) {
  const t = cfg?.toggles || {};

  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`${e("sunucukoruma_big")} Sunucu Korumaları`)
    .setThumbnail(SERVER_IMG)
    .setDescription(
      [
        line("tehlikeli_bot_ekleme", "Tehlikeli Bot Ekleme Koruma", !!t.bot, opts),
        line("rol_verme_koruma", "Rol Verme Koruma", !!t.rolegive, opts),
        line("ozel_url_bildirim", "Özel URL Bildirimi", !!t.vanity, opts),
        line("anti_raid", "Raid Koruma", !!t.antiRaid, opts),
        line("webhook_koruma", "Webhook Koruma", !!t.webhook, opts),
        line("snapshot_koruma", "Snapshot Koruma", !!t.snapshot, opts),
      ].join("\n")
    )
    .setFooter({ text: withActorFooter("Panel: sunucu", opts) });
}

function limitsEmbed(cfg, opts = {}) {
  const singleMessage = opts?.singleMessage === true;
  const t = cfg?.toggles || {};
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`${e("yetkikoruma_big")} Yetki Limitleri`)
    .setThumbnail(LIMIT_IMG)
    .setDescription(
      [
        line("kanal_silme_limit", "Kanal Silme Sınırı Koruma", !!t.chDel, opts),
        line("kanal_olusturma_limit", "Kanal Oluşturma Sınırı Koruma", !!t.chCreate, opts),
        line("rol_silme_limit", "Rol Silme Sınırı Koruma", !!t.roleDel, opts),
        line("rol_olusturma_limit", "Rol Oluşturma Sınırı Koruma", !!t.roleCreate, opts),
        line("ban_limit", "Ban Sınırı Koruma", !!t.ban, opts),
        line("kick_limit", "Kick Sınırı Koruma", !!t.kick, opts),
      ].join("\n")
    );

  if (singleMessage) {
    embed.setFooter({
      text: withActorFooter("Panel: tek mesaj - her ayarda kendini günceller.", opts),
    });
  } else {
    embed.setFooter({
      text: withActorFooter("Panel: 3 mesaj - her ayarda kendini günceller.", opts),
    });
  }

  return embed;
}

function chatRows(opts = {}) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("prot:ui:chat")
    .setPlaceholder("Sohbet Korumaları")
    .addOptions(
      withEmoji("Caps Aç/Kapat", "tg:caps", "caps_lock", "Kapalıyken ayar modalı açar, açıkken kapatma ister.", opts),
      withEmoji("Link Aç/Kapat", "tg:links", "link_engeli", "Kapalıyken ayar modalı açar, açıkken kapatma ister.", opts),
      withEmoji("Invite Engeli", "tg:invite", "invite_engel", "Kapalıyken ayar modalı açar, açıkken kapatma ister.", opts),
      withEmoji("Küfür Engeli", "tg:profanity", "kufur_engel", "Kapalıyken ayar modalı açar, açıkken kapatma ister.", opts),
      withEmoji("Emoji Aç/Kapat", "tg:emoji", "emoji_limit", "Kapalıyken ayar modalı açar, açıkken kapatma ister.", opts),
      withEmoji("Etiket Aç/Kapat", "tg:mentions", "etiket_limit", "Kapalıyken ayar modalı açar, açıkken kapatma ister.", opts),
      withEmoji("Flood Koruma", "tg:flood", "flood_koruma", "Kapalıyken ayar modalı açar, açıkken kapatma ister.", opts),
      withEmoji("Spam Koruma", "tg:spam", "spam_koruma", "Kapalıyken ayar modalı açar, açıkken kapatma ister.", opts),
      withEmoji("Everyone Aç/Kapat", "tg:everyone", "everyone_limit", "Kapalıyken ayar modalı açar, açıkken kapatma ister.", opts)
    );

  return [new ActionRowBuilder().addComponents(menu)];
}

function serverRows(opts = {}) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("prot:ui:server")
    .setPlaceholder("Sunucu Korumaları")
    .addOptions(
      withEmoji("Tehlikeli Bot Ekleme Koruma Aç/Kapat", "tg:bot", "tehlikeli_bot_ekleme", "Şüpheli bot eklenmelerine karşı korur.", opts),
      withEmoji("Rol Verme Koruma Aç/Kapat", "tg:rolegive", "rol_verme_koruma", "Yetkili rol dağıtımını denetler.", opts),
      withEmoji("Özel URL Bildirimi Aç/Kapat", "tg:vanity", "ozel_url_bildirim", "Vanity URL değişimlerini bildirir.", opts),
      withEmoji("Raid Koruma", "tg:antiRaid", "anti_raid", "Kapalıyken ayar modalı açar, açıkken kapatma ister.", opts),
      withEmoji("Webhook Koruma Aç/Kapat", "tg:webhook", "webhook_koruma", "İzinsiz webhook işlemlerini denetler.", opts),
      withEmoji("Snapshot Koruma Aç/Kapat", "tg:snapshot", "snapshot_koruma", "İzin değişikliklerini geri yükler.", opts)
    );

  return [new ActionRowBuilder().addComponents(menu)];
}

function limitsRows(opts = {}) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("prot:ui:limits")
    .setPlaceholder("Yetki Limitleri")
    .addOptions(
      withEmoji("Kanal Silme Sınırı Koruma", "tg:chDel", "kanal_silme_limit", "Kapalıyken limit modalı açar, açıkken kapatma ister.", opts),
      withEmoji("Kanal Oluşturma Sınırı Koruma", "tg:chCreate", "kanal_olusturma_limit", "Kapalıyken limit modalı açar, açıkken kapatma ister.", opts),
      withEmoji("Rol Silme Sınırı Koruma", "tg:roleDel", "rol_silme_limit", "Kapalıyken limit modalı açar, açıkken kapatma ister.", opts),
      withEmoji("Rol Oluşturma Sınırı Koruma", "tg:roleCreate", "rol_olusturma_limit", "Kapalıyken limit modalı açar, açıkken kapatma ister.", opts),
      withEmoji("Ban Sınırı Koruma", "tg:ban", "ban_limit", "Kapalıyken limit modalı açar, açıkken kapatma ister.", opts),
      withEmoji("Kick Sınırı Koruma", "tg:kick", "kick_limit", "Kapalıyken limit modalı açar, açıkken kapatma ister.", opts)
    );

  const allBtn = new ButtonBuilder()
    .setCustomId("prot:all:setup")
    .setLabel("Tüm Korumaları Kur")
    .setStyle(ButtonStyle.Secondary);

  const allOffBtn = new ButtonBuilder()
    .setCustomId("prot:all:disable")
    .setLabel("Tüm Korumaları Kapat")
    .setStyle(ButtonStyle.Danger);

  return [
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(allBtn, allOffBtn),
  ];
}

function renderPanels(cfg, opts = {}) {
  return {
    chat: { embeds: [chatEmbed(cfg, opts)], components: chatRows(opts) },
    server: { embeds: [serverEmbed(cfg, opts)], components: serverRows(opts) },
    limits: { embeds: [limitsEmbed(cfg, opts)], components: limitsRows(opts) },
  };
}

function renderCombinedPanel(cfg, opts = {}) {
  const limits = limitsRows(opts);
  return {
    embeds: [
      chatEmbed(cfg, opts),
      serverEmbed(cfg, opts),
      limitsEmbed(cfg, { ...opts, singleMessage: true }),
    ],
    components: [
      ...chatRows(opts),
      ...serverRows(opts),
      limits[0],
      limits[1],
    ],
  };
}

module.exports = { renderPanels, renderCombinedPanel, buildEmojiLookup };
