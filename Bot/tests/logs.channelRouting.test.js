const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeActorType,
  routeChannelExtraKey,
  resolveChannelRouting,
} = require("../src/features/Logs/channelRouting");

test("normalizeActorType recognizes supported actor labels", () => {
  assert.equal(normalizeActorType("bot"), "bot");
  assert.equal(normalizeActorType("human"), "human");
  assert.equal(normalizeActorType("member"), "human");
  assert.equal(normalizeActorType("user"), "human");
  assert.equal(normalizeActorType("yetkili"), "human");
  assert.equal(normalizeActorType(""), "unknown");
});

test("routeChannelExtraKey maps bot channel update keys to bot channels", () => {
  assert.equal(routeChannelExtraKey("kanalIzinDegistirme", "bot"), "kanalIzinDegistirmeBot");
  assert.equal(routeChannelExtraKey("kanalAyarDegistirme", "bot"), "kanalAyarDegistirmeBot");
  assert.equal(routeChannelExtraKey("kanalIsimDuzenleme", "bot"), "kanalIsimDuzenlemeBot");
});

test("routeChannelExtraKey keeps human channel update keys unchanged", () => {
  assert.equal(routeChannelExtraKey("kanalIzinDegistirme", "human"), "kanalIzinDegistirme");
  assert.equal(routeChannelExtraKey("kanalAyarDegistirme", "human"), "kanalAyarDegistirme");
});

test("resolveChannelRouting blocks unknown actor when strict mode is enabled", () => {
  const strictUnknown = resolveChannelRouting("kanalAyarDegistirme", "unknown", { strict: true });
  assert.equal(strictUnknown.blocked, true);
  assert.equal(strictUnknown.routedExtraKey, null);

  const nonStrictUnknown = resolveChannelRouting("kanalAyarDegistirme", "unknown", { strict: false });
  assert.equal(nonStrictUnknown.blocked, false);
  assert.equal(nonStrictUnknown.routedExtraKey, "kanalAyarDegistirme");
});
