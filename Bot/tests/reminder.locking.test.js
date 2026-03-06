const test = require("node:test");
const assert = require("node:assert/strict");

const reminder = require("../src/features/Reminder");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("withStoreLock serializes same-guild tasks", async () => {
  const { withStoreLock } = reminder.__private;
  const guildId = "guild-lock-1";
  let count = 0;

  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      withStoreLock(guildId, async () => {
        const before = count;
        await sleep(4);
        count = before + 1;
        return count;
      })
    )
  );

  assert.equal(count, 4);
  assert.deepEqual(results, [1, 2, 3, 4]);
});

test("withStoreLock allows parallelism across different guilds", async () => {
  const { withStoreLock } = reminder.__private;
  const marks = [];

  await Promise.all([
    withStoreLock("guild-lock-a", async () => {
      marks.push("a:start");
      await sleep(12);
      marks.push("a:end");
    }),
    withStoreLock("guild-lock-b", async () => {
      marks.push("b:start");
      await sleep(1);
      marks.push("b:end");
    }),
  ]);

  const aStart = marks.indexOf("a:start");
  const aEnd = marks.indexOf("a:end");
  const bStart = marks.indexOf("b:start");
  const bEnd = marks.indexOf("b:end");

  assert.equal(aStart !== -1 && aEnd !== -1 && bStart !== -1 && bEnd !== -1, true);
  assert.equal(aStart < aEnd, true);
  assert.equal(bStart < bEnd, true);
});
