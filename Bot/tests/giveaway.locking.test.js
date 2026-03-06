const test = require("node:test");
const assert = require("node:assert/strict");

const giveawayFeature = require("../src/features/Giveaway");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("withGuildStorageLock serializes concurrent writes per guild", async () => {
  const { withGuildStorageLock } = giveawayFeature.__private;
  const guildId = "123456789012345678";

  let counter = 0;
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      withGuildStorageLock(guildId, async () => {
        const before = counter;
        await sleep(5);
        counter = before + 1;
        return counter;
      })
    )
  );

  assert.equal(counter, 5);
  assert.deepEqual(results, [1, 2, 3, 4, 5]);
});

test("withGuildStorageLock keeps different guild queues independent", async () => {
  const { withGuildStorageLock } = giveawayFeature.__private;
  const guildA = "223456789012345678";
  const guildB = "323456789012345678";

  const order = [];
  await Promise.all([
    withGuildStorageLock(guildA, async () => {
      order.push("a1:start");
      await sleep(10);
      order.push("a1:end");
    }),
    withGuildStorageLock(guildB, async () => {
      order.push("b1:start");
      await sleep(1);
      order.push("b1:end");
    }),
  ]);

  const a1Start = order.indexOf("a1:start");
  const a1End = order.indexOf("a1:end");
  const b1Start = order.indexOf("b1:start");
  const b1End = order.indexOf("b1:end");

  assert.notEqual(a1Start, -1);
  assert.notEqual(a1End, -1);
  assert.notEqual(b1Start, -1);
  assert.notEqual(b1End, -1);
  assert.equal(a1Start < a1End, true);
  assert.equal(b1Start < b1End, true);
});
