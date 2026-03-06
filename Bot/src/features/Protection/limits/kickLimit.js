const { AuditLogEvent } = require("discord.js");
const {
  fetchLatestAuditEntry,
  isWhitelisted,
  getGuildMember,
  punishMember,
  sendLog,
} = require("../utils/audit");

async function onGuildMemberRemove(member, db, limiter) {
  const guild = member?.guild;
  if (!guild) return;

  const gid = guild.id;
  const cfg = (await db.get(`prot_cfg_${gid}`)) || { toggles: {}, limits: {} };
  if (!cfg?.toggles?.kick) return;

  // audit log: MemberKick
  const entry = await fetchLatestAuditEntry(guild, AuditLogEvent.MemberKick);
  const executorId = entry?.executor?.id;
  const targetId = entry?.target?.id;

  // Bu remove olayı kick değilse çık
  if (!executorId || !targetId) return;
  if (targetId !== member.id) return;
  const meId = guild.members?.me?.id || guild.client?.user?.id;
  if (executorId === meId) return;

  const executorMember = await getGuildMember(guild, executorId);
  if (isWhitelisted(cfg, executorId, executorMember, guild)) return;
  if (cfg?.limits?.kick?.exemptUsers?.includes?.(executorId)) return;

  const ruleRaw = cfg?.limits?.kick;
  const rule =
    typeof ruleRaw === "number"
      ? { limit: ruleRaw, windowMs: 60_000 }
      : (ruleRaw || { limit: 2, windowMs: 60_000 });

  const res = limiter.push({
    guildId: gid,
    userId: executorId,
    action: "kick",
    windowMs: rule.windowMs,
    limit: rule.limit,
  });

  await sendLog(
    cfg,
    guild,
    `🥾 Kick atıldı: **${member.user.tag}** | Yapan: <@${executorId}> | ${res.count}/${res.limit} (${Math.round(res.windowMs / 1000)}s)`
  );

  if (!res.exceeded) return;

  const mode = cfg?.punish?.mode || "ban";
  await punishMember(guild, executorId, mode, "Protection: Kick Limiti aşıldı");

  await sendLog(
    cfg,
    guild,
    `🚨 **Kick Limiti Aşıldı!**\nYapan: <@${executorId}> cezalandırıldı (**${mode}**)`
  );
}

module.exports = { onGuildMemberRemove };
