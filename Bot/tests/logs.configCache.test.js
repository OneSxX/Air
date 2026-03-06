const test = require("node:test");
const assert = require("node:assert/strict");

const Logs = require("../src/features/Logs");

function createDb() {
  const store = new Map();
  let getCount = 0;
  let setCount = 0;

  return {
    async get(key) {
      getCount += 1;
      return store.get(key);
    },
    async set(key, value) {
      setCount += 1;
      store.set(key, value);
    },
    counts() {
      return { getCount, setCount };
    },
  };
}

test("logs getConfig reuses short-lived cache between calls", async () => {
  const db = createDb();
  const gid = `cache_test_${Date.now()}_a`;

  const first = await Logs.getConfig(db, gid);
  const second = await Logs.getConfig(db, gid);

  assert.equal(Boolean(first && second), true);
  assert.deepEqual(second.channels, first.channels);

  const { getCount, setCount } = db.counts();
  assert.equal(getCount, 1);
  assert.equal(setCount, 1);
});

test("logs setConfig refreshes cache for subsequent getConfig", async () => {
  const db = createDb();
  const gid = `cache_test_${Date.now()}_b`;

  await Logs.getConfig(db, gid);
  await Logs.setConfig(db, gid, { mode: "forum" });
  const before = db.counts().getCount;

  const cfg = await Logs.getConfig(db, gid);
  assert.equal(cfg.mode, "forum");
  assert.equal(db.counts().getCount, before);
});
