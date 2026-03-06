const test = require("node:test");
const assert = require("node:assert/strict");

const yedek = require("../src/commands/yedek");

function createInteraction({
  userId = "100000000000000001",
  subcommand = "yukle",
  dosya = "db-20990101-120000-manual.sqlite",
  onay = null,
} = {}) {
  const replies = [];

  const interaction = {
    guildId: "100000000000000001",
    guild: { ownerId: "100000000000000001" },
    user: { id: String(userId) },
    deferred: false,
    replied: false,
    options: {
      getSubcommand: () => subcommand,
      getString: (name) => {
        if (name === "dosya") return dosya;
        if (name === "onay") return onay;
        return null;
      },
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

test("yedek yukle requests confirmation code on first step", async () => {
  const interaction = createInteraction({ onay: null });
  let issueCalls = 0;
  let consumeCalls = 0;
  let scheduleCalls = 0;

  const client = {
    config: { ownerId: "100000000000000001" },
    features: {
      SystemOps: {
        issueRestoreConfirmation: () => {
          issueCalls += 1;
          return {
            code: "ABC123",
            fileName: "db-20990101-120000-manual.sqlite",
            expiresAt: Date.now() + 600_000,
          };
        },
        consumeRestoreConfirmation: () => {
          consumeCalls += 1;
          return { ok: false, reason: "not_found" };
        },
        scheduleRestore: () => {
          scheduleCalls += 1;
          return { fileName: "db-20990101-120000-manual.sqlite" };
        },
      },
    },
  };

  await yedek.execute(interaction, client);

  assert.equal(issueCalls, 1);
  assert.equal(consumeCalls, 0);
  assert.equal(scheduleCalls, 0);
  assert.equal(interaction._replies.length, 1);
  assert.match(interaction._replies[0], /Restore onayi gerekli/i);
  assert.match(interaction._replies[0], /ABC123/);
});

test("yedek yukle schedules restore after valid confirmation", async () => {
  const interaction = createInteraction({ onay: "ABC123" });
  let issueCalls = 0;
  let consumeCalls = 0;
  let scheduleCalls = 0;

  const client = {
    config: { ownerId: "100000000000000001" },
    features: {
      SystemOps: {
        issueRestoreConfirmation: () => {
          issueCalls += 1;
          return null;
        },
        consumeRestoreConfirmation: () => {
          consumeCalls += 1;
          return { ok: true, fileName: "db-20990101-120000-manual.sqlite" };
        },
        scheduleRestore: () => {
          scheduleCalls += 1;
          return { fileName: "db-20990101-120000-manual.sqlite" };
        },
      },
    },
  };

  await yedek.execute(interaction, client);

  assert.equal(issueCalls, 0);
  assert.equal(consumeCalls, 1);
  assert.equal(scheduleCalls, 1);
  assert.equal(interaction._replies.length, 1);
  assert.match(interaction._replies[0], /Restore siraya alindi/i);
});

test("yedek yukle rejects expired confirmation token", async () => {
  const interaction = createInteraction({ onay: "ABC123" });
  let scheduleCalls = 0;

  const client = {
    config: { ownerId: "100000000000000001" },
    features: {
      SystemOps: {
        consumeRestoreConfirmation: () => ({ ok: false, reason: "expired" }),
        scheduleRestore: () => {
          scheduleCalls += 1;
          return { fileName: "db-20990101-120000-manual.sqlite" };
        },
      },
    },
  };

  await yedek.execute(interaction, client);

  assert.equal(scheduleCalls, 0);
  assert.equal(interaction._replies.length, 1);
  assert.match(interaction._replies[0], /suresi doldu/i);
});
