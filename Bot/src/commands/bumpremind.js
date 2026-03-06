const { PermissionFlagsBits } = require("discord.js");

function canManageBumpRemind(interaction) {
  return (
    interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator)
  );
}

module.exports = {
  name: "bumpremind",
  description: "Bump remind sistemini ac/kapat ve durumunu goster.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      if (!interaction.guildId) {
        return interaction.editReply("Bu komut sadece sunucuda calisir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (!canManageBumpRemind(interaction)) {
        return interaction
          .editReply("Bu komut icin Sunucuyu Yonet yetkisi gerekir.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const reminder = client.features?.Reminder;
      if (!reminder?.setBumpReminderEnabled) {
        return interaction.editReply("Bump remind sistemi su an yuklu degil.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const sub = String(interaction.options?.getSubcommand?.(false) || "").trim().toLowerCase();
      if (sub !== "on" && sub !== "off" && sub !== "durum") {
        return interaction
          .editReply("Gecersiz alt komut. `/bumpremind on|off|durum` kullan.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "durum") {
        const state = reminder.getBumpReminder
          ? await reminder.getBumpReminder(client, interaction.guildId)
          : { enabled: false, config: null, pending: null };

        const enabledLabel = state?.enabled === false ? "Kapali" : "Acik";
        const channelText = state?.config?.channelId ? `<#${state.config.channelId}>` : "-";
        const rolesText = Array.isArray(state?.config?.roleIds) && state.config.roleIds.length
          ? state.config.roleIds.map((id) => `<@&${id}>`).join(" ")
          : "-";
        const nextText = state?.pending?.dueAt
          ? `<t:${Math.floor(state.pending.dueAt / 1000)}:F> (<t:${Math.floor(state.pending.dueAt / 1000)}:R>)`
          : "-";

        return interaction
          .editReply(
            `Bump remind durumu: **${enabledLabel}**\n` +
            `- Kanal: ${channelText}\n` +
            `- Roller: ${rolesText}\n` +
            `- Sonraki hatirlatma: ${nextText}`
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "off") {
        await reminder.setBumpReminderEnabled(client, interaction.guildId, false, {
          clearConfig: true,
        });
        return interaction
          .editReply(
            "Bump remind kapatildi.\n" +
            "- Tum aktif bump timerlari durduruldu.\n" +
            "- Ayarlar sifirlandi.\n" +
            "- Tekrar kurmak icin once `/bumpremind on`, sonra `/bump remind` kullan."
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      await reminder.setBumpReminderEnabled(client, interaction.guildId, true);
      return interaction
        .editReply(
          "Bump remind acildi.\n" +
          "Yeniden kurulum icin `/bump remind` komutunu kullan."
        )
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("bumpremind command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("BumpRemind komutu calisirken hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "BumpRemind komutu calisirken hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
};
