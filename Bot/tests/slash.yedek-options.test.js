const test = require("node:test");
const assert = require("node:assert/strict");

const { getGlobalCommandsBody } = require("../src/slash/register");

function findCommand(name) {
  return getGlobalCommandsBody().find((cmd) => String(cmd?.name || "").toLowerCase() === name);
}

test("yedek slash payload includes restore confirmation option", () => {
  const yedek = findCommand("yedek");
  assert.ok(yedek, "Missing slash command: yedek");
  assert.equal(yedek.default_member_permissions, "0");

  const yukle = (yedek.options || []).find((opt) => String(opt?.name || "").toLowerCase() === "yukle");
  assert.ok(yukle, "Missing subcommand: yedek yukle");

  const dosya = (yukle.options || []).find((opt) => String(opt?.name || "").toLowerCase() === "dosya");
  const onay = (yukle.options || []).find((opt) => String(opt?.name || "").toLowerCase() === "onay");

  assert.ok(dosya, "Missing option: dosya");
  assert.equal(dosya.required, true);
  assert.ok(onay, "Missing option: onay");
  assert.equal(onay.required, false);
});
