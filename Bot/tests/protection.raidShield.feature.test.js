const test = require("node:test");
const assert = require("node:assert/strict");

const Protection = require("../src/features/Protection");

const {
  resolveRaidShieldDurationMs,
  resolveRaidYoungAccountMaxAgeMs,
  isYoungRaidAccount,
  resolveRaidJoinAction,
} = Protection.__private;

test("resolveRaidShieldDurationMs prefers explicit shieldMs", () => {
  assert.equal(
    resolveRaidShieldDurationMs({ shieldMs: 120_000, lockdownMs: 300_000 }),
    120_000
  );
});

test("resolveRaidShieldDurationMs falls back to lockdown", () => {
  assert.equal(
    resolveRaidShieldDurationMs({ lockdownMs: 180_000 }),
    180_000
  );
});

test("resolveRaidYoungAccountMaxAgeMs uses hours fallback", () => {
  assert.equal(
    resolveRaidYoungAccountMaxAgeMs({ youngAccountHours: 24 }),
    24 * 60 * 60_000
  );
});

test("isYoungRaidAccount detects young accounts", () => {
  const now = Date.now();
  const userYoung = { createdTimestamp: now - (2 * 60 * 60_000) };
  const userOld = { createdTimestamp: now - (10 * 24 * 60 * 60_000) };

  assert.equal(isYoungRaidAccount(userYoung, 24 * 60 * 60_000, now), true);
  assert.equal(isYoungRaidAccount(userOld, 24 * 60 * 60_000, now), false);
});

test("resolveRaidJoinAction escalates young account based on config", () => {
  const now = Date.now();
  const member = {
    user: { createdTimestamp: now - (60 * 60_000) },
  };

  const escalated = resolveRaidJoinAction(member, {
    action: "kick",
    youngAccountHours: 24,
    youngAccountAction: "ban",
  });
  assert.equal(escalated.punish, "ban");
  assert.equal(escalated.source, "young_account");
});
