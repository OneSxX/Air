const { PermissionFlagsBits } = require("discord.js");
const marketCommand = require("./market");

function safeReject(interaction, content) {
  if (interaction?.deferred || interaction?.replied) {
    return interaction.editReply(content).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }
  return interaction.reply({ content, ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
}

module.exports = {
  name: "marketyonet",
  description: "Market urunlerini ekler veya siler.",
  async execute(interaction, client) {
    if (!interaction.guildId || !interaction.guild) {
      return safeReject(interaction, "Bu komut sadece sunucuda calisir.");
    }

    const hasPerm =
      interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild) ||
      interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) ||
      interaction.guild?.ownerId === interaction.user?.id;
    if (!hasPerm) {
      return safeReject(interaction, "Bu komut icin `Sunucuyu Yonet` veya `Administrator` yetkisi gerekir.");
    }

    return marketCommand.execute(interaction, client);
  },
};
