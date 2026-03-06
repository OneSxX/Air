/**
 * Mention sayımı:
 * - Kullanıcı: <@123> / <@!123>
 * - Rol: <@&123>
 * - Kanal: <#123>
 */
function countMentions(content) {
  if (!content) return 0;

  const user = content.match(/<@!?\d+>/g) || [];
  const role = content.match(/<@&\d+>/g) || [];
  const channel = content.match(/<#\d+>/g) || [];

  return user.length + role.length + channel.length;
}

/**
 * @param {string} content
 * @param {number} max
 */
function isMentionLimitViolation(content, max = 5) {
  const limit = Number.isFinite(max) ? max : 5;
  return countMentions(content) > limit;
}

module.exports = { countMentions, isMentionLimitViolation };