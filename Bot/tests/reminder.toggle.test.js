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

test("setBumpReminderEnabled off clears config and pending", async () => {
  const db = createMemoryDb();
  const client = { db };
  const guildId = "guild-1";

  await db.set(`bump_reminder_cfg_${guildId}`, {
    guildId,
    channelId: "channel-1",
    authorId: "user-1",
    message: "test",
    roleIds: ["role-1"],
  });
  await db.set(`bump_reminder_pending_${guildId}`, {
    guildId,
    channelId: "channel-1",
    message: "test",
    roleIds: ["role-1"],
    dueAt: Date.now() + 60_000,
    intervalMs: 2 * 60 * 60 * 1000,
  });

  const out = await reminder.setBumpReminderEnabled(client, guildId, false, { clearConfig: true });
  assert.equal(out.enabled, false);
  assert.equal(await db.get(`bump_reminder_cfg_${guildId}`), undefined);
  assert.equal(await db.get(`bump_reminder_pending_${guildId}`), undefined);
});

test("setBumpReminder rejects setup when disabled", async () => {
  const db = createMemoryDb();
  const client = { db };
  const guildId = "guild-2";

  await reminder.setBumpReminderEnabled(client, guildId, false, { clearConfig: true });

  await assert.rejects(
    reminder.setBumpReminder(client, {
      guildId,
      channelId: "channel-1",
      authorId: "user-1",
      message: "test",
      roleIds: ["role-1"],
    }),
    /kapali/i
  );
});

