const test = require("node:test");
const assert = require("node:assert/strict");

const slashsync = require("../src/commands/slashsync");

const {
  normalizeScope,
  resolveRequestedScope,
  resolveSyncAccess,
  validateSyncRequest,
  safeDbGet,
  safeDbSet,
  safeDbDelete,
} = slashsync.__private;

function interactionFor(userId, guildOwnerId) {
  return {
    user: { id: String(userId) },
    guild: { ownerId: String(guildOwnerId) },
  };
}

test("normalizeScope falls back to global for invalid values", () => {
  assert.equal(normalizeScope("guild"), "guild");
  assert.equal(normalizeScope("both"), "both");
  assert.equal(normalizeScope("clear_guild"), "clear_guild");
  assert.equal(normalizeScope("unknown"), "global");
});

test("resolveRequestedScope defaults to guild for guild owner when scope missing", () => {
  const out = resolveRequestedScope("", {
    allowed: true,
    isBotOwner: false,
    isGuildOwner: true,
  });

  assert.deepEqual(out, {
    scope: "guild",
    scopeProvided: false,
    autoSelected: true,
  });
});

test("resolveRequestedScope keeps global default for bot owner when scope missing", () => {
  const out = resolveRequestedScope("", {
    allowed: true,
    isBotOwner: true,
    isGuildOwner: false,
  });

  assert.deepEqual(out, {
    scope: "global",
    scopeProvided: false,
    autoSelected: false,
  });
});

test("resolveSyncAccess grants full access to bot owner", () => {
  const interaction = interactionFor("100000000000000001", "100000000000000002");
  const client = { config: { ownerId: "100000000000000001" } };
  const access = resolveSyncAccess(interaction, client);

  assert.equal(access.allowed, true);
  assert.equal(access.isBotOwner, true);
  assert.equal(access.isGuildOwner, false);
});

test("resolveSyncAccess grants limited access to guild owner", () => {
  const interaction = interactionFor("100000000000000002", "100000000000000002");
  const client = { config: { ownerId: "100000000000000001" } };
  const access = resolveSyncAccess(interaction, client);

  assert.equal(access.allowed, true);
  assert.equal(access.isBotOwner, false);
  assert.equal(access.isGuildOwner, true);
});

test("validateSyncRequest blocks global and force for guild owner", () => {
  const guildOwnerAccess = {
    allowed: true,
    isBotOwner: false,
    isGuildOwner: true,
  };

  assert.equal(
    validateSyncRequest("global", false, guildOwnerAccess),
    "Sunucu sahibi sadece `scope:guild` veya `scope:clear_guild` kullanabilir."
  );
  assert.equal(
    validateSyncRequest("guild", true, guildOwnerAccess),
    "Sunucu sahibi `force` kullanamaz. `force` sadece bot sahibine acik."
  );
  assert.equal(validateSyncRequest("guild", false, guildOwnerAccess), null);
  assert.equal(validateSyncRequest("clear_guild", false, guildOwnerAccess), null);
});

test("safeDb helpers no-op when db adapter is missing", async () => {
  const client = {};

  assert.equal(await safeDbGet(client, "x", "x"), null);
  assert.equal(await safeDbSet(client, "x", "1", "x"), false);
  assert.equal(await safeDbDelete(client, "x", "x"), false);
});

test("safeDb helpers handle db adapter errors", async () => {
  const client = {
    db: {
      async get() { throw new Error("get fail"); },
      async set() { throw new Error("set fail"); },
      async delete() { throw new Error("delete fail"); },
    },
  };

  const prevWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await safeDbGet(client, "x", "x"), null);
    assert.equal(await safeDbSet(client, "x", "1", "x"), false);
    assert.equal(await safeDbDelete(client, "x", "x"), false);
  } finally {
    console.warn = prevWarn;
  }
});
