const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const MARKETYONET_PATH = path.resolve(__dirname, "../src/commands/marketyonet.js");
const MARKET_PATH = path.resolve(__dirname, "../src/commands/market.js");

const TEPKI_PATH = path.resolve(__dirname, "../src/commands/tepki.js");
const TEPKIROL_PATH = path.resolve(__dirname, "../src/commands/tepkirol.js");

function mockModule(modulePath, exportsValue) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: exportsValue,
  };
}

function clearModule(modulePath) {
  delete require.cache[modulePath];
}

function createInteraction({ guild = true, admin = false, manageGuild = false, manageRoles = false } = {}) {
  const replyCalls = [];
  const interaction = {
    guildId: guild ? "100000000000000001" : null,
    guild: guild ? { ownerId: "100000000000000099" } : null,
    user: { id: "100000000000000010" },
    deferred: false,
    replied: false,
    memberPermissions: {
      has(flag) {
        const bit = String(flag);
        if (bit === "8") return admin; // Administrator
        if (bit === "32") return manageGuild; // ManageGuild
        if (bit === "268435456") return manageRoles; // ManageRoles
        return false;
      },
    },
    reply(payload) {
      replyCalls.push(payload);
      return Promise.resolve();
    },
    editReply(payload) {
      replyCalls.push(payload);
      return Promise.resolve();
    },
  };
  interaction._replyCalls = replyCalls;
  return interaction;
}

test("marketyonet blocks users without management permissions", async () => {
  let delegated = 0;

  clearModule(MARKETYONET_PATH);
  clearModule(MARKET_PATH);
  mockModule(MARKET_PATH, {
    execute: async () => {
      delegated += 1;
    },
  });

  const cmd = require(MARKETYONET_PATH);
  const interaction = createInteraction({ guild: true, admin: false, manageGuild: false });
  await cmd.execute(interaction, {});

  assert.equal(delegated, 0);
  assert.equal(interaction._replyCalls.length, 1);
});

test("marketyonet delegates when manage permission exists", async () => {
  let delegated = 0;

  clearModule(MARKETYONET_PATH);
  clearModule(MARKET_PATH);
  mockModule(MARKET_PATH, {
    execute: async () => {
      delegated += 1;
    },
  });

  const cmd = require(MARKETYONET_PATH);
  const interaction = createInteraction({ guild: true, manageGuild: true });
  await cmd.execute(interaction, {});

  assert.equal(delegated, 1);
});

test("tepki blocks users without role management permissions", async () => {
  let delegated = 0;

  clearModule(TEPKI_PATH);
  clearModule(TEPKIROL_PATH);
  mockModule(TEPKIROL_PATH, {
    execute: async () => {
      delegated += 1;
    },
  });

  const cmd = require(TEPKI_PATH);
  const interaction = createInteraction({ guild: true, admin: false, manageRoles: false });
  await cmd.execute(interaction, {});

  assert.equal(delegated, 0);
  assert.equal(interaction._replyCalls.length, 1);
});

test("tepki delegates when role management permission exists", async () => {
  let delegated = 0;

  clearModule(TEPKI_PATH);
  clearModule(TEPKIROL_PATH);
  mockModule(TEPKIROL_PATH, {
    execute: async () => {
      delegated += 1;
    },
  });

  const cmd = require(TEPKI_PATH);
  const interaction = createInteraction({ guild: true, manageRoles: true });
  await cmd.execute(interaction, {});

  assert.equal(delegated, 1);
});
