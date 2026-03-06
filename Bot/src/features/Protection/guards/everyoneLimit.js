/**
 * @everyone / @here kontrolü
 * Varsayılan: 1 mesajda 1 kez bile geçiyorsa ihlal say.
 * İstersen "max" ile aynı mesaj içinde kaç kez geçtiğine göre sınır koyarız.
 */
function countEveryoneHere(content) {
  if (!content) return 0;
  const m = content.match(/@everyone|@here/g);
  return m ? m.length : 0;
}

function isEveryoneViolation(content, max = 0) {
  // max=0 => hiç geçmesin
  const limit = Number.isFinite(max) ? max : 0;
  return countEveryoneHere(content) > limit;
}

module.exports = { countEveryoneHere, isEveryoneViolation };