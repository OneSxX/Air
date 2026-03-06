const test = require("node:test");
const assert = require("node:assert/strict");

const { getGlobalCommandsBody } = require("../src/slash/register");

function findSubcommand(command, name) {
  const options = Array.isArray(command?.options) ? command.options : [];
  return options.find((opt) => opt?.type === 1 && opt?.name === name) || null;
}

function findChannelOption(subcommand) {
  const options = Array.isArray(subcommand?.options) ? subcommand.options : [];
  return options.find((opt) => opt?.name === "kanal" && opt?.type === 7) || null;
}

test("seviye ac/kapat kanal secenegi sadece yazi/ses kanal tiplerini kabul eder", () => {
  const commands = getGlobalCommandsBody();
  const seviye = commands.find((cmd) => String(cmd?.name || "").toLowerCase() === "seviye");
  assert.ok(seviye, "Missing slash command: seviye");

  const kapat = findSubcommand(seviye, "kapat");
  const ac = findSubcommand(seviye, "ac");
  assert.ok(kapat, "Missing seviye subcommand: kapat");
  assert.ok(ac, "Missing seviye subcommand: ac");

  const kapatOption = findChannelOption(kapat);
  const acOption = findChannelOption(ac);
  assert.ok(kapatOption, "Missing kanal option on seviye kapat");
  assert.ok(acOption, "Missing kanal option on seviye ac");

  assert.deepEqual(kapatOption.channel_types, [0, 2, 5, 13]);
  assert.deepEqual(acOption.channel_types, [0, 2, 5, 13]);
});
