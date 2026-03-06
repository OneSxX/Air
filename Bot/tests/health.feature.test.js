const test = require("node:test");
const assert = require("node:assert/strict");

const health = require("../src/features/Health");

test("parseEnabledFlag handles common boolean values", () => {
  const { parseEnabledFlag } = health.__private;
  assert.equal(parseEnabledFlag("1", false), true);
  assert.equal(parseEnabledFlag("true", false), true);
  assert.equal(parseEnabledFlag("off", true), false);
  assert.equal(parseEnabledFlag("", false), false);
  assert.equal(parseEnabledFlag("", true), true);
});

test("normalizePort enforces valid range", () => {
  const { normalizePort } = health.__private;
  assert.equal(normalizePort("8080", 3000), 8080);
  assert.equal(normalizePort("0", 3000), 3000);
  assert.equal(normalizePort("70000", 3000), 3000);
  assert.equal(normalizePort("abc", 3000), 3000);
});

test("checkReady returns healthy payload when discord and db are ready", async () => {
  const { checkReady } = health.__private;
  const client = {
    isReady: () => true,
    db: {
      get: async () => null,
    },
  };

  const status = await checkReady(client);
  assert.equal(status.ok, true);
  assert.equal(status.discordReady, true);
  assert.equal(status.dbOk, true);
  assert.equal(Number.isFinite(status.dbLatencyMs), true);
});

test("checkReady reports db not ready when db adapter is missing", async () => {
  const { checkReady } = health.__private;
  const client = {
    isReady: () => true,
  };

  const status = await checkReady(client);
  assert.equal(status.ok, false);
  assert.equal(status.discordReady, true);
  assert.equal(status.dbOk, false);
});

test("checkReady reports db not ready when db ping throws", async () => {
  const { checkReady } = health.__private;
  const client = {
    isReady: () => true,
    db: {
      get: async () => {
        throw new Error("db down");
      },
    },
  };

  const status = await checkReady(client);
  assert.equal(status.ok, false);
  assert.equal(status.discordReady, true);
  assert.equal(status.dbOk, false);
});
