const test = require("node:test");
const assert = require("node:assert/strict");

const numberGame = require("../src/features/NumberGame");

const {
  normalizeNumberText,
  nextExpectedNumber,
  normalizeConfig,
  buildReactionCandidates,
} = numberGame.__private;

test("normalizeNumberText accepts only positive integer digits", () => {
  assert.equal(normalizeNumberText("1"), "1");
  assert.equal(normalizeNumberText("0002"), "2");
  assert.equal(normalizeNumberText("999999999999999999999"), "999999999999999999999");
  assert.equal(normalizeNumberText(""), "");
  assert.equal(normalizeNumberText("12.4"), "");
  assert.equal(normalizeNumberText("abc"), "");
});

test("nextExpectedNumber increments safely with BigInt", () => {
  assert.equal(nextExpectedNumber("1"), "2");
  assert.equal(nextExpectedNumber("999999999999999999999"), "1000000000000000000000");
});

test("normalizeConfig keeps channel and expected number", () => {
  const cfg = normalizeConfig({
    enabled: true,
    channelId: "123456789012345678",
    expectedNumber: "0007",
  });

  assert.equal(cfg.enabled, true);
  assert.equal(cfg.channelId, "123456789012345678");
  assert.equal(cfg.expectedNumber, "7");
});

test("buildReactionCandidates parses custom emoji id fallback list", () => {
  const out = buildReactionCandidates("<:Onay:1477967088344891474>");
  assert.equal(out.includes("<:Onay:1477967088344891474>"), true);
  assert.equal(out.includes("1477967088344891474"), true);
});

