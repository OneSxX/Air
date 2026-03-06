const { AuditLogEvent } = require("discord.js");
const {
  fetchLatestAuditEntry,
  isWhitelisted,
  getGuildMember,
  punishMember,
  sendLog,
} = require("../utils/audit");

async function onChannelCreate(channel, db, limiter) {
  const guild = channel?.guild;
  if (!guild) return;

  const gid = guild.id;
  const cfg = (await db.get(`prot_cfg_${gid}`)) || { toggles: {}, limits: {} };
  if (!cfg?.toggles?.chCreate) return;

  const entry = await fetchLatestAuditEntry(guild, AuditLogEvent.ChannelCreate);
  const executorId = entry?.executor?.id;
  if (!executorId) return;
  const meId = guild.members?.me?.id || guild.client?.user?.id;
  if (executorId === meId) return;

  const executorMember = await getGuildMember(guild, executorId);
  if (isWhitelisted(cfg, executorId, executorMember, guild)) return;
  if (cfg?.limits?.chCreate?.exemptUsers?.includes?.(executorId)) return;

  const ruleRaw = cfg?.limits?.chCreate;
  const rule =
    typeof ruleRaw === "number"
      ? { limit: ruleRaw, windowMs: 60_000 }
      : (ruleRaw || { limit: 3, windowMs: 60_000 });

  const res = limiter.push({
    guildId: gid,
    userId: executorId,
    action: "chCreate",
    windowMs: rule.windowMs,
    limit: rule.limit,
  });

  await sendLog(
    cfg,
    guild,
    `➕ Kanal oluşturuldu: **${channel.name}** | Yapan: <@${executorId}> | ${res.count}/${res.limit} (${Math.round(res.windowMs / 1000)}s)`
  );

  if (!res.exceeded) return;

  // Aşınca oluşturulan kanalı silebiliriz (opsiyonel)
  await (channel.delete("Protection: Kanal Oluşturma Limiti aşıldı") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

  const mode = cfg?.punish?.mode || "kick";
  await punishMember(guild, executorId, mode, "Protection: Kanal Oluşturma Limiti aşıldı");

  await sendLog(
    cfg,
    guild,
    `🚨 **Kanal Oluşturma Limiti Aşıldı!**\nYapan: <@${executorId}> cezalandırıldı (**${mode}**)`
  );
}

module.exports = { onChannelCreate };
