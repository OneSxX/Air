const test = require("node:test");
const assert = require("node:assert/strict");

const panicCommand = require("../src/commands/panic");

const { parseDurationMs } = panicCommand.__private;

test("parseDurationMs parses m/h/d values", () => {
  assert.equal(parseDurationMs("10m"), 10 * 60_000);
  assert.equal(parseDurationMs("2h"), 2 * 60 * 60_000);
  assert.equal(parseDurationMs("1d"), 24 * 60 * 60_000);
});

test("parseDurationMs falls back to default when empty", () => {
  assert.equal(parseDurationMs(""), 15 * 60_000);
  assert.equal(parseDurationMs(null), 15 * 60_000);
});

test("parseDurationMs rejects invalid or overflow values", () => {
  assert.equal(parseDurationMs("abc"), null);
  assert.equal(parseDurationMs("0m"), null);
  assert.equal(parseDurationMs("25d"), null);
});
