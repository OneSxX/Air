const test = require("node:test");
const assert = require("node:assert/strict");

const ReactionRole = require("../src/features/ReactionRole");

function createDb(seed = {}, delayMs = 0) {
  const map = new Map(Object.entries(seed));
  return {
    async get(key) {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return map.get(String(key));
    },
    async set(key, value) {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      map.set(String(key), value);
      return value;
    },
    _map: map,
  };
}

test("concurrent upsertTextTemplate keeps both updates", async () => {
  const db = createDb({}, 5);
  const guildId = "100000000000000001";

  await Promise.all([
    ReactionRole.upsertTextTemplate(db, guildId, {
      name: "alpha",
      message: "alpha text",
      roleId: "200000000000000001",
      emoji: "✅",
      updatedBy: "300000000000000001",
    }),
    ReactionRole.upsertTextTemplate(db, guildId, {
      name: "beta",
      message: "beta text",
      roleId: "200000000000000002",
      emoji: "🔥",
      updatedBy: "300000000000000001",
    }),
  ]);

  const templates = await ReactionRole.getTemplates(db, guildId);
  assert.ok(templates.alpha, "alpha template should exist");
  assert.ok(templates.beta, "beta template should exist");
});

test("upsertTextTemplate surfaces db write errors", async () => {
  const db = {
    async get() {
      return {};
    },
    async set() {
      throw new Error("db_set_failed");
    },
  };

  await assert.rejects(
    () => ReactionRole.upsertTextTemplate(db, "100000000000000003", {
      name: "alpha",
      message: "alpha text",
      roleId: "200000000000000001",
      emoji: "✅",
      updatedBy: "300000000000000001",
    }),
    /db_set_failed/
  );
});
