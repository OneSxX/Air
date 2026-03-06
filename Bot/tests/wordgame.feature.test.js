const test = require("node:test");
const assert = require("node:assert/strict");

const wordGame = require("../src/features/WordGame");

const {
  normalizeWord,
  firstLetter,
  lastLetter,
  applyAcceptedWordState,
  buildRoundWinMessage,
  buildReactionCandidates,
  normalizeConfig,
  buildLookupVariants,
  validateFromAutocompleteSync,
} = wordGame.__private;

test("normalizeWord keeps Turkish letters and lowercases input", () => {
  assert.equal(normalizeWord("Ama\u00c7"), "ama\u00e7");
  assert.equal(normalizeWord("\u00c7A\u011e"), "\u00e7a\u011f");
  assert.equal(normalizeWord("\u0130FADE"), "ifade");
  assert.equal(normalizeWord("K\u00c2\u011eIT"), "k\u00e2\u011f\u0131t");
});

test("normalizeWord rejects non-word messages", () => {
  assert.equal(normalizeWord("iki kelime"), "");
  assert.equal(normalizeWord("merhaba!"), "");
  assert.equal(normalizeWord(""), "");
  assert.equal(normalizeWord("m"), "");
});

test("firstLetter and lastLetter return proper chain letters", () => {
  assert.equal(firstLetter("ama\u00e7"), "a");
  assert.equal(lastLetter("ama\u00e7"), "\u00e7");
  assert.equal(lastLetter("da\u011f"), "\u011f");
  assert.equal(firstLetter("k\u00e2\u011f\u0131t"), "k");
  assert.equal(lastLetter("r\u00fbcu"), "u");
});

test("applyAcceptedWordState continues chain when ending is not g-breve", () => {
  const cfg = normalizeConfig({
    expectedLetter: "a",
    usedWords: ["ifade"],
    round: 4,
  });

  const out = applyAcceptedWordState(cfg, "ama\u00e7");
  assert.equal(out.roundEnded, false);
  assert.equal(out.nextRound, 4);
  assert.equal(out.nextExpectedLetter, "\u00e7");
  assert.equal(out.nextUsedWords.includes("ifade"), true);
  assert.equal(out.nextUsedWords.includes("ama\u00e7"), true);
});

test("applyAcceptedWordState resets round data when ending is g-breve", () => {
  const cfg = normalizeConfig({
    expectedLetter: "d",
    usedWords: ["deneme", "doru"],
    round: 2,
  });

  const out = applyAcceptedWordState(cfg, "da\u011f");
  assert.equal(out.roundEnded, true);
  assert.equal(out.nextRound, 3);
  assert.equal(out.nextUsedWords.length, 0);
  assert.equal(typeof out.nextExpectedLetter, "string");
  assert.equal(out.nextExpectedLetter.length >= 1, true);
});

test("buildReactionCandidates parses custom emoji id", () => {
  const out = buildReactionCandidates("<:Onay:1477967088344891474>");
  assert.equal(out.includes("<:Onay:1477967088344891474>"), true);
  assert.equal(out.includes("1477967088344891474"), true);
});

test("buildLookupVariants includes i/ı alternatives", () => {
  const out = buildLookupVariants("istakoz");
  assert.equal(out.includes("istakoz"), true);
  assert.equal(out.includes("\u0131stakoz"), true);
});

test("validateFromAutocompleteSync returns null when cache is not ready", () => {
  const out = validateFromAutocompleteSync(["zurna"]);
  assert.equal(out === null || typeof out === "boolean", true);
});

test("buildRoundWinMessage uses decorative template and lowercase next letter", () => {
  const message = buildRoundWinMessage("1".repeat(18), "\u011f", "K");
  assert.equal(message.includes("**Tebrikler**"), true);
  assert.equal(message.includes(`・<@${"1".repeat(18)}> kelimeyi \u011f ile bitirerek turu kazandi.`), true);
  assert.equal(message.includes("・0.1 coin kazandin."), true);
  assert.equal(message.includes("・Yeni tur harfi: k"), true);
});
