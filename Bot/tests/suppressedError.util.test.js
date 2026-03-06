const test = require("node:test");
const assert = require("node:assert/strict");

const suppressed = require("../src/utils/suppressedError");

test("parseEnvFlag recognizes common true-like values", () => {
  assert.equal(suppressed.parseEnvFlag("1"), true);
  assert.equal(suppressed.parseEnvFlag("true"), true);
  assert.equal(suppressed.parseEnvFlag("yes"), true);
  assert.equal(suppressed.parseEnvFlag("on"), true);
  assert.equal(suppressed.parseEnvFlag("0"), false);
  assert.equal(suppressed.parseEnvFlag("off"), false);
});

test("emitSuppressedPromiseError logs only when env flag is enabled", () => {
  const prev = process.env.SUPPRESSED_ERROR_WARN;
  const prevWarn = console.warn;
  const calls = [];
  console.warn = (...args) => calls.push(args);

  try {
    process.env.SUPPRESSED_ERROR_WARN = "0";
    suppressed.emitSuppressedPromiseError(new Error("hidden"));
    assert.equal(calls.length, 0);

    process.env.SUPPRESSED_ERROR_WARN = "1";
    suppressed.emitSuppressedPromiseError(new Error("visible"));
    assert.equal(calls.length, 1);
    assert.equal(String(calls[0][0] || ""), "Suppressed promise error:");
  } finally {
    process.env.SUPPRESSED_ERROR_WARN = prev;
    console.warn = prevWarn;
  }
});

test("installSuppressedErrorReporter binds global reporter function", () => {
  const holder = {};
  suppressed.installSuppressedErrorReporter(holder);
  assert.equal(typeof holder.__airWarnSuppressedError, "function");
});
