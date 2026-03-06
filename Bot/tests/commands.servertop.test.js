const test = require("node:test");
const assert = require("node:assert/strict");

const servertop = require("../src/commands/servertop");

const { resolveFetchLimit, paginateRows, collectMemberScopeFromCache } = servertop.__private;

test("resolveFetchLimit returns all rows when member count is unknown", () => {
  assert.equal(resolveFetchLimit(0), Number.POSITIVE_INFINITY);
  assert.equal(resolveFetchLimit(null), Number.POSITIVE_INFINITY);
});

test("resolveFetchLimit returns numeric limit for known member count", () => {
  assert.equal(resolveFetchLimit(3), 10);
  assert.equal(resolveFetchLimit(38), 38);
});

test("paginateRows splits array by page size", () => {
  const rows = Array.from({ length: 23 }, (_x, idx) => ({ userId: String(idx + 1) }));
  const pages = paginateRows(rows, 10);
  assert.equal(pages.length, 3);
  assert.equal(pages[0].length, 10);
  assert.equal(pages[1].length, 10);
  assert.equal(pages[2].length, 3);
});

test("collectMemberScopeFromCache marks cache as complete and separates bots", () => {
  const guild = {
    memberCount: 3,
    members: {
      cache: new Map([
        ["1", { id: "1", user: { bot: false } }],
        ["2", { id: "2", user: { bot: false } }],
        ["3", { id: "3", user: { bot: true } }],
      ]),
    },
  };

  const scope = collectMemberScopeFromCache(guild);
  assert.equal(scope.cacheLooksComplete, true);
  assert.deepEqual(scope.includeUserIds.sort(), ["1", "2"]);
  assert.deepEqual(scope.botUserIds.sort(), ["3"]);
});
