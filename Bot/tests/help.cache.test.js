const test = require("node:test");
const assert = require("node:assert/strict");

const help = require("../src/commands/help");

const {
  getActiveSlashCommands,
  clearActiveCommandsCache,
} = help.__private;

function buildClientWithFetchCounter() {
  let fetchCount = 0;
  const fetchedCollection = new Map([
    ["1", { name: "help", description: "yardim", type: 1 }],
  ]);

  return {
    client: {
      application: {
        commands: {
          async fetch() {
            fetchCount += 1;
            return fetchedCollection;
          },
        },
      },
    },
    getFetchCount() {
      return fetchCount;
    },
  };
}

test("getActiveSlashCommands uses short-lived client cache", async () => {
  const { client, getFetchCount } = buildClientWithFetchCounter();
  clearActiveCommandsCache(client);

  const first = await getActiveSlashCommands(client);
  const second = await getActiveSlashCommands(client);

  assert.equal(first.length > 0, true);
  assert.equal(second.length > 0, true);
  assert.equal(getFetchCount(), 1);
});

test("clearActiveCommandsCache invalidates cached command list", async () => {
  const { client, getFetchCount } = buildClientWithFetchCounter();
  clearActiveCommandsCache(client);

  await getActiveSlashCommands(client);
  clearActiveCommandsCache(client);
  await getActiveSlashCommands(client);

  assert.equal(getFetchCount(), 2);
});
