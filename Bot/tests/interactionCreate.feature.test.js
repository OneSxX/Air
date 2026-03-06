const test = require("node:test");
const assert = require("node:assert/strict");

const interactionCreate = require("../src/events/interactionCreate");

function createBaseInteraction(commandName) {
  return {
    commandName,
    deferred: false,
    replied: false,
    isStringSelectMenu: () => false,
    isRoleSelectMenu: () => false,
    isChannelSelectMenu: () => false,
    isModalSubmit: () => false,
    isUserSelectMenu: () => false,
    isButton: () => false,
    isChatInputCommand: () => true,
    reply: async () => {},
    editReply: async () => {},
    followUp: async () => {},
  };
}

test("interactionCreate skips central handling for external feature commands", async () => {
  let rateChecks = 0;
  let audits = 0;
  let replies = 0;

  const interaction = createBaseInteraction("ticket");
  interaction.reply = async () => {
    replies += 1;
  };

  const client = {
    features: {
      SystemOps: {
        checkCommandRateLimit() {
          rateChecks += 1;
          return { limited: false, retryMs: 0 };
        },
        async recordCommandAudit() {
          audits += 1;
        },
      },
    },
    commands: new Map(),
  };

  await interactionCreate.execute(client, interaction);

  assert.equal(rateChecks, 0);
  assert.equal(audits, 0);
  assert.equal(replies, 0);
});

test("interactionCreate audits successful internal command execution", async () => {
  const auditRows = [];
  let executed = 0;

  const interaction = createBaseInteraction("help");
  const client = {
    features: {
      SystemOps: {
        checkCommandRateLimit() {
          return { limited: false, retryMs: 0 };
        },
        async recordCommandAudit(_interaction, _client, payload) {
          auditRows.push(payload);
        },
      },
    },
    commands: new Map([
      ["help", {
        name: "help",
        async execute() {
          executed += 1;
        },
      }],
    ]),
  };

  await interactionCreate.execute(client, interaction);

  assert.equal(executed, 1);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0].ok, true);
  assert.ok(Number(auditRows[0].durationMs || 0) >= 0);
});

test("interactionCreate audits and replies on internal command failure", async () => {
  const auditRows = [];
  const replies = [];
  const originalConsoleError = console.error;
  console.error = () => {};

  const interaction = createBaseInteraction("help");
  interaction.reply = async (payload) => {
    replies.push(payload);
  };

  const client = {
    features: {
      SystemOps: {
        checkCommandRateLimit() {
          return { limited: false, retryMs: 0 };
        },
        async recordCommandAudit(_interaction, _client, payload) {
          auditRows.push(payload);
        },
      },
    },
    commands: new Map([
      ["help", {
        name: "help",
        async execute() {
          throw new Error("forced_failure");
        },
      }],
    ]),
  };

  try {
    await interactionCreate.execute(client, interaction);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0].ok, false);
  assert.equal(auditRows[0].error, "forced_failure");
  assert.equal(replies.length, 1);
  assert.equal(replies[0].content, "Komut calistirilirken hata olustu.");
});
