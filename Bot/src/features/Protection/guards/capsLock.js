function countLetters(str) {
  const letters = str.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g);
  return letters ? letters.length : 0;
}

function countUpper(str) {
  const upper = str.match(/[A-ZÇĞİÖŞÜ]/g);
  return upper ? upper.length : 0;
}

/**
 * @param {string} content
 * @param {object} opts
 * @param {number} opts.minLetters - minimum harf sayısı (kısa mesajlar es geç)
 * @param {number} opts.ratio - büyük harf oranı eşiği (0.0 - 1.0)
 */
function isCapsLockViolation(content, opts = {}) {
  const minLetters = Number.isFinite(opts.minLetters) ? opts.minLetters : 10;
  const ratio = Number.isFinite(opts.ratio) ? opts.ratio : 0.7;

  if (!content) return false;
  const letters = countLetters(content);
  if (letters < minLetters) return false;

  const upper = countUpper(content);
  return upper / letters >= ratio;
}

module.exports = { isCapsLockViolation };