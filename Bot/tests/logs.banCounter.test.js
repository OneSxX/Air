const test = require("node:test");
const assert = require("node:assert/strict");

const Logs = require("../src/features/Logs");

const {
  getGuildBanTotal,
  resolveGuildBanTotal,
  shiftGuildBanTotal,
} = Logs.__private;

function createDb(initial = {}) {
  const store = new Map(Object.entries(initial));
  const setCalls = [];

  return {
    async get(key) {
      return store.get(String(key));
    },
    async set(key, value) {
      const k = String(key);
      setCalls.push([k, value]);
      store.set(k, value);
      return value;
    },
    _store: store,
    _setCalls: setCalls,
  };
}

function createGuildWithBanSize(guildId, size) {
  return {
    id: String(guildId),
    bans: {
      fetch: async () => ({ size }),
    },
  };
}

function createGuildWithBanFetchFailure(guildId) {
  return {
    id: String(guildId),
    bans: {
      fetch: async () => {
        throw new Error("ban fetch failed");
      },
    },
  };
}

test("getGuildBanTotal returns 0 for empty or invalid stored values", async () => {
  const guildId = "100000000000000001";
  const key = `logs_ban_total_${guildId}`;

  const dbEmpty = createDb();
  assert.equal(await getGuildBanTotal(dbEmpty, guildId), 0);

  const dbInvalid = createDb({ [key]: "abc" });
  assert.equal(await getGuildBanTotal(dbInvalid, guildId), 0);

  const dbNegative = createDb({ [key]: -5 });
  assert.equal(await getGuildBanTotal(dbNegative, guildId), 0);
});

test("resolveGuildBanTotal prefers fetched guild ban size and persists it", async () => {
  const guildId = "100000000000000002";
  const key = `logs_ban_total_${guildId}`;
  const db = createDb({ [key]: 2 });
  const guild = createGuildWithBanSize(guildId, 7);

  const resolved = await resolveGuildBanTotal(guild, db, {
    storedCount: 2,
    fallbackCount: 3,
  });

  assert.equal(resolved, 7);
  assert.equal(db._store.get(key), 7);
  assert.deepEqual(db._setCalls[0], [key, 7]);
});

test("resolveGuildBanTotal falls back when guild ban fetch fails", async () => {
  const guildId = "100000000000000003";
  const key = `logs_ban_total_${guildId}`;
  const db = createDb({ [key]: 1 });
  const guild = createGuildWithBanFetchFailure(guildId);

  const resolved = await resolveGuildBanTotal(guild, db, {
    storedCount: 1,
    fallbackCount: 4,
  });

  assert.equal(resolved, 4);
  assert.equal(db._store.get(key), 4);
  assert.deepEqual(db._setCalls[0], [key, 4]);
});

test("shiftGuildBanTotal increments atomically under concurrent updates", async () => {
  const guildId = "100000000000000004";
  const key = `logs_ban_total_${guildId}`;
  const db = createDb({ [key]: 0 });
  const guild = createGuildWithBanFetchFailure(guildId);

  const values = await Promise.all(
    Array.from({ length: 5 }, () => shiftGuildBanTotal(guild, db, 1, { allowFetch: false }))
  );

  assert.deepEqual([...values].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  assert.equal(db._store.get(key), 5);
});

test("shiftGuildBanTotal never goes below zero", async () => {
  const guildId = "100000000000000005";
  const key = `logs_ban_total_${guildId}`;
  const db = createDb({ [key]: 0 });
  const guild = createGuildWithBanFetchFailure(guildId);

  const value = await shiftGuildBanTotal(guild, db, -1, { allowFetch: false });
  assert.equal(value, 0);
  assert.equal(db._store.get(key), 0);
});
