const test = require("node:test");
const assert = require("node:assert/strict");

const yedek = require("../src/commands/yedek");

function createInteraction({ userId, subcommand = "durum" }) {
  const replies = [];

  const interaction = {
    guildId: "100000000000000001",
    guild: { ownerId: "100000000000000099" },
    user: { id: String(userId) },
    deferred: false,
    replied: false,
    options: {
      getSubcommand: () => subcommand,
      getString: () => null,
    },
    async deferReply() {
      interaction.deferred = true;
    },
    async editReply(payload) {
      replies.push(String(payload || ""));
    },
    async reply(payload) {
      replies.push(String(payload?.content || payload || ""));
    },
  };

  interaction._replies = replies;
  return interaction;
}

function createStatus() {
  return {
    lastBackup: null,
    pendingRestore: null,
    autoBackup: { intervalMin: 360, keepCount: 24 },
  };
}

test("yedek blocks non-owner users even with guild management role", async () => {
  const interaction = createInteraction({ userId: "100000000000000010" });
  let statusCalls = 0;

  const client = {
    config: { ownerId: "100000000000000001" },
    features: {
      SystemOps: {
        getStatus: async () => {
          statusCalls += 1;
          return createStatus();
        },
      },
    },
  };

  await yedek.execute(interaction, client);

  assert.equal(statusCalls, 0);
  assert.equal(interaction._replies.length, 1);
  assert.match(interaction._replies[0], /sadece bot sahibi/i);
});

test("yedek allows configured bot owner", async () => {
  const interaction = createInteraction({ userId: "100000000000000001" });
  let statusCalls = 0;

  const client = {
    config: { ownerId: "100000000000000001" },
    features: {
      SystemOps: {
        getStatus: async (_client, guildId) => {
          statusCalls += 1;
          assert.equal(guildId, interaction.guildId);
          return createStatus();
        },
      },
    },
  };

  await yedek.execute(interaction, client);

  assert.equal(statusCalls, 1);
  assert.equal(interaction._replies.length, 1);
  assert.match(interaction._replies[0], /Yedek durumu/i);
});
