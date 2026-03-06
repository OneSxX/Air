const test = require("node:test");
const assert = require("node:assert/strict");

const Level = require("../src/features/Level");

test("getAllRows deduplicates ids and reads user rows in parallel batches", async () => {
  let activeGets = 0;
  let maxActiveGets = 0;

  const db = {
    async get(key) {
      const k = String(key);
      if (k === "lvl_users_g1") {
        return ["u1", "u2", "u1", "", null];
      }
      if (k === "lvl_user_g1_u1" || k === "lvl_user_g1_u2") {
        activeGets += 1;
        maxActiveGets = Math.max(maxActiveGets, activeGets);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeGets -= 1;
        return {
          level: 1,
          xp: 1,
          totalXp: 1,
          messages: 1,
          stats: {},
        };
      }
      return null;
    },
  };

  const rows = await Level.__private.getAllRows(db, "g1");
  assert.equal(rows.length, 2);
  assert.equal(maxActiveGets > 1, true);
});
