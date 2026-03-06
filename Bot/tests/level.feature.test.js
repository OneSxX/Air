const test = require("node:test");
const assert = require("node:assert/strict");

const levelFeature = require("../src/features/Level");

test("normalizeRoleRewards keeps valid unique level mappings", () => {
  const { normalizeRoleRewards } = levelFeature.__private;
  const rows = normalizeRoleRewards([
    { level: 10, roleId: "1".repeat(18) },
    { level: 10, roleId: "2".repeat(18) },
    { level: 5, roleId: "3".repeat(18) },
    { level: 0, roleId: "4".repeat(18) },
    { level: 12, roleId: "bad" },
  ]);

  assert.deepEqual(rows, [
    { level: 5, roleId: "3".repeat(18) },
    { level: 10, roleId: "2".repeat(18) },
  ]);
});

test("collectRewardRoleIds returns rewards crossed between old and new levels", () => {
  const { collectRewardRoleIds } = levelFeature.__private;
  const cfg = {
    textRoleRewards: [
      { level: 5, roleId: "1".repeat(18) },
      { level: 10, roleId: "2".repeat(18) },
      { level: 15, roleId: "3".repeat(18) },
    ],
    voiceRoleRewards: [
      { level: 2, roleId: "4".repeat(18) },
      { level: 3, roleId: "5".repeat(18) },
    ],
  };

  assert.deepEqual(collectRewardRoleIds(cfg, "text", 4, 10), ["1".repeat(18), "2".repeat(18)]);
  assert.deepEqual(collectRewardRoleIds(cfg, "text", 10, 10), []);
  assert.deepEqual(collectRewardRoleIds(cfg, "voice", 1, 2), ["4".repeat(18)]);
});

test("grantRewardRolesForLevelUp adds only grantable roles", async () => {
  const { grantRewardRolesForLevelUp } = levelFeature.__private;
  const lowRoleId = "6".repeat(18);
  const highRoleId = "7".repeat(18);

  const roleCache = new Map([
    [lowRoleId, { id: lowRoleId, managed: false, position: 5 }],
    [highRoleId, { id: highRoleId, managed: false, position: 99 }],
  ]);

  const memberRoleCache = new Map();
  const member = {
    id: "9".repeat(18),
    user: { bot: false },
    roles: {
      cache: memberRoleCache,
      add: async (role) => {
        memberRoleCache.set(role.id, role);
      },
    },
  };

  const guild = {
    id: "8".repeat(18),
    members: {
      me: { roles: { highest: { position: 50 } } },
      fetch: async () => member,
    },
    roles: {
      cache: roleCache,
      fetch: async (id) => roleCache.get(id) || null,
    },
  };

  const cfg = {
    textRoleRewards: [
      { level: 5, roleId: lowRoleId },
      { level: 6, roleId: highRoleId },
    ],
    voiceRoleRewards: [],
  };

  const granted = await grantRewardRolesForLevelUp(guild, member, cfg, "text", 4, 6);
  assert.deepEqual(granted, [lowRoleId]);
  assert.equal(memberRoleCache.has(lowRoleId), true);
  assert.equal(memberRoleCache.has(highRoleId), false);
});

test("leave reset map marks, clears and resolves due users", () => {
  const { markLeaveReset, clearLeaveReset, resolveDueLeaveResets } = levelFeature.__private;
  const uid = "8".repeat(18);
  const now = 1_700_000_000_000;

  const marked = markLeaveReset({}, uid, now);
  assert.equal(typeof marked[uid]?.dueAt, "number");
  assert.equal(marked[uid]?.leftAt, now);

  const due = resolveDueLeaveResets(marked, now + 8 * 24 * 60 * 60 * 1000);
  assert.deepEqual(due.dueUserIds, [uid]);

  const cleared = clearLeaveReset(marked, uid);
  assert.equal(cleared[uid], undefined);
});
