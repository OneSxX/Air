const test = require("node:test");
const assert = require("node:assert/strict");

const profile = require("../src/commands/rank");

const { collectMemberScopeFromCache } = profile.__private;

test("collectMemberScopeFromCache omits include list when cache is partial", () => {
  const guild = {
    memberCount: 100,
    members: {
      cache: new Map([
        ["1", { id: "1", user: { bot: false } }],
        ["2", { id: "2", user: { bot: true } }],
      ]),
    },
  };

  const scope = collectMemberScopeFromCache(guild, "1");
  assert.equal(scope.includeUserIds, undefined);
  assert.deepEqual(scope.excludeUserIds, ["2"]);
});

test("collectMemberScopeFromCache includes target when cache is complete", () => {
  const guild = {
    memberCount: 2,
    members: {
      cache: new Map([
        ["2", { id: "2", user: { bot: false } }],
      ]),
    },
  };

  const scope = collectMemberScopeFromCache(guild, "1");
  assert.deepEqual(scope.includeUserIds.sort(), ["1", "2"]);
  assert.deepEqual(scope.excludeUserIds || [], []);
});
