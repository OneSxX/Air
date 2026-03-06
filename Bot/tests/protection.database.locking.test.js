const test = require("node:test");
const assert = require("node:assert/strict");

const protectionDb = require("../src/features/Protection/database");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createSlowDb(initial = {}) {
  const store = new Map(Object.entries(initial).map(([k, v]) => [String(k), clone(v)]));

  return {
    async get(key) {
      await sleep(4);
      return clone(store.get(String(key)));
    },
    async set(key, value) {
      await sleep(4);
      store.set(String(key), clone(value));
      return value;
    },
    _store: store,
  };
}

test("setConfig keeps concurrent patches without losing previous writes", async () => {
  const gid = "843294857203948572";
  const key = `prot_cfg_${gid}`;
  const db = createSlowDb();

  await Promise.all([
    protectionDb.setConfig(db, gid, { toggles: { caps: false } }, { updatedBy: "user_a" }),
    protectionDb.setConfig(db, gid, { toggles: { links: false } }, { updatedBy: "user_b" }),
  ]);

  const saved = db._store.get(key);
  assert.equal(saved?.toggles?.caps, false);
  assert.equal(saved?.toggles?.links, false);

  const loaded = await protectionDb.getConfig(db, gid);
  assert.equal(loaded.toggles.caps, false);
  assert.equal(loaded.toggles.links, false);
});
