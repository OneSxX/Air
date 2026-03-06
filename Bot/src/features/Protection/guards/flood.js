/**
 * Flood: aynı kullanıcının kısa sürede çok mesaj atması
 * Bu guard state ister (map).
 *
 * Kullanım:
 * const tracker = createFloodTracker({ windowMs: 7000, maxMessages: 5 });
 * const res = tracker.push(userId);
 * if (res.violation) ...
 */
function createFloodTracker(opts = {}) {
  const windowMs = Number.isFinite(opts.windowMs) ? opts.windowMs : 7000;
  const maxMessages = Number.isFinite(opts.maxMessages) ? opts.maxMessages : 5;

  // userId -> timestamps[]
  const map = new Map();

  function push(userId) {
    const now = Date.now();
    const arr = map.get(userId) || [];
    arr.push(now);

    // Pencere disindaki timestamp'leri ucuzca at.
    while (arr.length && now - arr[0] > windowMs) arr.shift();
    map.set(userId, arr);

    return {
      count: arr.length,
      violation: arr.length > maxMessages,
      windowMs,
      maxMessages,
    };
  }

  function reset(userId) {
    map.delete(userId);
  }

  function clear() {
    map.clear();
  }

  return { push, reset, clear };
}

module.exports = { createFloodTracker };
