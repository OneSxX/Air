const test = require("node:test");
const assert = require("node:assert/strict");

const reminder = require("../src/features/Reminder");

function createMemoryDb() {
  const store = new Map();
  return {
    async get(key) {
      return store.get(key);
    },
    async set(key, value) {
      store.set(key, value);
      return value;
    },
    async delete(key) {
      store.delete(key);
      return true;
    },
  };
}

test("setBumpReminder seeds pending from latest DISBOARD history message", async () => {
  const now = Date.now();
  const dueAt = now + (70 * 60 * 1000);
  const unix = Math.floor(dueAt / 1000);

  const historyMessage = {
    id: "msg-history",
    author: { id: "302050872383242240", bot: true },
    createdTimestamp: now - (50 * 60 * 1000),
    content: `Bump done! You can bump again at <t:${unix}:R>`,
    embeds: [],
  };

  const firstPage = new Map([["msg-history", historyMessage]]);
  firstPage.last = () => historyMessage;

  let fetchCount = 0;
  const channel = {
    id: "channel-1",
    isTextBased: () => true,
    messages: {
      fetch: async () => {
        fetchCount += 1;
        return fetchCount === 1 ? firstPage : new Map();
      },
    },
  };

  const guild = {
    id: "guild-1",
    channels: {
      cache: new Map([["channel-1", channel]]),
      fetch: async (id) => (id === "channel-1" ? channel : null),
    },
  };

  const client = {
    db: createMemoryDb(),
    guilds: {
      cache: new Map([["guild-1", guild]]),
      fetch: async (id) => (id === "guild-1" ? guild : null),
    },
  };

  const result = await reminder.setBumpReminder(client, {
    guildId: "guild-1",
    channelId: "channel-1",
    authorId: "user-1",
    message: "Bump zamani geldi",
    roleIds: ["role-1"],
  });

  assert.equal(Boolean(result?.config), true);
  assert.equal(Boolean(result?.pending), true);
  assert.equal(result.config.bumpBotId, "302050872383242240");
  assert.equal(result.pending.bumpBotId, "302050872383242240");
  assert.equal(result.pending.dueAt >= now, true);
  assert.equal(result.pending.intervalMs >= 110 * 60 * 1000, true);
});
