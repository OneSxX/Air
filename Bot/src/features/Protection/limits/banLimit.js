const { AuditLogEvent } = require("discord.js");
const {
  fetchLatestAuditEntry,
  isWhitelisted,
  getGuildMember,
  punishMember,
  sendLog,
} = require("../utils/audit");

async function onGuildBanAdd(ban, db, limiter) {
  const guild = ban?.guild;
  if (!guild) return;

  const gid = guild.id;
  const cfg = (await db.get(`prot_cfg_${gid}`)) || { toggles: {}, limits: {} };
  if (!cfg?.toggles?.ban) return;

  const entry = await fetchLatestAuditEntry(guild, AuditLogEvent.MemberBanAdd);
  const executorId = entry?.executor?.id;
  if (!executorId) return;
  const meId = guild.members?.me?.id || guild.client?.user?.id;
  if (executorId === meId) return;

  const executorMember = await getGuildMember(guild, executorId);
  if (isWhitelisted(cfg, executorId, executorMember, guild)) return;
  if (cfg?.limits?.ban?.exemptUsers?.includes?.(executorId)) return;

  const ruleRaw = cfg?.limits?.ban;
  const rule =
    typeof ruleRaw === "number"
      ? { limit: ruleRaw, windowMs: 60_000 }
      : (ruleRaw || { limit: 2, windowMs: 60_000 });

  const res = limiter.push({
    guildId: gid,
    userId: executorId,
    action: "ban",
    windowMs: rule.windowMs,
    limit: rule.limit,
  });

  await sendLog(
    cfg,
    guild,
    `🔨 Ban atıldı: **${ban.user?.tag || ban.user?.id}** | Yapan: <@${executorId}> | ${res.count}/${res.limit} (${Math.round(res.windowMs / 1000)}s)`
  );

  if (!res.exceeded) return;

  const mode = cfg?.punish?.mode || "ban";
  await punishMember(guild, executorId, mode, "Protection: Ban Limiti aşıldı");

  await sendLog(
    cfg,
    guild,
    `🚨 **Ban Limiti Aşıldı!**\nYapan: <@${executorId}> cezalandırıldı (**${mode}**)`
  );
}

module.exports = { onGuildBanAdd };
