const test = require("node:test");
const assert = require("node:assert/strict");

const protection = require("../src/features/Protection");

test("shouldFetchMutedMember fetches only when uncached and due", () => {
  const { shouldFetchMutedMember } = protection.__private;
  const now = Date.now();

  assert.equal(shouldFetchMutedMember({ id: "member" }, now - 1000, now), false);
  assert.equal(shouldFetchMutedMember(null, now + 60_000, now), false);
  assert.equal(shouldFetchMutedMember(null, now, now), true);
  assert.equal(shouldFetchMutedMember(null, now - 1, now), true);
});
