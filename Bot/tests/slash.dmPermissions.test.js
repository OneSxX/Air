const test = require("node:test");
const assert = require("node:assert/strict");

const { getGlobalCommandsBody } = require("../src/slash/register");

const GUILD_ONLY_COMMANDS = new Set([
  "setcreate",
  "setup",
  "panel",
  "voice",
  "ticket",
  "protection",
  "sohbet",
  "sunucu",
  "sunucuyetki",
  "log",
  "autorol",
  "hosgeldin",
  "hosgeldinembed",
  "kelimeoyunu",
  "sayioyunu",
  "muzik",
  "giveaway",
  "durum",
  "yedek",
  "tepki",
  "tepkirol",
  "embedtepki",
  "mute",
  "servertop",
  "seviye",
  "textlevelrol",
  "voicelevelrol",
  "slashsync",
  "profile",
  "avatar",
  "market",
  "marketyonet",
  "bump",
  "bumpremind",
  "panic",
  "sicil",
  "ceza",
]);

function commandMap() {
  return new Map(
    getGlobalCommandsBody().map((cmd) => [String(cmd?.name || "").toLowerCase(), cmd])
  );
}

test("guild-only commands are hidden in DM", () => {
  const commands = commandMap();
  for (const name of GUILD_ONLY_COMMANDS) {
    const cmd = commands.get(name);
    assert.ok(cmd, `Missing slash command: ${name}`);
    assert.equal(cmd.dm_permission, false, `${name} must set dm_permission:false`);
  }
});

test("help remains DM-available", () => {
  const commands = commandMap();
  assert.ok(commands.get("help"), "Missing slash command: help");
  assert.notEqual(commands.get("help").dm_permission, false);
});

test("dm_permission is only declared on top-level commands", () => {
  for (const cmd of getGlobalCommandsBody()) {
    const stack = Array.isArray(cmd?.options)
      ? cmd.options.map((opt) => ({ node: opt, path: `${cmd.name}.${opt?.name || "?"}` }))
      : [];

    while (stack.length) {
      const { node, path } = stack.pop();
      if (!node || typeof node !== "object") continue;
      assert.equal(
        Object.prototype.hasOwnProperty.call(node, "dm_permission"),
        false,
        `Nested dm_permission is not allowed at ${path}`
      );
      if (Array.isArray(node.options)) {
        for (const child of node.options) {
          stack.push({
            node: child,
            path: `${path}.${child?.name || "?"}`,
          });
        }
      }
    }
  }
});
