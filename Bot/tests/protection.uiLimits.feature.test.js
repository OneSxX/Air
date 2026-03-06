const test = require("node:test");
const assert = require("node:assert/strict");

const { __private } = require("../src/features/Protection/uiLimits");

test("isProtectionCustomId matches only protection UI ids", () => {
  const { isProtectionCustomId } = __private;
  assert.equal(isProtectionCustomId("prot:ui:chat"), true);
  assert.equal(isProtectionCustomId("limit:ban:save"), true);
  assert.equal(isProtectionCustomId("settings:caps:save"), true);
  assert.equal(isProtectionCustomId("emoji:exempt:roles"), true);

  assert.equal(isProtectionCustomId("gw:join"), false);
  assert.equal(isProtectionCustomId("t_open_complaint"), false);
  assert.equal(isProtectionCustomId("btn_lock:123456789012345678"), false);
});
