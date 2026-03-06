const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");

const RR_TEMPLATES_KEY = (gid) => `reaction_role_templates_${gid}`;
const RR_ACTIVE_KEY = (gid) => `reaction_role_active_${gid}`;
const guildWriteLocks = new Map();

const DEFAULT_EMOJI = "\u2705";
const MAX_TEMPLATE_NAME = 64;
const MAX_TEXT_MESSAGE = 1900;
const MAX_EMBED_TITLE = 256;
const MAX_EMBED_DESCRIPTION = 3500;
const MAX_EMBED_FOOTER = 512;
const MAX_IMAGE_URL = 1500;

function withGuildWriteLock(guildId, task) {
  const key = String(guildId || "").trim();
  const prev = guildWriteLocks.get(key) || Promise.resolve();

  const next = prev
    .catch((err) => { globalThis.__airWarnSuppressedError?.(err); })
    .then(task)
    .finally(() => {
      if (guildWriteLocks.get(key) === next) {
        guildWriteLocks.delete(key);
      }
    });

  guildWriteLocks.set(key, next);
  return next;
}

function normalizeName(input) {
  return String(input || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0131/g, "i")
    .replace(/\s+/g, " ")
    .slice(0, MAX_TEMPLATE_NAME);
}

function cleanText(input, limit) {
  return String(input || "").trim().slice(0, limit);
}

function normalizeImageUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (/^(sil|kaldir|remove|none)$/i.test(raw)) return null;
  if (!/^https?:\/\/\S+/i.test(raw)) return null;
  return raw.slice(0, MAX_IMAGE_URL);
}

function normalizeEmojiKey(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const customMatch = raw.match(/^<a?:\w+:(\d{15,25})>$/);
  if (customMatch?.[1]) {
    return {
      key: customMatch[1],
      reactValue: customMatch[1],
      display: raw,
    };
  }

  const customIdOnly = raw.match(/^(\d{15,25})$/);
  if (customIdOnly?.[1]) {
    return {
      key: customIdOnly[1],
      reactValue: customIdOnly[1],
      display: `<:emoji:${customIdOnly[1]}>`,
    };
  }

  return {
    key: raw,
    reactValue: raw,
    display: raw,
  };
}

function normalizeTemplate(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const kind = src.kind === "embed" ? "embed" : "text";
  const name = normalizeName(src.name);
  const roleId = /^\d{15,25}$/.test(String(src.roleId || "").trim())
    ? String(src.roleId).trim()
    : null;

  const emoji = normalizeEmojiKey(src.emoji || DEFAULT_EMOJI);
  if (!name || !roleId || !emoji) return null;

  const base = {
    kind,
    name,
    roleId,
    emojiKey: emoji.key,
    emojiReact: emoji.reactValue,
    emojiDisplay: emoji.display,
    updatedAt: Number(src.updatedAt || Date.now()),
    updatedBy: src.updatedBy ? String(src.updatedBy) : null,
  };

  if (kind === "embed") {
    const embedName = cleanText(src.embedName || src.name, MAX_TEMPLATE_NAME);
    const title = cleanText(src.title, MAX_EMBED_TITLE);
    const description = cleanText(src.description, MAX_EMBED_DESCRIPTION);
    const footer = cleanText(src.footer, MAX_EMBED_FOOTER);
    return {
      ...base,
      embedName: embedName || name,
      title,
      description,
      footer,
      smallImageUrl: normalizeImageUrl(src.smallImageUrl),
      largeImageUrl: normalizeImageUrl(src.largeImageUrl),
    };
  }

  return {
    ...base,
    message: cleanText(src.message, MAX_TEXT_MESSAGE),
  };
}

function normalizeTemplatesMap(raw) {
  const out = {};
  const entries = raw && typeof raw === "object" ? Object.entries(raw) : [];
  for (const [key, value] of entries) {
    const normalizedKey = normalizeName(key);
    if (!normalizedKey) continue;
    const template = normalizeTemplate({ ...(value || {}), name: normalizedKey });
    if (!template) continue;
    out[normalizedKey] = template;
  }
  return out;
}

function normalizeActiveMap(raw) {
  const out = {};
  const entries = raw && typeof raw === "object" ? Object.entries(raw) : [];
  for (const [messageId, value] of entries) {
    if (!/^\d{15,25}$/.test(String(messageId || "").trim())) continue;
    const row = value && typeof value === "object" ? value : null;
    if (!row) continue;

    const roleId = /^\d{15,25}$/.test(String(row.roleId || "").trim()) ? String(row.roleId).trim() : null;
    const channelId = /^\d{15,25}$/.test(String(row.channelId || "").trim()) ? String(row.channelId).trim() : null;
    const emoji = normalizeEmojiKey(row.emojiKey || row.emojiReact || row.emoji || DEFAULT_EMOJI);
    const templateName = normalizeName(row.templateName || row.name || "");
    if (!roleId || !channelId || !emoji || !templateName) continue;

    out[String(messageId)] = {
      messageId: String(messageId),
      channelId,
      roleId,
      templateName,
      emojiKey: emoji.key,
      emojiReact: emoji.reactValue,
      updatedAt: Number(row.updatedAt || Date.now()),
    };
  }
  return out;
}

async function getTemplates(db, guildId) {
  const raw = await db.get(RR_TEMPLATES_KEY(guildId));
  const normalized = normalizeTemplatesMap(raw);
  if (!raw || JSON.stringify(raw) !== JSON.stringify(normalized)) {
    await db.set(RR_TEMPLATES_KEY(guildId), normalized);
  }
  return normalized;
}

async function setTemplates(db, guildId, templates) {
  const normalized = normalizeTemplatesMap(templates);
  await db.set(RR_TEMPLATES_KEY(guildId), normalized);
  return normalized;
}

async function getActive(db, guildId) {
  const raw = await db.get(RR_ACTIVE_KEY(guildId));
  const normalized = normalizeActiveMap(raw);
  if (!raw || JSON.stringify(raw) !== JSON.stringify(normalized)) {
    await db.set(RR_ACTIVE_KEY(guildId), normalized);
  }
  return normalized;
}

async function setActive(db, guildId, activeMap) {
  const normalized = normalizeActiveMap(activeMap);
  await db.set(RR_ACTIVE_KEY(guildId), normalized);
  return normalized;
}

async function upsertTextTemplate(db, guildId, payload) {
  const name = normalizeName(payload?.name);
  if (!name) throw new Error("Template ismi gecersiz.");

  const template = normalizeTemplate({
    kind: "text",
    name,
    message: payload?.message,
    roleId: payload?.roleId,
    emoji: payload?.emoji || DEFAULT_EMOJI,
    updatedBy: payload?.updatedBy,
    updatedAt: Date.now(),
  });
  if (!template?.message) throw new Error("Mesaj bos olamaz.");

  return withGuildWriteLock(guildId, async () => {
    const templates = await getTemplates(db, guildId);
    templates[name] = template;
    await setTemplates(db, guildId, templates);
    return template;
  });
}

async function upsertEmbedTemplate(db, guildId, payload) {
  const name = normalizeName(payload?.name);
  if (!name) throw new Error("Embed ismi gecersiz.");

  const template = normalizeTemplate({
    kind: "embed",
    name,
    embedName: payload?.embedName || payload?.name,
    title: payload?.title,
    description: payload?.description,
    footer: payload?.footer,
    roleId: payload?.roleId,
    emoji: payload?.emoji || DEFAULT_EMOJI,
    smallImageUrl: payload?.smallImageUrl,
    largeImageUrl: payload?.largeImageUrl,
    updatedBy: payload?.updatedBy,
    updatedAt: Date.now(),
  });
  if (!template?.title || !template?.description) {
    throw new Error("Embed baslik ve mesaj bos olamaz.");
  }

  return withGuildWriteLock(guildId, async () => {
    const templates = await getTemplates(db, guildId);
    templates[name] = template;
    await setTemplates(db, guildId, templates);
    return template;
  });
}

async function updateEmbedImages(db, guildId, payload) {
  const name = normalizeName(payload?.name);
  if (!name) throw new Error("Embed ismi gecersiz.");

  return withGuildWriteLock(guildId, async () => {
    const templates = await getTemplates(db, guildId);
    const current = templates[name];
    if (!current || current.kind !== "embed") throw new Error("Embed tepki kaydi bulunamadi.");

    const patch = {};
    if ("smallImageUrl" in (payload || {})) patch.smallImageUrl = normalizeImageUrl(payload.smallImageUrl);
    if ("largeImageUrl" in (payload || {})) patch.largeImageUrl = normalizeImageUrl(payload.largeImageUrl);

    const next = normalizeTemplate({
      ...current,
      ...patch,
      updatedAt: Date.now(),
      updatedBy: payload?.updatedBy || current.updatedBy,
    });
    templates[name] = next;
    await setTemplates(db, guildId, templates);
    return next;
  });
}

async function deleteTemplate(db, guildId, nameInput) {
  const name = normalizeName(nameInput);
  if (!name) return { removedTemplate: false, removedActiveCount: 0 };

  return withGuildWriteLock(guildId, async () => {
    const templates = await getTemplates(db, guildId);
    const existed = Boolean(templates[name]);
    if (existed) delete templates[name];
    await setTemplates(db, guildId, templates);

    const active = await getActive(db, guildId);
    let removedActiveCount = 0;
    for (const [messageId, row] of Object.entries(active)) {
      if (row.templateName !== name) continue;
      delete active[messageId];
      removedActiveCount += 1;
    }
    await setActive(db, guildId, active);
    return { removedTemplate: existed, removedActiveCount };
  });
}

async function getTemplate(db, guildId, nameInput) {
  const name = normalizeName(nameInput);
  if (!name) return null;
  const templates = await getTemplates(db, guildId);
  return templates[name] || null;
}

function buildEmbedFromTemplate(template, clientUser) {
  const embed = new EmbedBuilder()
    .setColor(0x000000)
    .setTitle(String(template.title || "Tepki Rol"))
    .setDescription(String(template.description || ""));

  if (clientUser) {
    const author = {
      name: clientUser.username || clientUser.tag || "Bot",
    };
    const icon = clientUser.displayAvatarURL?.({ forceStatic: false, size: 256 });
    if (icon) author.iconURL = icon;
    embed.setAuthor(author);
  }

  if (template.footer) {
    embed.setFooter({ text: template.footer });
  }
  if (template.smallImageUrl) {
    embed.setThumbnail(template.smallImageUrl);
  }
  if (template.largeImageUrl) {
    embed.setImage(template.largeImageUrl);
  }

  return embed;
}

function canBotManageRole(guild, role, clientUserId) {
  if (!guild || !role || !clientUserId) return false;
  const me = guild.members?.me || guild.members?.cache?.get?.(clientUserId);
  if (!me) return false;
  if (!me.permissions?.has?.(PermissionFlagsBits.ManageRoles)) return false;
  if (role.managed) return false;
  return role.position < me.roles.highest.position;
}

async function postTemplate(client, guildId, channelId, nameInput) {
  const db = client?.db;
  if (!db) throw new Error("Veritabani bulunamadi.");

  const template = await getTemplate(db, guildId, nameInput);
  if (!template) throw new Error("Tepki rol kaydi bulunamadi.");

  const guild =
    client.guilds?.cache?.get?.(guildId) ||
    await (client.guilds?.fetch?.(guildId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!guild) throw new Error("Sunucu bulunamadi.");

  const channel =
    guild.channels?.cache?.get?.(channelId) ||
    await (guild.channels?.fetch?.(channelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!channel?.isTextBased?.() || typeof channel.send !== "function") {
    throw new Error("Mesaj atilabilecek kanal bulunamadi.");
  }

  const role =
    guild.roles?.cache?.get?.(template.roleId) ||
    await (guild.roles?.fetch?.(template.roleId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!role) throw new Error("Tepki rol kaydindaki rol bulunamadi.");

  if (!canBotManageRole(guild, role, client?.user?.id)) {
    throw new Error("Bot bu rolu yonetemiyor. Rol sirasini veya yetkileri kontrol et.");
  }

  const payload = template.kind === "embed"
    ? { embeds: [buildEmbedFromTemplate(template, client.user)] }
    : { content: String(template.message || "") };

  const sent = await (channel.send(payload) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!sent?.id) throw new Error("Tepki rol mesaji gonderilemedi.");

  const reactOk = await sent.react(template.emojiReact).then(() => true).catch(() => false);
  if (!reactOk) {
    await (sent.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    throw new Error("Emojiye tepki eklenemedi. Emoji gecersiz veya botun emoji izni yok.");
  }

  await withGuildWriteLock(guildId, async () => {
    const active = await getActive(db, guildId);
    active[sent.id] = {
      messageId: sent.id,
      channelId: sent.channelId,
      roleId: template.roleId,
      templateName: template.name,
      emojiKey: template.emojiKey,
      emojiReact: template.emojiReact,
      updatedAt: Date.now(),
    };
    await setActive(db, guildId, active);
  });

  return {
    template,
    messageId: sent.id,
    channelId: sent.channelId,
    jumpUrl: sent.url,
  };
}

function emojiMatches(emojiData, targetKey) {
  if (!targetKey) return false;
  const key = String(targetKey || "").trim();
  if (!key) return false;

  if (emojiData?.id) {
    return String(emojiData.id) === key;
  }

  const name = String(emojiData?.name || "").trim();
  if (!name) return false;
  return name === key;
}

async function applyRoleFromReaction(reaction, user, client, shouldAdd) {
  if (!client?.db || !reaction?.message?.guildId || !reaction?.message?.id || !user?.id || user.bot) return;

  if (reaction.partial) {
    const fetched = await reaction.fetch().then(() => true).catch(() => false);
    if (!fetched) return;
  }
  if (reaction.message.partial) {
    const fetchedMessage = await reaction.message.fetch().then(() => true).catch(() => false);
    if (!fetchedMessage) return;
  }

  const guildId = reaction.message.guildId;
  const active = await getActive(client.db, guildId);
  const row = active[String(reaction.message.id)];
  if (!row) return;
  if (!emojiMatches(reaction.emoji, row.emojiKey)) return;

  const guild =
    reaction.message.guild ||
    client.guilds?.cache?.get?.(guildId) ||
    await (client.guilds?.fetch?.(guildId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!guild) return;

  const role =
    guild.roles?.cache?.get?.(row.roleId) ||
    await (guild.roles?.fetch?.(row.roleId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!role) return;
  if (!canBotManageRole(guild, role, client?.user?.id)) return;

  const member =
    guild.members?.cache?.get?.(user.id) ||
    await (guild.members?.fetch?.(user.id) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!member || member.user?.bot) return;

  if (shouldAdd) {
    if (member.roles?.cache?.has?.(role.id)) return;
    await (member.roles.add(role.id, "Tepki rol") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  } else {
    if (!member.roles?.cache?.has?.(role.id)) return;
    await (member.roles.remove(role.id, "Tepki rol kaldirma") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }
}

async function onReactionAdd(reaction, user, client) {
  return applyRoleFromReaction(reaction, user, client, true);
}

async function onReactionRemove(reaction, user, client) {
  return applyRoleFromReaction(reaction, user, client, false);
}

function init() {}

module.exports = {
  init,
  getTemplates,
  getTemplate,
  upsertTextTemplate,
  upsertEmbedTemplate,
  updateEmbedImages,
  deleteTemplate,
  postTemplate,
  onReactionAdd,
  onReactionRemove,
  __private: {
    normalizeName,
    normalizeEmojiKey,
    normalizeImageUrl,
    normalizeTemplate,
    normalizeTemplatesMap,
    normalizeActiveMap,
    emojiMatches,
    withGuildWriteLock,
  },
};
