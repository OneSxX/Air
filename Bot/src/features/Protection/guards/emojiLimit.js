/**
 * Emoji sayımı:
 * - Custom emoji: <:name:id> veya <a:name:id>
 * - Unicode emoji: \p{Extended_Pictographic}
 *
 * Not: Regex unicode property için Node 16+ iyi çalışır.
 */
function countCustomEmojis(content) {
  if (!content) return 0;
  const m = content.match(/<a?:\w+:\d+>/g);
  return m ? m.length : 0;
}

function countUnicodeEmojis(content) {
  if (!content) return 0;
  try {
    const m = content.match(/\p{Extended_Pictographic}/gu);
    return m ? m.length : 0;
  } catch {
    // Çok eski node fallback: unicode sayımı yapma
    return 0;
  }
}

function countEmojis(content) {
  return countCustomEmojis(content) + countUnicodeEmojis(content);
}

/**
 * @param {string} content
 * @param {number} max
 */
function isEmojiLimitViolation(content, max = 6) {
  if (!content) return false;
  const limit = Number.isFinite(max) ? max : 6;
  return countEmojis(content) > limit;
}

module.exports = {
  countEmojis,
  countCustomEmojis,
  countUnicodeEmojis,
  isEmojiLimitViolation,
};