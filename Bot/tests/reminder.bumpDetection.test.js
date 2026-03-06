const test = require("node:test");
const assert = require("node:assert/strict");

const reminder = require("../src/features/Reminder");

const {
  isLikelyBumpText,
  isLikelyDisboardPayload,
  parseCooldownDetails,
  parseCooldownFromText,
  buildPendingFromBumpMessage,
  findLatestBumpMessageInChannel,
  normalizeLoopIntervalMs,
  shouldRescheduleFromLatestBump,
} = reminder.__private;

test("isLikelyBumpText detects bump tokens", () => {
  assert.equal(isLikelyBumpText("use /bump now"), true);
  assert.equal(isLikelyBumpText("this is unrelated"), false);
});

test("isLikelyDisboardPayload detects DISBOARD style texts", () => {
  const message = {
    embeds: [
      {
        description: "Bump done! Please wait another 2 hours.",
      },
    ],
  };
  assert.equal(isLikelyDisboardPayload(message), true);
});

test("isLikelyDisboardPayload detects interaction metadata bump", () => {
  const message = {
    interactionMetadata: { name: "bump" },
    embeds: [],
    content: "",
  };
  assert.equal(isLikelyDisboardPayload(message), true);
});

test("parseCooldownFromText parses relative time", () => {
  const ms = parseCooldownFromText("Please wait another 2 hours 30 minutes.");
  assert.equal(Number.isFinite(ms), true);
  assert.equal(ms >= 2 * 60 * 60 * 1000, true);
});

test("parseCooldownFromText ignores alphanumeric URL fragments", () => {
  const text = "Bagis icin tiklayin: https://www.paypal.com/ncp/payment/V2257AKBQS2S6";
  const ms = parseCooldownFromText(text);
  assert.equal(ms, null);
});

test("parseCooldownFromText parses discord timestamp", () => {
  const now = Date.now();
  const dueAt = now + (95 * 60 * 1000);
  const unix = Math.floor(dueAt / 1000);
  const ms = parseCooldownFromText(`You can bump again at <t:${unix}:R>`, now);
  assert.equal(Number.isFinite(ms), true);
  assert.equal(ms >= 90 * 60 * 1000, true);
});

test("parseCooldownDetails keeps past timestamp as immediate retry window", () => {
  const now = Date.now();
  const pastDueAt = now - (40 * 60 * 1000);
  const unix = Math.floor(pastDueAt / 1000);
  const details = parseCooldownDetails(`You can bump again at <t:${unix}:R>`, now);

  assert.equal(details?.source, "timestamp");
  assert.equal(Number.isFinite(details?.delayMs), true);
  assert.equal(details?.dueAt > now, true);
});

test("buildPendingFromBumpMessage derives cycle from historical timestamp", () => {
  const now = Date.now();
  const oneHourMs = 60 * 60 * 1000;
  const createdAt = now - oneHourMs;
  const dueAt = now + oneHourMs;
  const unix = Math.floor(dueAt / 1000);

  const cfg = {
    guildId: "1",
    channelId: "2",
    message: "test",
    roleIds: ["3"],
    bumpBotId: null,
  };
  const message = {
    author: { id: "302050872383242240", bot: true },
    createdTimestamp: createdAt,
    content: `Bump done. You can bump again at <t:${unix}:R>`,
    embeds: [],
  };

  const pending = buildPendingFromBumpMessage(cfg, message, now);
  assert.equal(Boolean(pending), true);
  assert.equal(pending.bumpBotId, "302050872383242240");
  assert.equal(Math.abs(pending.dueAt - dueAt) < 5_000, true);
  assert.equal(pending.intervalMs >= 110 * 60 * 1000, true);
});

test("findLatestBumpMessageInChannel returns nearest valid historical message", async () => {
  const disboardMessage = {
    id: "m2",
    author: { id: "302050872383242240", bot: true },
    createdTimestamp: Date.now() - 30_000,
    content: "Bump done! Please wait another 2 hours.",
    embeds: [],
  };
  const nonBumpMessage = {
    id: "m3",
    author: { id: "999999999999999999", bot: true },
    createdTimestamp: Date.now() - 10_000,
    content: "regular bot text",
    embeds: [],
  };

  const page = new Map([
    ["m3", nonBumpMessage],
    ["m2", disboardMessage],
  ]);
  page.last = () => disboardMessage;

  let fetchCount = 0;
  const channel = {
    messages: {
      fetch: async () => {
        fetchCount += 1;
        return fetchCount === 1 ? page : new Map();
      },
    },
  };

  const found = await findLatestBumpMessageInChannel(channel, { bumpBotId: null });
  assert.equal(found?.id, "m2");
});

test("normalizeLoopIntervalMs upgrades short loop intervals to default", () => {
  const defaultMs = 2 * 60 * 60 * 1000;
  assert.equal(normalizeLoopIntervalMs(5 * 60 * 1000), defaultMs);
  assert.equal(normalizeLoopIntervalMs(90 * 60 * 1000), 90 * 60 * 1000);
});

test("buildPendingFromBumpMessage keeps short wait only for dueAt, not loop interval", () => {
  const now = Date.now();
  const cfg = {
    guildId: "1",
    channelId: "2",
    message: "test",
    roleIds: ["3"],
    bumpBotId: "302050872383242240",
  };
  const message = {
    author: { id: "302050872383242240", bot: true },
    createdTimestamp: now,
    content: "Please wait another 5 minutes before bumping again.",
    embeds: [],
  };

  const pending = buildPendingFromBumpMessage(cfg, message, now);
  assert.equal(Boolean(pending), true);
  assert.equal(pending.dueAt > now + (4 * 60 * 1000), true);
  assert.equal(pending.intervalMs, 2 * 60 * 60 * 1000);
});

test("buildPendingFromBumpMessage uses message timestamp + 2h when cooldown text is absent", () => {
  const now = Date.now();
  const createdAt = now - (10 * 60 * 1000);
  const expectedDueAt = createdAt + (2 * 60 * 60 * 1000);

  const cfg = {
    guildId: "1",
    channelId: "2",
    message: "test",
    roleIds: ["3"],
    bumpBotId: "302050872383242240",
  };
  const message = {
    author: { id: "302050872383242240", bot: true },
    createdTimestamp: createdAt,
    content: "",
    embeds: [{ title: "DISBOARD: Sunucu Listesi", description: "One cikarma basarili!" }],
  };

  const pending = buildPendingFromBumpMessage(cfg, message, now);
  assert.equal(Boolean(pending), true);
  assert.equal(Math.abs(pending.dueAt - expectedDueAt) < 5_000, true);
  assert.equal(pending.intervalMs, 2 * 60 * 60 * 1000);
});

test("buildPendingFromBumpMessage ignores fake short duration from URL tokens", () => {
  const now = Date.now();
  const createdAt = now;
  const expectedDueAt = createdAt + (2 * 60 * 60 * 1000);

  const cfg = {
    guildId: "1",
    channelId: "2",
    message: "test",
    roleIds: ["3"],
    bumpBotId: "302050872383242240",
  };
  const message = {
    author: { id: "302050872383242240", bot: true },
    createdTimestamp: createdAt,
    content: "Bagis icin tiklayin: https://www.paypal.com/ncp/payment/V2257AKBQS2S6",
    embeds: [{ title: "DISBOARD: Sunucu Listesi", description: "One cikarma basarili!" }],
  };

  const pending = buildPendingFromBumpMessage(cfg, message, now);
  assert.equal(Boolean(pending), true);
  assert.equal(Math.abs(pending.dueAt - expectedDueAt) < 5_000, true);
  assert.equal(pending.intervalMs, 2 * 60 * 60 * 1000);
});

test("buildPendingFromBumpMessage ignores near-instant timestamp cooldowns", () => {
  const now = Date.now();
  const createdAt = now;
  const nearTs = Math.floor((now + 20_000) / 1000);

  const cfg = {
    guildId: "1",
    channelId: "2",
    message: "test",
    roleIds: ["3"],
    bumpBotId: "302050872383242240",
  };
  const message = {
    author: { id: "302050872383242240", bot: true },
    createdTimestamp: createdAt,
    content: `DISBOARD can bump again at <t:${nearTs}:R>`,
    embeds: [],
  };

  const pending = buildPendingFromBumpMessage(cfg, message, now);
  const expectedDueAt = createdAt + (2 * 60 * 60 * 1000);
  assert.equal(Boolean(pending), true);
  assert.equal(Math.abs(pending.dueAt - expectedDueAt) < 5_000, true);
  assert.equal(pending.intervalMs, 2 * 60 * 60 * 1000);
});

test("shouldRescheduleFromLatestBump returns true for stale pending vs fresh bump", () => {
  const now = Date.now();
  const stalePending = { dueAt: now - 10_000 };
  const freshPending = { dueAt: now + (2 * 60 * 60 * 1000) };
  assert.equal(shouldRescheduleFromLatestBump(stalePending, freshPending, now), true);
});

test("shouldRescheduleFromLatestBump ignores near-term dueAt", () => {
  const now = Date.now();
  const stalePending = { dueAt: now - 10_000 };
  const nearPending = { dueAt: now + 30_000 };
  assert.equal(shouldRescheduleFromLatestBump(stalePending, nearPending, now), false);
});
