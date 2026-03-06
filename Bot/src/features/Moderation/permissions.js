const { PermissionFlagsBits } = require("discord.js");

function hasModeratorPriority(guild, moderatorMember, targetMember) {
  if (!guild || !moderatorMember || !targetMember) return false;
  if (moderatorMember.id === guild.ownerId) return true;
  return moderatorMember.roles.highest.comparePositionTo(targetMember.roles.highest) > 0;
}

function hasBotPriority(guild, botMember, targetMember) {
  if (!guild || !botMember || !targetMember) return false;
  if (targetMember.id === guild.ownerId) return false;
  return botMember.roles.highest.comparePositionTo(targetMember.roles.highest) > 0;
}

function canModerateTarget(guild, moderatorMember, targetMember) {
  if (!targetMember) return { ok: true };
  if (!moderatorMember) return { ok: false, reason: "Yetkili uye bilgisi alinamadi." };
  if (targetMember.id === guild?.ownerId) return { ok: false, reason: "Sunucu sahibine islem uygulanamaz." };
  if (!hasModeratorPriority(guild, moderatorMember, targetMember)) {
    return { ok: false, reason: "Rol hiyerarsisi nedeniyle bu uyeye islem uygulayamazsin." };
  }
  return { ok: true };
}

function canBotAffectTarget(guild, botMember, targetMember, action) {
  if (!botMember) return { ok: false, reason: "Bot uye bilgisi alinamadi." };

  const perms = botMember.permissions;
  if (action === "timeout" && !perms?.has?.(PermissionFlagsBits.ModerateMembers)) {
    return { ok: false, reason: "Botta Timeout Members yetkisi yok." };
  }
  if (action === "kick" && !perms?.has?.(PermissionFlagsBits.KickMembers)) {
    return { ok: false, reason: "Botta Kick Members yetkisi yok." };
  }
  if (action === "ban" && !perms?.has?.(PermissionFlagsBits.BanMembers)) {
    return { ok: false, reason: "Botta Ban Members yetkisi yok." };
  }

  if (!targetMember) {
    if (action === "ban") return { ok: true };
    return { ok: false, reason: "Hedef uye sunucuda bulunamadi." };
  }
  if (!hasBotPriority(guild, botMember, targetMember)) {
    return { ok: false, reason: "Bot rol hiyerarsisi hedef uyeye yetmiyor." };
  }

  if (action === "timeout" && !targetMember.moderatable) {
    return { ok: false, reason: "Bot bu uyeye timeout uygulayamiyor." };
  }
  if (action === "kick" && !targetMember.kickable) {
    return { ok: false, reason: "Bot bu uyeyi kickleyemiyor." };
  }
  if (action === "ban" && !targetMember.bannable) {
    return { ok: false, reason: "Bot bu uyeyi banlayamiyor." };
  }

  return { ok: true };
}

module.exports = {
  canModerateTarget,
  canBotAffectTarget,
};
