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
  caps_lock: "1475443523812720652",
  tehlikeli_bot_ekleme: "1475444899498299445",
  spam_koruma: "1475444359435653152",
  kufur_engel: "1477221125397286997",
  role_izin_koruma: "1475445183905661070",
  rol_verme_koruma: "1475445406518480937",
  link_engeli: "1475445951194861588",
  invite_engel: "1477261644026482688",
  flood_koruma: "1475444112445669387",
  everyone_limit: "1475444630559527084",
  etiket_limit: "1475443555442102335",
  emoji_limit: "1475447614400106617",
  rol_silme_limit: "1475451760171552818",
  rol_olusturma_limit: "1475455916269895701",
  ozel_url_bildirim: "1475443657644572712",
  kick_limit: "1475447654086606868",
  kanal_silme_limit: "1475452191870550056",
  kanal_olusturma_limit: "1475452404970553468",
  ban_limit: "1475447916574543942",
  toggle_kapali: "1470688093550936206",
  toggle_acik: "1470688071317061662",
  anti_raid: "1475453218136784987",
  webhook_koruma: "1475452826388922561",
  snapshot_koruma: "1475453017439604776",
  yetkikoruma_big: "1469631896232136755",
  sunucukoruma_big: "1469631867442692157",
  Sohbetkoruma_Big: "1469631805685633067",
};

function e(name, fallback = "") {
  const id = APP_EMOJI[name];
  if (!id) return fallback;
  return `<:${name}:${id}>`;
}

function withEmoji(label, value, emojiName, description) {
  const out = { label, value };
  if (description) out.description = description;

  const id = APP_EMOJI[emojiName];
  if (id) out.emoji = { id, name: emojiName };

  return out;
}

const onOff = (on) => (on ? e("toggle_acik", "ON") : e("toggle_kapali", "OFF"));
const line = (iconName, text, on) => `- ${e(iconName)} **${text}:** ${onOff(on)}`;

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
        line("caps_lock", "Caps Lock Koruma", !!t.caps),
        line("link_engeli", "Link Koruma", !!t.links),
        line("invite_engel", "Invite Engeli", !!t.invite),
        line("kufur_engel", "Küfür Engeli", !!t.profanity),
        line("emoji_limit", "Emoji Koruma", !!t.emoji),
        line("etiket_limit", "Etiket Koruma", !!t.mentions),
        line("flood_koruma", "Flood Koruma", !!t.flood),
        line("spam_koruma", "Spam Koruma", !!t.spam),
        line("everyone_limit", "Everyone Koruma", !!t.everyone),
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
        line("tehlikeli_bot_ekleme", "Tehlikeli Bot Ekleme Koruma", !!t.bot),
        line("rol_verme_koruma", "Rol Verme Koruma", !!t.rolegive),
        line("ozel_url_bildirim", "Özel URL Bildirimi", !!t.vanity),
        line("anti_raid", "Raid Koruma", !!t.antiRaid),
        line("webhook_koruma", "Webhook Koruma", !!t.webhook),
        line("snapshot_koruma", "Snapshot Koruma", !!t.snapshot),
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
        line("kanal_silme_limit", "Kanal Silme Sınırı Koruma", !!t.chDel),
        line("kanal_olusturma_limit", "Kanal Oluşturma Sınırı Koruma", !!t.chCreate),
        line("rol_silme_limit", "Rol Silme Sınırı Koruma", !!t.roleDel),
        line("rol_olusturma_limit", "Rol Oluşturma Sınırı Koruma", !!t.roleCreate),
        line("ban_limit", "Ban Sınırı Koruma", !!t.ban),
        line("kick_limit", "Kick Sınırı Koruma", !!t.kick),
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

function chatRows() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("prot:ui:chat")
    .setPlaceholder("Sohbet Korumaları")
    .addOptions(
      withEmoji("Caps Aç/Kapat", "tg:caps", "caps_lock", "Kapalıyken ayar modalı açar, açıkken kapatma ister."),
      withEmoji("Link Aç/Kapat", "tg:links", "link_engeli", "Kapalıyken ayar modalı açar, açıkken kapatma ister."),
      withEmoji("Invite Engeli", "tg:invite", "invite_engel", "Kapalıyken ayar modalı açar, açıkken kapatma ister."),
      withEmoji("Küfür Engeli", "tg:profanity", "kufur_engel", "Kapalıyken ayar modalı açar, açıkken kapatma ister."),
      withEmoji("Emoji Aç/Kapat", "tg:emoji", "emoji_limit", "Kapalıyken ayar modalı açar, açıkken kapatma ister."),
      withEmoji("Etiket Aç/Kapat", "tg:mentions", "etiket_limit", "Kapalıyken ayar modalı açar, açıkken kapatma ister."),
      withEmoji("Flood Koruma", "tg:flood", "flood_koruma", "Kapalıyken ayar modalı açar, açıkken kapatma ister."),
      withEmoji("Spam Koruma", "tg:spam", "spam_koruma", "Kapalıyken ayar modalı açar, açıkken kapatma ister."),
      withEmoji("Everyone Aç/Kapat", "tg:everyone", "everyone_limit", "Kapalıyken ayar modalı açar, açıkken kapatma ister.")
    );

  return [new ActionRowBuilder().addComponents(menu)];
}

function serverRows() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("prot:ui:server")
    .setPlaceholder("Sunucu Korumaları")
    .addOptions(
      withEmoji("Tehlikeli Bot Ekleme Koruma Aç/Kapat", "tg:bot", "tehlikeli_bot_ekleme", "Şüpheli bot eklenmelerine karşı korur."),
      withEmoji("Rol Verme Koruma Aç/Kapat", "tg:rolegive", "rol_verme_koruma", "Yetkili rol dağıtımını denetler."),
      withEmoji("Özel URL Bildirimi Aç/Kapat", "tg:vanity", "ozel_url_bildirim", "Vanity URL değişimlerini bildirir."),
      withEmoji("Raid Koruma", "tg:antiRaid", "anti_raid", "Kapalıyken ayar modalı açar, açıkken kapatma ister."),
      withEmoji("Webhook Koruma Aç/Kapat", "tg:webhook", "webhook_koruma", "İzinsiz webhook işlemlerini denetler."),
      withEmoji("Snapshot Koruma Aç/Kapat", "tg:snapshot", "snapshot_koruma", "İzin değişikliklerini geri yükler.")
    );

  return [new ActionRowBuilder().addComponents(menu)];
}

function limitsRows() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("prot:ui:limits")
    .setPlaceholder("Yetki Limitleri")
    .addOptions(
      withEmoji("Kanal Silme Sınırı Koruma", "tg:chDel", "kanal_silme_limit", "Kapalıyken limit modalı açar, açıkken kapatma ister."),
      withEmoji("Kanal Oluşturma Sınırı Koruma", "tg:chCreate", "kanal_olusturma_limit", "Kapalıyken limit modalı açar, açıkken kapatma ister."),
      withEmoji("Rol Silme Sınırı Koruma", "tg:roleDel", "rol_silme_limit", "Kapalıyken limit modalı açar, açıkken kapatma ister."),
      withEmoji("Rol Oluşturma Sınırı Koruma", "tg:roleCreate", "rol_olusturma_limit", "Kapalıyken limit modalı açar, açıkken kapatma ister."),
      withEmoji("Ban Sınırı Koruma", "tg:ban", "ban_limit", "Kapalıyken limit modalı açar, açıkken kapatma ister."),
      withEmoji("Kick Sınırı Koruma", "tg:kick", "kick_limit", "Kapalıyken limit modalı açar, açıkken kapatma ister.")
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
    chat: { embeds: [chatEmbed(cfg, opts)], components: chatRows() },
    server: { embeds: [serverEmbed(cfg, opts)], components: serverRows() },
    limits: { embeds: [limitsEmbed(cfg, opts)], components: limitsRows() },
  };
}

function renderCombinedPanel(cfg, opts = {}) {
  const limits = limitsRows();
  return {
    embeds: [
      chatEmbed(cfg, opts),
      serverEmbed(cfg, opts),
      limitsEmbed(cfg, { ...opts, singleMessage: true }),
    ],
    components: [
      ...chatRows(),
      ...serverRows(),
      limits[0],
      limits[1],
    ],
  };
}

module.exports = { renderPanels, renderCombinedPanel };
