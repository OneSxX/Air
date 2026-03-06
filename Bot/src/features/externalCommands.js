const COMMAND_OWNER_MAP = Object.freeze({
  ticket: "ticket",
  setcreate: "voiceManager",
  setup: "voiceManager",
  panel: "voiceManager",
  voice: "voiceManager",
});

const EXTERNAL_COMMAND_NAMES = Object.freeze(Object.keys(COMMAND_OWNER_MAP));

function normalizeCommandName(commandName) {
  return String(commandName || "").trim().toLowerCase();
}

function getExternalCommandOwner(commandName) {
  const normalized = normalizeCommandName(commandName);
  if (!normalized) return null;
  return COMMAND_OWNER_MAP[normalized] || null;
}

function isExternalFeatureCommand(commandName) {
  return Boolean(getExternalCommandOwner(commandName));
}

function isCommandHandledBy(commandName, owner) {
  return getExternalCommandOwner(commandName) === owner;
}

function listExternalFeatureCommands() {
  return [...EXTERNAL_COMMAND_NAMES];
}

module.exports = {
  normalizeCommandName,
  getExternalCommandOwner,
  isExternalFeatureCommand,
  isCommandHandledBy,
  listExternalFeatureCommands,
};
