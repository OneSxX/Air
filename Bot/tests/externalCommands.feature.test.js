const test = require("node:test");
const assert = require("node:assert/strict");

const { getGlobalCommandsBody } = require("../src/slash/register");
const externalCommands = require("../src/features/externalCommands");

test("external command map stays aligned with slash command body", () => {
  const slashNames = new Set(
    getGlobalCommandsBody()
      .map((cmd) => String(cmd?.name || "").trim().toLowerCase())
      .filter(Boolean)
  );

  for (const name of externalCommands.listExternalFeatureCommands()) {
    assert.equal(slashNames.has(name), true, `slash body is missing external command: ${name}`);
  }
});

test("external command owner mapping resolves ticket and voice manager commands", () => {
  assert.equal(externalCommands.isExternalFeatureCommand("ticket"), true);
  assert.equal(externalCommands.isCommandHandledBy("ticket", "ticket"), true);
  assert.equal(externalCommands.isCommandHandledBy("ticket", "voiceManager"), false);

  assert.equal(externalCommands.isExternalFeatureCommand("setup"), true);
  assert.equal(externalCommands.isCommandHandledBy("setup", "voiceManager"), true);
  assert.equal(externalCommands.isCommandHandledBy("setup", "ticket"), false);

  assert.equal(externalCommands.isExternalFeatureCommand("help"), false);
});
