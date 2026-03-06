const { PermissionFlagsBits } = require("discord.js");
const tepkirol = require("./tepkirol");

function safeReject(interaction, content) {
  if (interaction?.deferred || interaction?.replied) {
    return interaction.editReply(content).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }
  return interaction.reply({ content, ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
}

module.exports = {
  name: "tepki",
  description: "Tepki rol mesaji kaydi olusturur.",
  async execute(interaction, client) {
    if (!interaction.guildId) {
      return safeReject(interaction, "Bu komut sadece sunucuda calisir.");
    }

    const hasPerm =
      interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageRoles) ||
      interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator);
    if (!hasPerm) {
      return safeReject(interaction, "Bu komut icin `Rolleri Yonet` veya `Administrator` yetkisi gerekir.");
    }

    return tepkirol.execute(interaction, client);
  },
};
