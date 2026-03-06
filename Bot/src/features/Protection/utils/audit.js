const { AuditLogEvent } = require("discord.js");

async function fetchLatestAuditEntry(guild, type, maxAgeMs = 8000) {
  if (!guild?.fetchAuditLogs) return null;

  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 5 });
    const entry = logs.entries.first();
    if (!entry) return null;

    const now = Date.now();
    const created = entry.createdTimestamp || 0;
    if (now - created > maxAgeMs) return null;

    return entry;
  } catch {
    return null;
  }
}

function isWhitelisted(cfg, executorId, member, guild = null) {
  const wlUsers = cfg?.whitelist?.users || [];
  const wlRoles = cfg?.whitelist?.roles || [];
  const refGuild = guild || member?.guild || null;
  const meId = refGuild?.members?.me?.id || refGuild?.client?.user?.id || null;

  if (refGuild?.ownerId && executorId === refGuild.ownerId) return true;

  if (meId && executorId === meId) return true;

  if (wlUsers.includes(executorId)) return true;

  // executor member roles whitelist
  if (member?.roles?.cache && wlRoles.length) {
    return member.roles.cache.some((r) => wlRoles.includes(r.id));
  }

  return false;
}

async function getGuildMember(guild, userId, opts = {}) {
  if (!guild || !userId) return null;
  const memberId = String(userId || "").trim();
  if (!memberId) return null;

  if (opts.preferFetch !== true) {
    const cached = guild.members?.cache?.get?.(memberId);
    if (cached) return cached;
  }
  if (opts.allowFetch === false) return null;

  return guild.members.fetch(memberId).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
}

async function punishMember(guild, userId, mode, reason) {
  if (!guild || !userId) return false;
  const ownerId = guild.ownerId || null;
  const meId = guild.members?.me?.id || guild.client?.user?.id || null;
  if (ownerId && userId === ownerId) return false;
  if (meId && userId === meId) return false;

  const m = await getGuildMember(guild, userId);
  if (!m) return false;

  try {
    if (mode === "ban") {
      await m.ban({ reason: reason || "Protection" });
      return true;
    }
    if (mode === "kick") {
      await m.kick(reason || "Protection");
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function sendLog(cfg, guild, content) {
  const chId = cfg?.logChannelId;
  if (!chId) return;

  const ch =
    guild.channels?.cache?.get?.(chId) ||
    await (guild.channels.fetch(chId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!ch || !ch.isTextBased?.()) return;

  await (ch.send({ content }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
}

module.exports = {
  fetchLatestAuditEntry,
  isWhitelisted,
  getGuildMember,
  punishMember,
  sendLog,
};
