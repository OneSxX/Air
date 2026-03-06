const { AuditLogEvent } = require("discord.js");
const {
  fetchLatestAuditEntry,
  isWhitelisted,
  getGuildMember,
  punishMember,
  sendLog,
} = require("../utils/audit");

const DEFAULT = { limit: 2, windowMs: 60_000 };

async function onChannelDelete(channel, db, limiter) {
  const guild = channel?.guild;
  if (!guild) return;

  const gid = guild.id;
  const cfg = (await db.get(`prot_cfg_${gid}`)) || { toggles: {}, limits: {} };
  if (!cfg?.toggles?.chDel) return;

  const entry = await fetchLatestAuditEntry(guild, AuditLogEvent.ChannelDelete);
  const executorId = entry?.executor?.id;
  if (!executorId) return;
  const meId = guild.members?.me?.id || guild.client?.user?.id;
  if (executorId === meId) return;

  const executorMember = await getGuildMember(guild, executorId);
  if (isWhitelisted(cfg, executorId, executorMember, guild)) return;
  if (cfg?.limits?.chDel?.exemptUsers?.includes?.(executorId)) return;

  // ✅ SUNUCUYA ÖZEL limit + süre
  const ruleRaw = cfg?.limits?.chDel;
  const rule =
    typeof ruleRaw === "number"
      ? { limit: ruleRaw, windowMs: DEFAULT.windowMs }
      : (ruleRaw || DEFAULT);

  const res = limiter.push({
    guildId: gid,
    userId: executorId,
    action: "chDel",
    windowMs: rule.windowMs,
    limit: rule.limit,
  });

  await sendLog(
    cfg,
    guild,
    `🗑️ Kanal silindi: **${channel.name}** | Yapan: <@${executorId}> | ${res.count}/${res.limit} (${Math.round(res.windowMs / 1000)}s)`
  );

  if (!res.exceeded) return;

  const mode = cfg?.punish?.mode || "kick";
  await punishMember(guild, executorId, mode, "Protection: Kanal Silme Limiti aşıldı");

  await sendLog(
    cfg,
    guild,
    `🚨 **Kanal Silme Limiti Aşıldı!**\nYapan: <@${executorId}> cezalandırıldı (**${mode}**)`
  );
}

module.exports = { onChannelDelete };
