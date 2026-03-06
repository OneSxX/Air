const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { Collection, PermissionFlagsBits } = require("discord.js");

const ROLE_GIVE_PATH = path.resolve(__dirname, "../src/features/Protection/server/roleGive.js");
const AUDIT_UTILS_PATH = path.resolve(__dirname, "../src/features/Protection/utils/audit.js");

const GUILD_ID = "100000000000000001";
const BOT_ID = "100000000000000002";
const TARGET_ID = "100000000000000003";
const EXECUTOR_ID = "100000000000000004";
const OTHER_TARGET_ID = "100000000000000005";
const BASE_ROLE_ID = "200000000000000001";
const ADDED_ROLE_ID = "200000000000000002";

function loadRoleGiveWithAuditMocks(auditMocks = {}) {
  delete require.cache[ROLE_GIVE_PATH];
  delete require.cache[AUDIT_UTILS_PATH];

  require.cache[AUDIT_UTILS_PATH] = {
    id: AUDIT_UTILS_PATH,
    filename: AUDIT_UTILS_PATH,
    loaded: true,
    exports: {
      isWhitelisted: () => false,
      getGuildMember: async (guild, id) => guild?.members?.fetch?.(id) || null,
      punishMember: async () => false,
      sendLog: async () => {},
      ...auditMocks,
    },
  };

  return require(ROLE_GIVE_PATH);
}

function createGuildWithAuditEntries({ auditEntries, executorHasManageRoles = true }) {
  const roleCache = new Collection([
    [BASE_ROLE_ID, { id: BASE_ROLE_ID, name: "base-role" }],
    [ADDED_ROLE_ID, { id: ADDED_ROLE_ID, name: "added-role" }],
  ]);

  return {
    id: GUILD_ID,
    ownerId: "100000000000000099",
    roles: { cache: roleCache },
    client: { user: { id: BOT_ID } },
    members: {
      me: { id: BOT_ID },
      fetch: async (id) => {
        if (String(id) !== EXECUTOR_ID) return null;
        return {
          id: EXECUTOR_ID,
          permissions: {
            has: (perm) => perm === PermissionFlagsBits.ManageRoles && executorHasManageRoles,
          },
        };
      },
    },
    fetchAuditLogs: async () => ({
      entries: new Map(
        auditEntries.map((entry, index) => [`entry-${index + 1}`, entry])
      ),
    }),
  };
}

function createMemberPair(guild) {
  const oldMember = {
    id: TARGET_ID,
    guild,
    roles: {
      cache: new Collection([[BASE_ROLE_ID, guild.roles.cache.get(BASE_ROLE_ID)]]),
    },
  };

  const removedRoleIds = [];
  const newMember = {
    id: TARGET_ID,
    guild,
    roles: {
      cache: new Collection([
        [BASE_ROLE_ID, guild.roles.cache.get(BASE_ROLE_ID)],
        [ADDED_ROLE_ID, guild.roles.cache.get(ADDED_ROLE_ID)],
      ]),
      remove: async (roles) => {
        for (const role of roles.values()) removedRoleIds.push(role.id);
      },
    },
  };

  return { oldMember, newMember, removedRoleIds };
}

function createDbMock() {
  return {
    async get(key) {
      if (key === `prot_cfg_${GUILD_ID}`) {
        return {
          toggles: { rolegive: true },
          punish: { mode: "none" },
          whitelist: { users: [], roles: [] },
        };
      }
      if (key === `logs_mute_role_${GUILD_ID}`) return null;
      return null;
    },
  };
}

function buildAuditEntry({ targetId, addedRoleId = ADDED_ROLE_ID, executorBot = false }) {
  return {
    createdTimestamp: Date.now(),
    target: { id: targetId },
    executor: { id: EXECUTOR_ID, bot: executorBot },
    changes: [
      {
        key: "$add",
        new: [{ id: addedRoleId, name: "added-role" }],
      },
    ],
  };
}

test("role give protection ignores audit entries for a different target member", async () => {
  const { onGuildMemberUpdate } = loadRoleGiveWithAuditMocks();
  const guild = createGuildWithAuditEntries({
    auditEntries: [buildAuditEntry({ targetId: OTHER_TARGET_ID })],
    executorHasManageRoles: true,
  });
  const { oldMember, newMember, removedRoleIds } = createMemberPair(guild);

  await onGuildMemberUpdate(oldMember, newMember, createDbMock());

  assert.deepEqual(removedRoleIds, []);
});

test("role give protection ignores updates when executor lacks ManageRoles", async () => {
  const { onGuildMemberUpdate } = loadRoleGiveWithAuditMocks();
  const guild = createGuildWithAuditEntries({
    auditEntries: [buildAuditEntry({ targetId: TARGET_ID })],
    executorHasManageRoles: false,
  });
  const { oldMember, newMember, removedRoleIds } = createMemberPair(guild);

  await onGuildMemberUpdate(oldMember, newMember, createDbMock());

  assert.deepEqual(removedRoleIds, []);
});

test("role give protection reverts role when matching manual role give is detected", async () => {
  const { onGuildMemberUpdate } = loadRoleGiveWithAuditMocks();
  const guild = createGuildWithAuditEntries({
    auditEntries: [buildAuditEntry({ targetId: TARGET_ID })],
    executorHasManageRoles: true,
  });
  const { oldMember, newMember, removedRoleIds } = createMemberPair(guild);

  await onGuildMemberUpdate(oldMember, newMember, createDbMock());

  assert.deepEqual(removedRoleIds, [ADDED_ROLE_ID]);
});
