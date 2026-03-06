const { AuditLogEvent, PermissionFlagsBits } = require("discord.js");
const {
  isWhitelisted,
  getGuildMember,
  punishMember,
  sendLog,
} = require("../utils/audit");

function extractAddedRoleIdsFromAuditEntry(entry) {
  const changes = Array.isArray(entry?.changes) ? entry.changes : [];
  const out = [];

  for (const change of changes) {
    if (!change || change.key !== "$add") continue;
    const added = Array.isArray(change.new) ? change.new : [];
    for (const item of added) {
      const roleId = String(item?.id || "").trim();
      if (!/^\d{15,25}$/.test(roleId)) continue;
      if (out.includes(roleId)) continue;
      out.push(roleId);
    }
  }

  return out;
}

async function findRelevantRoleGiveEntry(guild, targetMemberId, addedRoleIdSet, maxAgeMs = 8000) {
  if (!guild?.fetchAuditLogs || !targetMemberId || !addedRoleIdSet?.size) return null;

  try {
    const logs = await guild.fetchAuditLogs({
      type: AuditLogEvent.MemberRoleUpdate,
      limit: 20,
    });
    const now = Date.now();

    for (const entry of logs?.entries?.values?.() || []) {
      const created = Number(entry?.createdTimestamp || 0);
      if (!created || now - created > maxAgeMs) continue;

      const targetId = String(entry?.target?.id || entry?.targetId || "").trim();
      if (!targetId || targetId !== String(targetMemberId)) continue;

      const auditAddedRoleIds = extractAddedRoleIdsFromAuditEntry(entry);
      if (!auditAddedRoleIds.length) continue;

      const overlaps = auditAddedRoleIds.some((roleId) => addedRoleIdSet.has(roleId));
      if (!overlaps) continue;

      return entry;
    }
  } catch {
    return null;
  }

  return null;
}

async function onGuildMemberUpdate(oldMember, newMember, db) {
  if (!newMember?.guild) return;

  const guild = newMember.guild;
  const gid = guild.id;

  const cfg = (await db.get(`prot_cfg_${gid}`)) || { toggles: {} };
  if (!cfg?.toggles?.rolegive) return;

  // Eklenen roller
  const oldSet = new Set(oldMember.roles.cache.map((r) => r.id));
  const added = newMember.roles.cache.filter((r) => !oldSet.has(r.id));
  if (!added.size) return;

  // Muted rol ataması bu koruma ile çakışmasın.
  let mutedRoleId = await (db.get(`logs_mute_role_${gid}`) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!mutedRoleId) {
    mutedRoleId =
      guild.roles.cache.find((r) => /^muted$/i.test(r.name || ""))?.id ||
      guild.roles.cache.find((r) => /mute/i.test(r.name || ""))?.id ||
      null;
  }
  const addedToRevert = mutedRoleId
    ? added.filter((r) => r.id !== mutedRoleId)
    : added;
  if (!addedToRevert.size) return;

  // Apply only when this specific member update is clearly tied to a manual role give action.
  const addedRoleIdSet = new Set(addedToRevert.map((r) => String(r.id || "").trim()).filter(Boolean));
  const entry = await findRelevantRoleGiveEntry(guild, newMember.id, addedRoleIdSet);
  const executorId = entry?.executor?.id;
  if (!executorId) return;
  if (entry?.executor?.bot) return;
  const meId = guild.members?.me?.id || guild.client?.user?.id;
  if (executorId === meId) return;

  const executorMember = executorId ? await getGuildMember(guild, executorId) : null;
  if (!executorMember?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) return;

  if (executorId && isWhitelisted(cfg, executorId, executorMember, guild)) {
    await sendLog(
      cfg,
      guild,
      `🎭 Rol verildi (whitelist): <@${executorId}> → <@${newMember.id}> (+${addedToRevert.size})`
    );
    return;
  }

  // Rolleri geri al
  await (newMember.roles.remove(addedToRevert, "Protection: Rol verme koruması") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

  // Executor cezası
  const mode = cfg?.punish?.mode || "none";
  if (executorId && mode !== "none") {
    await punishMember(guild, executorId, mode, "Protection: Rol verme");
  }

  const addedNames = addedToRevert.map((r) => r.name).slice(0, 10).join(", ");
  await sendLog(
    cfg,
    guild,
    `🛡️ **Rol Verme Koruması**\nHedef: <@${newMember.id}>\nEklenen roller geri alındı: **${addedNames}${addedToRevert.size > 10 ? "..." : ""}**\nYapan: ${executorId ? `<@${executorId}>` : "Bilinmiyor"}`
  );
}

module.exports = { onGuildMemberUpdate, extractAddedRoleIdsFromAuditEntry, findRelevantRoleGiveEntry };
