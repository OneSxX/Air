function createRateLimiter() {
  // key: `${guildId}:${userId}:${action}` -> timestamps[]
  const map = new Map();

  function push({ guildId, userId, action, windowMs, limit }) {
    const now = Date.now();
    const key = `${guildId}:${userId}:${action}`;

    const arr = map.get(key) || [];
    const filtered = arr.filter((t) => now - t <= windowMs);
    filtered.push(now);
    map.set(key, filtered);

    return {
      count: filtered.length,
      limit,
      windowMs,
      exceeded: filtered.length > limit,
    };
  }

  function reset(guildId, userId, action) {
    map.delete(`${guildId}:${userId}:${action}`);
  }

  function clear() {
    map.clear();
  }

  return { push, reset, clear };
}

module.exports = { createRateLimiter };