const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { setConfig } = require("../src/features/Protection/database");
const { isWhitelisted } = require("../src/features/Protection/utils/audit");

class MemoryDb {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    return this.store.get(key);
  }

  async set(key, value) {
    this.store.set(key, value);
    return value;
  }

  async delete(key) {
    this.store.delete(key);
  }
}

function loadProtection() {
  const file = path.resolve(__dirname, "../src/features/Protection/index.js");
  delete require.cache[file];
  return require(file);
}

async function seedProtectionConfig(db, guildId, patch = {}) {
  await setConfig(db, guildId, {
    toggles: {
      caps: false,
      links: true,
      mentions: false,
      flood: false,
      spam: false,
      emoji: true,
      everyone: false,
    },
    links: {
      maxMessages: 5,
      perSeconds: 5,
      allowedLinks: ["example.com"],
    },
    emoji: {
      maxCount: 2,
      perSeconds: 5,
    },
    whitelist: { users: [], roles: [] },
    logChannelId: null,
    ...patch,
  });
}

function createMockMessage(guildId, content) {
  let messageDeleteCount = 0;
  let channelDeleteCount = 0;

  const guild = {
    id: guildId,
    ownerId: "owner-user",
    members: { me: { id: "bot-user" } },
    client: { user: { id: "bot-user" } },
  };

  const channel = {
    id: "channel-1",
    messages: {
      delete: async () => {
        channelDeleteCount += 1;
      },
    },
  };

  const message = {
    id: `msg-${Math.random().toString(36).slice(2, 8)}`,
    guild,
    channel,
    channelId: channel.id,
    author: {
      id: "user-1",
      bot: false,
    },
    member: {
      id: "user-1",
      guild,
      permissions: {
        has: () => false,
      },
      roles: {
        cache: {
          some: () => false,
        },
      },
    },
    content,
    createdTimestamp: Date.now(),
    deletable: true,
    delete: async () => {
      messageDeleteCount += 1;
    },
  };

  return {
    message,
    getCounts: () => ({ messageDeleteCount, channelDeleteCount }),
  };
}

async function waitForAsyncDeletes() {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

function assertNoDeletes(getCounts) {
  const counts = getCounts();
  assert.equal(counts.messageDeleteCount, 0);
  assert.equal(counts.channelDeleteCount, 0);
}

test("allowed link still goes through emoji guard", async () => {
  const db = new MemoryDb();
  const guildId = "guild-allowed-link-emoji";
  await seedProtectionConfig(db, guildId);

  const content =
    "https://example.com <:a:123456789012345670> <:b:123456789012345671> <:c:123456789012345672>";
  const { message, getCounts } = createMockMessage(guildId, content);
  const client = { db, features: {} };

  const protection = loadProtection();
  await protection.onMessage(message, client);

  const counts = getCounts();
  assert.equal(counts.messageDeleteCount, 1);
});

test("guild owner is exempt from chat protections", async () => {
  const db = new MemoryDb();
  const guildId = "guild-owner-exempt";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: true,
      links: true,
      profanity: true,
      mentions: true,
      flood: true,
      spam: true,
      emoji: true,
      everyone: true,
    },
    caps: { minLetters: 5, ratio: 0.7 },
    links: { maxMessages: 1, perSeconds: 5, allowedLinks: [] },
    profanity: { level: "az" },
    mentions: { maxCount: 1, perSeconds: 5 },
    flood: { maxMessages: 1, windowMs: 7000 },
    spam: { maxMessages: 1, perSeconds: 10 },
    emoji: { maxCount: 1, perSeconds: 5 },
    everyone: { maxCount: 0, perSeconds: 5 },
  });

  const { message, getCounts } = createMockMessage(
    guildId,
    "AAAAAA BBBBBB @everyone <@1> https://bad-domain.net <:a:123456789012345670> <:b:123456789012345671>"
  );
  message.author.id = "owner-user";
  message.member.id = "owner-user";

  const client = { db, features: {} };
  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  assertNoDeletes(getCounts);
});

test("isWhitelisted returns true for guild owner", () => {
  const cfg = { whitelist: { users: [], roles: [] } };
  const guild = {
    ownerId: "owner-1",
    members: { me: { id: "bot-1" } },
    client: { user: { id: "bot-1" } },
  };

  assert.equal(isWhitelisted(cfg, "owner-1", null, guild), true);
});

test("disallowed link is deleted", async () => {
  const db = new MemoryDb();
  const guildId = "guild-disallowed-link";
  await seedProtectionConfig(db, guildId, {
    links: {
      maxMessages: 5,
      perSeconds: 5,
      allowedLinks: ["example.com"],
    },
    emoji: { maxCount: 10, perSeconds: 5 },
  });

  const content = "https://bad-domain.net";
  const { message, getCounts } = createMockMessage(guildId, content);
  const client = { db, features: {} };

  const protection = loadProtection();
  await protection.onMessage(message, client);

  const counts = getCounts();
  assert.equal(counts.messageDeleteCount, 1);
});

test("allowed link is deleted in non-exempt channel", async () => {
  const db = new MemoryDb();
  const guildId = "guild-safe-link";
  await seedProtectionConfig(db, guildId, {
    emoji: { maxCount: 5, perSeconds: 5 },
  });

  const content = "https://example.com <:a:123456789012345670>";
  const { message, getCounts } = createMockMessage(guildId, content);
  const client = { db, features: {} };

  const protection = loadProtection();
  await protection.onMessage(message, client);

  const counts = getCounts();
  assert.equal(counts.messageDeleteCount, 1);
});

test("caps violation is deleted when no caps exemption", async () => {
  const db = new MemoryDb();
  const guildId = "guild-caps-delete";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: true,
      links: false,
      mentions: false,
      flood: false,
      spam: false,
      emoji: false,
      everyone: false,
    },
    caps: {
      minLetters: 5,
      ratio: 0.7,
      exemptRoleIds: [],
      exemptChannelIds: [],
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "AAAAAA BBBBBB");
  const client = { db, features: {} };

  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  const counts = getCounts();
  assert.equal(counts.channelDeleteCount, 1);
});

test("caps violation is ignored for caps exempt role", async () => {
  const db = new MemoryDb();
  const guildId = "guild-caps-exempt-role";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: true,
      links: false,
      mentions: false,
      flood: false,
      spam: false,
      emoji: false,
      everyone: false,
    },
    caps: {
      minLetters: 5,
      ratio: 0.7,
      exemptRoleIds: ["caps-role-1"],
      exemptChannelIds: [],
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "AAAAAA BBBBBB");
  message.member.roles.cache = {
    some: (predicate) => ["caps-role-1"].some((roleId) => predicate({ id: roleId })),
  };

  const client = { db, features: {} };
  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  const counts = getCounts();
  assert.equal(counts.channelDeleteCount, 0);
  assert.equal(counts.messageDeleteCount, 0);
});

test("caps violation is ignored for caps exempt channel", async () => {
  const db = new MemoryDb();
  const guildId = "guild-caps-exempt-channel";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: true,
      links: false,
      mentions: false,
      flood: false,
      spam: false,
      emoji: false,
      everyone: false,
    },
    caps: {
      minLetters: 5,
      ratio: 0.7,
      exemptRoleIds: [],
      exemptChannelIds: ["channel-1"],
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "AAAAAA BBBBBB");
  const client = { db, features: {} };

  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  const counts = getCounts();
  assert.equal(counts.channelDeleteCount, 0);
});

test("disallowed link is ignored for link exempt role", async () => {
  const db = new MemoryDb();
  const guildId = "guild-link-exempt-role";
  await seedProtectionConfig(db, guildId, {
    links: {
      maxMessages: 5,
      perSeconds: 5,
      allowedLinks: ["example.com"],
      exemptRoleIds: ["link-role-1"],
      exemptChannelIds: [],
    },
    emoji: { maxCount: 10, perSeconds: 5 },
  });

  const { message, getCounts } = createMockMessage(guildId, "https://bad-domain.net");
  message.member.roles.cache = {
    some: (predicate) => ["link-role-1"].some((roleId) => predicate({ id: roleId })),
  };

  const client = { db, features: {} };
  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  const counts = getCounts();
  assert.equal(counts.channelDeleteCount, 0);
  assert.equal(counts.messageDeleteCount, 0);
});

test("disallowed link is deleted for link exempt channel", async () => {
  const db = new MemoryDb();
  const guildId = "guild-link-exempt-channel";
  await seedProtectionConfig(db, guildId, {
    links: {
      maxMessages: 5,
      perSeconds: 5,
      allowedLinks: ["example.com"],
      exemptRoleIds: [],
      exemptChannelIds: ["channel-1"],
    },
    emoji: { maxCount: 10, perSeconds: 5 },
  });

  const { message, getCounts } = createMockMessage(guildId, "https://bad-domain.net");
  const client = { db, features: {} };

  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  const counts = getCounts();
  assert.equal(counts.messageDeleteCount, 1);
});

test("allowed link is ignored for link exempt channel", async () => {
  const db = new MemoryDb();
  const guildId = "guild-link-exempt-channel-allowed";
  await seedProtectionConfig(db, guildId, {
    links: {
      maxMessages: 5,
      perSeconds: 5,
      allowedLinks: ["example.com"],
      exemptRoleIds: [],
      exemptChannelIds: ["channel-1"],
    },
    emoji: { maxCount: 10, perSeconds: 5 },
  });

  const { message, getCounts } = createMockMessage(guildId, "https://example.com/test");
  const client = { db, features: {} };

  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  assertNoDeletes(getCounts);
});

test("invite link is deleted when invite protection is enabled", async () => {
  const db = new MemoryDb();
  const guildId = "guild-invite-delete";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: false,
      links: false,
      invite: true,
      profanity: false,
      mentions: false,
      flood: false,
      spam: false,
      emoji: false,
      everyone: false,
    },
    timeouts: {
      invite: 300_000,
    },
    muteOnViolation: {
      invite: 0,
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "discord.gg/abcd1234");
  const client = { db, features: {} };
  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  const counts = getCounts();
  assert.equal(counts.messageDeleteCount, 1);
});

test("invite link is ignored when invite and link protections are disabled", async () => {
  const db = new MemoryDb();
  const guildId = "guild-invite-disabled";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: false,
      links: false,
      invite: false,
      profanity: false,
      mentions: false,
      flood: false,
      spam: false,
      emoji: false,
      everyone: false,
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "discord.gg/abcd1234");
  const client = { db, features: {} };
  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  assertNoDeletes(getCounts);
});

test("emoji violation is ignored for emoji exempt role", async () => {
  const db = new MemoryDb();
  const guildId = "guild-emoji-exempt-role";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: false,
      links: false,
      mentions: false,
      flood: false,
      spam: false,
      emoji: true,
      everyone: false,
    },
    emoji: {
      maxCount: 2,
      perSeconds: 5,
      exemptRoleIds: ["emoji-role-1"],
      exemptChannelIds: [],
    },
  });

  const { message, getCounts } = createMockMessage(
    guildId,
    "<:a:123456789012345670> <:b:123456789012345671> <:c:123456789012345672>"
  );
  message.member.roles.cache = {
    some: (predicate) => ["emoji-role-1"].some((roleId) => predicate({ id: roleId })),
  };

  const client = { db, features: {} };
  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  assertNoDeletes(getCounts);
});

test("emoji violation is ignored for emoji exempt channel", async () => {
  const db = new MemoryDb();
  const guildId = "guild-emoji-exempt-channel";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: false,
      links: false,
      mentions: false,
      flood: false,
      spam: false,
      emoji: true,
      everyone: false,
    },
    emoji: {
      maxCount: 2,
      perSeconds: 5,
      exemptRoleIds: [],
      exemptChannelIds: ["channel-1"],
    },
  });

  const { message, getCounts } = createMockMessage(
    guildId,
    "<:a:123456789012345670> <:b:123456789012345671> <:c:123456789012345672>"
  );
  const client = { db, features: {} };
  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  assertNoDeletes(getCounts);
});

test("mention violation is ignored for mention exempt role", async () => {
  const db = new MemoryDb();
  const guildId = "guild-mentions-exempt-role";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: false,
      links: false,
      mentions: true,
      flood: false,
      spam: false,
      emoji: false,
      everyone: false,
    },
    mentions: {
      maxCount: 2,
      perSeconds: 5,
      exemptRoleIds: ["mentions-role-1"],
      exemptChannelIds: [],
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "<@1> <@2> <@3>");
  message.member.roles.cache = {
    some: (predicate) => ["mentions-role-1"].some((roleId) => predicate({ id: roleId })),
  };

  const client = { db, features: {} };
  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  assertNoDeletes(getCounts);
});

test("mention violation is ignored for mention exempt channel", async () => {
  const db = new MemoryDb();
  const guildId = "guild-mentions-exempt-channel";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: false,
      links: false,
      mentions: true,
      flood: false,
      spam: false,
      emoji: false,
      everyone: false,
    },
    mentions: {
      maxCount: 2,
      perSeconds: 5,
      exemptRoleIds: [],
      exemptChannelIds: ["channel-1"],
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "<@1> <@2> <@3>");
  const client = { db, features: {} };
  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  assertNoDeletes(getCounts);
});

test("everyone violation is ignored for everyone exempt role", async () => {
  const db = new MemoryDb();
  const guildId = "guild-everyone-exempt-role";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: false,
      links: false,
      mentions: false,
      flood: false,
      spam: false,
      emoji: false,
      everyone: true,
    },
    everyone: {
      maxCount: 0,
      perSeconds: 5,
      exemptRoleIds: ["everyone-role-1"],
      exemptChannelIds: [],
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "@everyone");
  message.member.roles.cache = {
    some: (predicate) => ["everyone-role-1"].some((roleId) => predicate({ id: roleId })),
  };

  const client = { db, features: {} };
  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  assertNoDeletes(getCounts);
});

test("everyone violation is ignored for everyone exempt channel", async () => {
  const db = new MemoryDb();
  const guildId = "guild-everyone-exempt-channel";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: false,
      links: false,
      mentions: false,
      flood: false,
      spam: false,
      emoji: false,
      everyone: true,
    },
    everyone: {
      maxCount: 0,
      perSeconds: 5,
      exemptRoleIds: [],
      exemptChannelIds: ["channel-1"],
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "@everyone");
  const client = { db, features: {} };
  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  assertNoDeletes(getCounts);
});

test("flood violation is ignored for flood exempt role", async () => {
  const db = new MemoryDb();
  const guildId = "guild-flood-exempt-role";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: false,
      links: false,
      mentions: false,
      flood: true,
      spam: false,
      emoji: false,
      everyone: false,
    },
    flood: {
      maxMessages: 1,
      windowMs: 7000,
      exemptRoleIds: ["flood-role-1"],
      exemptChannelIds: [],
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "selam");
  message.member.roles.cache = {
    some: (predicate) => ["flood-role-1"].some((roleId) => predicate({ id: roleId })),
  };

  const client = { db, features: {} };
  const protection = loadProtection();
  await protection.onMessage(message, client);
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  assertNoDeletes(getCounts);
});

test("flood violation is ignored for flood exempt channel", async () => {
  const db = new MemoryDb();
  const guildId = "guild-flood-exempt-channel";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: false,
      links: false,
      mentions: false,
      flood: true,
      spam: false,
      emoji: false,
      everyone: false,
    },
    flood: {
      maxMessages: 1,
      windowMs: 7000,
      exemptRoleIds: [],
      exemptChannelIds: ["channel-1"],
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "selam");
  const client = { db, features: {} };
  const protection = loadProtection();
  await protection.onMessage(message, client);
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  assertNoDeletes(getCounts);
});

test("spam violation is ignored for spam exempt role", async () => {
  const db = new MemoryDb();
  const guildId = "guild-spam-exempt-role";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: false,
      links: false,
      mentions: false,
      flood: false,
      spam: true,
      emoji: false,
      everyone: false,
    },
    spam: {
      maxMessages: 1,
      perSeconds: 10,
      exemptRoleIds: ["spam-role-1"],
      exemptChannelIds: [],
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "selam");
  message.member.roles.cache = {
    some: (predicate) => ["spam-role-1"].some((roleId) => predicate({ id: roleId })),
  };

  const client = { db, features: {} };
  const protection = loadProtection();
  await protection.onMessage(message, client);
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  assertNoDeletes(getCounts);
});

test("media message is counted by spam protection", async () => {
  const db = new MemoryDb();
  const guildId = "guild-spam-media-count";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: false,
      links: false,
      mentions: false,
      flood: false,
      spam: true,
      emoji: false,
      everyone: false,
    },
    spam: {
      maxMessages: 1,
      perSeconds: 10,
      exemptRoleIds: [],
      exemptChannelIds: [],
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "");
  message.attachments = { size: 2 };

  const client = { db, features: {} };
  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  const counts = getCounts();
  assert.equal(counts.messageDeleteCount, 1);
});

test("spam violation is ignored for spam exempt channel", async () => {
  const db = new MemoryDb();
  const guildId = "guild-spam-exempt-channel";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: false,
      links: false,
      mentions: false,
      flood: false,
      spam: true,
      emoji: false,
      everyone: false,
    },
    spam: {
      maxMessages: 1,
      perSeconds: 10,
      exemptRoleIds: [],
      exemptChannelIds: ["channel-1"],
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "selam");
  const client = { db, features: {} };
  const protection = loadProtection();
  await protection.onMessage(message, client);
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  assertNoDeletes(getCounts);
});

test("profanity violation is deleted when profanity protection is enabled", async () => {
  const db = new MemoryDb();
  const guildId = "guild-profanity-delete";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: false,
      links: false,
      profanity: true,
      mentions: false,
      flood: false,
      spam: false,
      emoji: false,
      everyone: false,
    },
    profanity: {
      level: "az",
      exemptRoleIds: [],
      exemptChannelIds: [],
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "sen tam bir orospusun");
  const client = { db, features: {} };

  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  const counts = getCounts();
  assert.equal(counts.messageDeleteCount, 1);
});

test("profanity violation is ignored for profanity exempt role", async () => {
  const db = new MemoryDb();
  const guildId = "guild-profanity-exempt-role";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: false,
      links: false,
      profanity: true,
      mentions: false,
      flood: false,
      spam: false,
      emoji: false,
      everyone: false,
    },
    profanity: {
      level: "az",
      exemptRoleIds: ["prof-role-1"],
      exemptChannelIds: [],
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "sen tam bir orospusun");
  message.member.roles.cache = {
    some: (predicate) => ["prof-role-1"].some((roleId) => predicate({ id: roleId })),
  };

  const client = { db, features: {} };
  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  const counts = getCounts();
  assert.equal(counts.messageDeleteCount, 0);
  assert.equal(counts.channelDeleteCount, 0);
});

test("profanity violation is ignored for profanity exempt channel", async () => {
  const db = new MemoryDb();
  const guildId = "guild-profanity-exempt-channel";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: false,
      links: false,
      profanity: true,
      mentions: false,
      flood: false,
      spam: false,
      emoji: false,
      everyone: false,
    },
    profanity: {
      level: "az",
      exemptRoleIds: [],
      exemptChannelIds: ["channel-1"],
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "sen tam bir orospusun");
  const client = { db, features: {} };

  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  const counts = getCounts();
  assert.equal(counts.messageDeleteCount, 0);
  assert.equal(counts.channelDeleteCount, 0);
});

test("profanity level az does not block medium-level term", async () => {
  const db = new MemoryDb();
  const guildId = "guild-profanity-level-az";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: false,
      links: false,
      profanity: true,
      mentions: false,
      flood: false,
      spam: false,
      emoji: false,
      everyone: false,
    },
    profanity: {
      level: "az",
      exemptRoleIds: [],
      exemptChannelIds: [],
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "sen kahpesin");
  const client = { db, features: {} };

  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  const counts = getCounts();
  assert.equal(counts.messageDeleteCount, 0);
});

test("profanity level orta blocks medium-level term", async () => {
  const db = new MemoryDb();
  const guildId = "guild-profanity-level-orta";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: false,
      links: false,
      profanity: true,
      mentions: false,
      flood: false,
      spam: false,
      emoji: false,
      everyone: false,
    },
    profanity: {
      level: "orta",
      exemptRoleIds: [],
      exemptChannelIds: [],
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "sen kahpesin");
  const client = { db, features: {} };

  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  const counts = getCounts();
  assert.equal(counts.messageDeleteCount, 1);
});

test("profanity level dini_milli blocks religious-national insults", async () => {
  const db = new MemoryDb();
  const guildId = "guild-profanity-level-dini-milli-block";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: false,
      links: false,
      profanity: true,
      mentions: false,
      flood: false,
      spam: false,
      emoji: false,
      everyone: false,
    },
    profanity: {
      level: "dini_milli",
      exemptRoleIds: [],
      exemptChannelIds: [],
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "allahini sikeyim");
  const client = { db, features: {} };

  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  const counts = getCounts();
  assert.equal(counts.messageDeleteCount, 1);
});

test("profanity level dini_milli does not block non religious low-level insult", async () => {
  const db = new MemoryDb();
  const guildId = "guild-profanity-level-dini-milli-low-block";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: false,
      links: false,
      profanity: true,
      mentions: false,
      flood: false,
      spam: false,
      emoji: false,
      everyone: false,
    },
    profanity: {
      level: "dini_milli",
      exemptRoleIds: [],
      exemptChannelIds: [],
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "sen orospusun");
  const client = { db, features: {} };

  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  const counts = getCounts();
  assert.equal(counts.messageDeleteCount, 0);
});

test("profanity level dini_milli blocks racist insults", async () => {
  const db = new MemoryDb();
  const guildId = "guild-profanity-level-dini-milli-racist-block";
  await seedProtectionConfig(db, guildId, {
    toggles: {
      caps: false,
      links: false,
      profanity: true,
      mentions: false,
      flood: false,
      spam: false,
      emoji: false,
      everyone: false,
    },
    profanity: {
      level: "dini_milli",
      exemptRoleIds: [],
      exemptChannelIds: [],
    },
  });

  const { message, getCounts } = createMockMessage(guildId, "sen kurt picisin");
  const client = { db, features: {} };

  const protection = loadProtection();
  await protection.onMessage(message, client);
  await waitForAsyncDeletes();

  const counts = getCounts();
  assert.equal(counts.messageDeleteCount, 1);
});
