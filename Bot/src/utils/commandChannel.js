const { PermissionFlagsBits } = require("discord.js");

const COMMAND_CHANNEL_KEY = (guildId) => `command_channel_cfg_${guildId}`;

function normalizeSnowflake(input) {
  const value = String(input || "").trim();
  return /^\d{15,25}$/.test(value) ? value : "";
}

function normalizeCommandName(input) {
  return String(input || "").trim().toLowerCase();
}

function normalizeBypassSet(commands) {
  const out = new Set();
  for (const name of commands || []) {
    const normalized = normalizeCommandName(name);
    if (normalized) out.add(normalized);
  }
  return out;
}

function normalizeConfig(raw) {
  if (!raw) return { channelId: "", updatedBy: "", updatedAt: 0 };
  if (typeof raw === "string") {
    return {
      channelId: normalizeSnowflake(raw),
      updatedBy: "",
      updatedAt: 0,
    };
  }

  const src = typeof raw === "object" ? raw : {};
  return {
    channelId: normalizeSnowflake(src.channelId),
    updatedBy: normalizeSnowflake(src.updatedBy),
    updatedAt: Number.isFinite(Number(src.updatedAt)) ? Number(src.updatedAt) : 0,
  };
}

function isServerOwnerOrManager(interaction) {
  if (!interaction?.inGuild?.()) return false;
  if (interaction.user?.id && interaction.user.id === interaction.guild?.ownerId) return true;
  return Boolean(
    interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild) ||
      interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator)
  );
}

async function getCommandChannelConfig(db, guildId) {
  const gid = normalizeSnowflake(guildId);
  if (!gid || !db?.get) return { channelId: "", updatedBy: "", updatedAt: 0 };

  const raw = await db.get(COMMAND_CHANNEL_KEY(gid)).catch(() => null);
  return normalizeConfig(raw);
}

async function setCommandChannelConfig(db, guildId, channelId, updatedBy = "") {
  const gid = normalizeSnowflake(guildId);
  const cid = normalizeSnowflake(channelId);
  if (!gid || !cid || !db?.set) return { channelId: "", updatedBy: "", updatedAt: 0 };

  const payload = {
    channelId: cid,
    updatedBy: normalizeSnowflake(updatedBy),
    updatedAt: Date.now(),
  };
  await db.set(COMMAND_CHANNEL_KEY(gid), payload);
  return payload;
}

async function clearCommandChannelConfig(db, guildId) {
  const gid = normalizeSnowflake(guildId);
  if (!gid || !db?.delete) return false;
  await db.delete(COMMAND_CHANNEL_KEY(gid));
  return true;
}

async function checkCommandChannelRestriction(interaction, client, opts = {}) {
  const bypassSet = normalizeBypassSet(opts.bypassCommands || []);
  const allowServerManagers = opts.allowServerManagers !== false;
  if (!interaction?.isChatInputCommand?.()) return { allowed: true, channelId: "" };
  if (!interaction?.inGuild?.()) return { allowed: true, channelId: "" };

  const commandName = normalizeCommandName(interaction.commandName);
  if (!commandName || bypassSet.has(commandName)) return { allowed: true, channelId: "" };
  if (allowServerManagers && isServerOwnerOrManager(interaction)) {
    return { allowed: true, channelId: "" };
  }

  const cfg = await getCommandChannelConfig(client?.db, interaction.guildId);
  const configuredChannelId = normalizeSnowflake(cfg.channelId);
  if (!configuredChannelId) return { allowed: true, channelId: "" };

  const currentChannelId = normalizeSnowflake(interaction.channelId);
  if (configuredChannelId === currentChannelId) return { allowed: true, channelId: configuredChannelId };

  return { allowed: false, channelId: configuredChannelId };
}

function buildCommandChannelBlockedMessage(channelId) {
  const cid = normalizeSnowflake(channelId);
  if (!cid) return "Bu sunucuda komutlar belirli bir komut odasina sinirli.";
  return `Bu komut sadece <#${cid}> kanalinda kullanilabilir.`;
}

module.exports = {
  COMMAND_CHANNEL_KEY,
  normalizeSnowflake,
  normalizeCommandName,
  isServerOwnerOrManager,
  getCommandChannelConfig,
  setCommandChannelConfig,
  clearCommandChannelConfig,
  checkCommandChannelRestriction,
  buildCommandChannelBlockedMessage,
};
