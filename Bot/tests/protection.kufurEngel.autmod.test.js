const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getProfanityAutoModKeywordFilter,
  hasProfanity,
} = require("../src/features/Protection/guards/kufurEngel");

test("profanity automod filter keeps phrase terms exact", () => {
  const keywords = getProfanityAutoModKeywordFilter("dini_milli");

  assert.equal(keywords.includes("vatanini sikeyim"), true);
  assert.equal(keywords.includes("*vatanini*sikeyim*"), false);
});

test("profanity automod filter uses suffix wildcard for single-word terms", () => {
  const keywords = getProfanityAutoModKeywordFilter("az");

  assert.equal(keywords.includes("orospu*"), true);
  assert.equal(keywords.includes("*orospu*"), false);
});

test("profanity automod filter skips ambiguous short roots", () => {
  const keywords = getProfanityAutoModKeywordFilter("az");

  assert.equal(keywords.includes("got*"), false);
  assert.equal(keywords.includes("oc"), false);
  assert.equal(keywords.includes("sg"), false);
});

test("atanin sentence is not detected as profanity locally", () => {
  const message = "Gereksiz ban atanin agzina samar koyarim";

  assert.equal(hasProfanity(message, "dini_milli"), false);
});

test("goturmek sentence is not detected as profanity locally", () => {
  const message = "seni eve gotureyim";

  assert.equal(hasProfanity(message, "az"), false);
});

test("exact got profanity is still detected locally", () => {
  const message = "sen got herif";

  assert.equal(hasProfanity(message, "az"), true);
});

test("racial phrase with suffix is detected locally", () => {
  const message = "sen kurt picisin";

  assert.equal(hasProfanity(message, "dini_milli"), true);
});
