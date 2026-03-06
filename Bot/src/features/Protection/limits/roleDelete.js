const { AuditLogEvent } = require("discord.js");
const {
  fetchLatestAuditEntry,
  isWhitelisted,
  getGuildMember,
  punishMember,
  sendLog,
} = require("../utils/audit");

async function onRoleDelete(role, db, limiter) {
  const guild = role?.guild;
  if (!guild) return;

  const gid = guild.id;
  const cfg = (await db.get(`prot_cfg_${gid}`)) || { toggles: {}, limits: {} };
  if (!cfg?.toggles?.roleDel) return;

  const entry = await fetchLatestAuditEntry(guild, AuditLogEvent.RoleDelete);
  const executorId = entry?.executor?.id;
  if (!executorId) return;
  const meId = guild.members?.me?.id || guild.client?.user?.id;
  if (executorId === meId) return;

  const executorMember = await getGuildMember(guild, executorId);
  if (isWhitelisted(cfg, executorId, executorMember, guild)) return;
  if (cfg?.limits?.roleDel?.exemptUsers?.includes?.(executorId)) return;

  const ruleRaw = cfg?.limits?.roleDel;
  const rule =
    typeof ruleRaw === "number"
      ? { limit: ruleRaw, windowMs: 60_000 }
      : (ruleRaw || { limit: 2, windowMs: 60_000 });

  const res = limiter.push({
    guildId: gid,
    userId: executorId,
    action: "roleDel",
    windowMs: rule.windowMs,
    limit: rule.limit,
  });

  await sendLog(
    cfg,
    guild,
    `🎭 Rol silindi: **${role.name}** | Yapan: <@${executorId}> | ${res.count}/${res.limit} (${Math.round(res.windowMs / 1000)}s)`
  );

  if (!res.exceeded) return;

  const mode = cfg?.punish?.mode || "kick";
  await punishMember(guild, executorId, mode, "Protection: Rol Silme Limiti aşıldı");

  await sendLog(
    cfg,
    guild,
    `🚨 **Rol Silme Limiti Aşıldı!**\nYapan: <@${executorId}> cezalandırıldı (**${mode}**)`
  );
}

module.exports = { onRoleDelete };
