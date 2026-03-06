const { AuditLogEvent } = require("discord.js");
const {
  fetchLatestAuditEntry,
  isWhitelisted,
  getGuildMember,
  punishMember,
  sendLog,
} = require("../utils/audit");

async function onGuildMemberAdd(member, db) {
  if (!member?.guild) return;
  if (!member.user?.bot) return; // sadece bot eklemeyi izle

  const guild = member.guild;
  const gid = guild.id;

  const cfg = (await db.get(`prot_cfg_${gid}`)) || { toggles: {} };
  if (!cfg?.toggles?.bot) return;

  // Audit: BOT_ADD
  const entry = await fetchLatestAuditEntry(guild, AuditLogEvent.BotAdd);
  const executorId = entry?.executor?.id;
  if (!executorId) return;
  const meId = guild.members?.me?.id || guild.client?.user?.id;
  if (executorId === meId) return;

  // executor bulunamadıysa sadece logla
  const executorMember = executorId ? await getGuildMember(guild, executorId) : null;

  // whitelist bypass
  if (executorId && isWhitelisted(cfg, executorId, executorMember, guild)) {
    await sendLog(cfg, guild, `🤖 Bot eklendi (whitelist): <@${executorId}> → ${member.user.tag}`);
    return;
  }

  // Aksiyon: yeni botu at (kick)
  await (member.kick("Protection: Tehlikeli bot ekleme koruması") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

  // Executor cezası (opsiyonel)
  const mode = cfg?.punish?.mode || "none";
  if (executorId && mode !== "none") {
    await punishMember(guild, executorId, mode, "Protection: Tehlikeli bot ekleme");
  }

  await sendLog(
    cfg,
    guild,
    `🛡️ **Tehlikeli Bot Koruması**\nBot eklendi: **${member.user.tag}** (çıkarıldı)\nEkleyen: ${executorId ? `<@${executorId}>` : "Bilinmiyor"}`
  );
}

module.exports = { onGuildMemberAdd };
