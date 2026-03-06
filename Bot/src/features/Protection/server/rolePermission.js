const { AuditLogEvent, PermissionsBitField } = require("discord.js");
const {
  fetchLatestAuditEntry,
  isWhitelisted,
  getGuildMember,
  punishMember,
  sendLog,
} = require("../utils/audit");

// tehlikeli gördüklerimiz
const DANGEROUS = [
  PermissionsBitField.Flags.Administrator,
  PermissionsBitField.Flags.ManageGuild,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.BanMembers,
  PermissionsBitField.Flags.KickMembers,
  PermissionsBitField.Flags.ManageWebhooks,
];

function hasDangerousPerm(bitfield) {
  const perms = new PermissionsBitField(bitfield);
  return DANGEROUS.some((p) => perms.has(p));
}

async function onRoleUpdate(oldRole, newRole, db) {
  if (!newRole?.guild) return;

  const guild = newRole.guild;
  const gid = guild.id;

  const cfg = (await db.get(`prot_cfg_${gid}`)) || { toggles: {} };
  if (!cfg?.toggles?.roleperm) return;

  // permission değişmediyse çık
  if (oldRole.permissions.bitfield === newRole.permissions.bitfield) return;

  const becameDangerous =
    !hasDangerousPerm(oldRole.permissions.bitfield) &&
    hasDangerousPerm(newRole.permissions.bitfield);

  if (!becameDangerous) return;

  // Audit: ROLE_UPDATE
  const entry = await fetchLatestAuditEntry(guild, AuditLogEvent.RoleUpdate);
  const executorId = entry?.executor?.id;
  if (!executorId) return;
  const meId = guild.members?.me?.id || guild.client?.user?.id;
  if (executorId === meId) return;

  const executorMember = executorId ? await getGuildMember(guild, executorId) : null;

  if (executorId && isWhitelisted(cfg, executorId, executorMember, guild)) {
    await sendLog(cfg, guild, `🛡️ Rol izni değişti (whitelist): <@${executorId}> → ${newRole.name}`);
    return;
  }

  // Rolü eski haline döndür
  await newRole
    .setPermissions(oldRole.permissions, "Protection: Role izin verme koruması")
    .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

  // Executor cezası
  const mode = cfg?.punish?.mode || "none";
  if (executorId && mode !== "none") {
    await punishMember(guild, executorId, mode, "Protection: Rol izni verme");
  }

  await sendLog(
    cfg,
    guild,
    `🛡️ **Role İzin Verme Koruması**\nRol: **${newRole.name}**\nTehlikeli izin eklendi ve geri alındı.\nYapan: ${executorId ? `<@${executorId}>` : "Bilinmiyor"}`
  );
}

module.exports = { onRoleUpdate };
