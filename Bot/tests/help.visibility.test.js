const test = require("node:test");
const assert = require("node:assert/strict");

const help = require("../src/commands/help");

const {
  normalizeCommand,
  filterCommandsForMember,
  commandVisibleInContext,
} = help.__private;

function makeInteraction({ guildId = null, memberBits = 0n } = {}) {
  return {
    guildId,
    memberPermissions: {
      bitfield: memberBits,
    },
  };
}

test("normalizeCommand maps dm_permission from slash payload", () => {
  const cmd = normalizeCommand({
    name: "ornek",
    description: "test",
    type: 1,
    dm_permission: false,
  });

  assert.equal(cmd.dmPermission, false);
});

test("commandVisibleInContext hides dm-disabled commands in DM", () => {
  const dmInteraction = makeInteraction({ guildId: null });
  const guildInteraction = makeInteraction({ guildId: "100000000000000001" });

  assert.equal(commandVisibleInContext({ dmPermission: false }, dmInteraction), false);
  assert.equal(commandVisibleInContext({ dmPermission: false }, guildInteraction), true);
  assert.equal(commandVisibleInContext({ dmPermission: null }, dmInteraction), true);
});

test("filterCommandsForMember excludes dm-disabled command in DM", () => {
  const dmInteraction = makeInteraction({ guildId: null, memberBits: 0n });
  const commands = [
    { name: "help", dmPermission: null, defaultMemberPermissions: null },
    { name: "market", dmPermission: false, defaultMemberPermissions: null },
  ];

  const visible = filterCommandsForMember(commands, dmInteraction);
  assert.deepEqual(visible.map((x) => x.name), ["help"]);
});
