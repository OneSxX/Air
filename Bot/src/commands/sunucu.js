const { PermissionFlagsBits } = require("discord.js");

function canManageGuild(interaction) {
  return Boolean(
    interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild) ||
      interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator)
  );
}

module.exports = {
  name: "sunucu",
  description: "Sunucu koruma panelini kurar / gunceller.",
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

      const sub = interaction.options?.getSubcommand?.(false);
      if (sub && sub !== "korumalari") {
        return interaction.editReply("Gecersiz alt komut. /sunucu korumalari kullan.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const { getConfig } = require("../features/Protection/database");
      const { sendOrUpdatePanel } = require("../features/Protection");

      const cfg = await getConfig(client.db, interaction.guildId);
      await sendOrUpdatePanel(interaction, cfg, { recreate: true, only: "server" });

      return interaction.editReply("Sunucu koruma paneli kuruldu / guncellendi.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("sunucu command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Panel kurulurken hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Panel kurulurken hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
};
