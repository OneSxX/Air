const { PermissionFlagsBits } = require("discord.js");

function canManageGuild(interaction) {
  return Boolean(
    interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild) ||
      interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator)
  );
}

module.exports = {
  name: "log",
  description: "Log panelini kurar / gunceller.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      if (!interaction.guildId) {
        return interaction.editReply("Bu komut sadece sunucuda calisir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      if (!canManageGuild(interaction)) {
        return interaction
          .editReply("Bu komut icin Sunucuyu Yonet yetkisi gerekir.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const logs = client.features?.Logs;
      if (!logs) {
        return interaction.editReply("Log sistemi su an yuklu degil.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const cfg = await logs.getConfig(client.db, interaction.guildId);
      await logs.sendOrUpdatePanel(interaction, cfg, { recreate: true });

      return interaction.editReply("Log paneli acildi / guncellendi.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("log command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Log paneli kurulurken hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Log paneli kurulurken hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
};
