const test = require("node:test");
const assert = require("node:assert/strict");

const welcome = require("../src/features/Welcome");

const {
  normalizeConfig,
  normalizeImageUrl,
  normalizeEmbedColor,
  applyWelcomeTokens,
  resolveHumanMemberCount,
  buildWelcomePayload,
  clearHumanCountCache,
} = welcome.__private;

test("normalizeImageUrl accepts only http links", () => {
  assert.equal(normalizeImageUrl("https://example.com/a.png"), "https://example.com/a.png");
  assert.equal(normalizeImageUrl("http://example.com/a.png"), "http://example.com/a.png");
  assert.equal(normalizeImageUrl("ftp://example.com/a.png"), null);
  assert.equal(normalizeImageUrl("sil"), null);
});

test("normalizeEmbedColor accepts hex formats", () => {
  assert.equal(normalizeEmbedColor("#ff6600"), 0xff6600);
  assert.equal(normalizeEmbedColor("ff6600"), 0xff6600);
  assert.equal(normalizeEmbedColor("0xff6600"), 0xff6600);
  assert.equal(normalizeEmbedColor("#f60"), 0xff6600);
  assert.equal(normalizeEmbedColor("siyah"), 0x000000);
  assert.equal(normalizeEmbedColor("xyz"), null);
});

test("applyWelcomeTokens replaces [user], [satir] and [satır]", () => {
  const member = { id: "123" };
  const out = applyWelcomeTokens("Merhaba [user][satir]Hos geldin[satır]Iyi eglenceler", member);
  assert.equal(out.includes("<@123>"), true);
  assert.equal(out.includes("\n"), true);
  assert.equal(out.split("\n").length, 3);
});

test("buildWelcomePayload builds top message and embed with user and guild visuals", () => {
  const member = {
    id: "555",
    user: {
      username: "Uye",
      displayAvatarURL: () => "https://cdn.example.com/user.gif",
    },
    guild: {
      memberCount: 42,
      iconURL: ({ forceStatic }) => (
        forceStatic
          ? "https://cdn.example.com/guild.png"
          : "https://cdn.example.com/guild.gif"
      ),
    },
  };

  const cfg = normalizeConfig({
    channelId: "1",
    topMessageTemplate: "Hos geldin [user]",
    embedTitle: "Baslik",
    embedDescription: "Satir1[satir]Satir2",
    embedColor: "#12ab34",
    embedImageUrl: "https://example.com/banner.png",
  });

  const payload = buildWelcomePayload(member, cfg);
  assert.equal(payload.content.includes("<@555>"), true);
  assert.equal(Array.isArray(payload.embeds), true);
  assert.equal(payload.embeds.length, 1);

  const embedData = payload.embeds[0]?.data || {};
  assert.equal(embedData.color, 0x12ab34);
  assert.equal(embedData.title, "Baslik");
  assert.equal(String(embedData.description || "").includes("Satir1\nSatir2"), true);
  assert.equal(embedData.thumbnail?.url, "https://cdn.example.com/guild.gif");
  assert.equal(embedData.image?.url, "https://example.com/banner.png");
  assert.equal(String(embedData.footer?.text || "").includes("Seninle birlikte 42 üyeyiz! • bugün saat"), true);
  assert.match(String(embedData.footer?.text || ""), /(AM|PM)$/);
});

test("resolveHumanMemberCount excludes bot users", async () => {
  clearHumanCountCache();

  let fetchCalls = 0;
  const fetchedCollection = {
    size: 3,
    filter(predicate) {
      const rows = [
        { user: { bot: false } },
        { user: { bot: false } },
        { user: { bot: true } },
      ].filter(predicate);
      return { size: rows.length };
    },
  };

  const guild = {
    id: "welcome-guild-1",
    memberCount: 6,
    members: {
      fetch: async () => {
        fetchCalls += 1;
        return fetchedCollection;
      },
      cache: fetchedCollection,
    },
  };

  const first = await resolveHumanMemberCount(guild, { forceRefresh: true });
  const second = await resolveHumanMemberCount(guild);
  assert.equal(first, 2);
  assert.equal(second, 2);
  assert.equal(fetchCalls, 1);
});

test("resolveHumanMemberCount falls back to memberCount when fetch fails", async () => {
  clearHumanCountCache();

  const cachedMembers = {
    size: 2,
    filter(predicate) {
      const rows = [
        { user: { bot: true } },
        { user: { bot: false } },
      ].filter(predicate);
      return { size: rows.length };
    },
  };

  const guild = {
    id: "welcome-guild-2",
    memberCount: 12,
    members: {
      fetch: async () => {
        throw new Error("unavailable");
      },
      cache: cachedMembers,
    },
  };

  const humanCount = await resolveHumanMemberCount(guild, { forceRefresh: true });
  assert.equal(humanCount, 11);
});
