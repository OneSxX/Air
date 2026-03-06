const test = require("node:test");
const assert = require("node:assert/strict");

const registerVoiceManager = require("../src/features/VoiceManager/voiceManager");

test("isServerOwnerOrAdmin accepts ManageGuild permission", () => {
  const member = {
    id: "100000000000000010",
    guild: { ownerId: "100000000000000099" },
    permissions: {
      has(flag) {
        return String(flag) === "32"; // ManageGuild
      },
    },
  };

  assert.equal(registerVoiceManager.__private.isServerOwnerOrAdmin(member), true);
});

test("canManageRoom and canEditAllowDeny handle missing member safely", () => {
  const data = {
    ownerId: "100000000000000010",
    mods: ["100000000000000011"],
  };

  assert.equal(registerVoiceManager.__private.canManageRoom(null, data), false);
  assert.equal(registerVoiceManager.__private.canEditAllowDeny(null, data), false);
});

test("voice manager slash command is blocked outside guild", async () => {
  let interactionHandler = null;
  const dbCalls = [];
  const replies = [];

  const client = {
    features: {},
    on(eventName, handler) {
      if (eventName === "interactionCreate") {
        interactionHandler = handler;
      }
    },
  };

  const db = {
    get() {
      dbCalls.push("get");
      return Promise.resolve(null);
    },
    set() {
      dbCalls.push("set");
      return Promise.resolve();
    },
    delete() {
      dbCalls.push("delete");
      return Promise.resolve();
    },
  };

  registerVoiceManager(client, db);
  assert.equal(typeof interactionHandler, "function");

  const interaction = {
    commandName: "setup",
    deferred: false,
    replied: false,
    isChatInputCommand() {
      return true;
    },
    isButton() {
      return false;
    },
    isUserSelectMenu() {
      return false;
    },
    isModalSubmit() {
      return false;
    },
    inGuild() {
      return false;
    },
    reply(payload) {
      replies.push(payload);
      this.replied = true;
      return Promise.resolve(payload);
    },
    editReply(payload) {
      replies.push(payload);
      return Promise.resolve(payload);
    },
  };

  await interactionHandler(interaction);

  assert.equal(replies.length, 1);
  assert.equal(String(replies[0]?.content || "").includes("sadece sunucuda"), true);
  assert.equal(dbCalls.length, 0);
});
