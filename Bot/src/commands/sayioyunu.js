const { ChannelType, PermissionFlagsBits } = require("discord.js");

function canManageNumberGame(interaction) {
  return (
    interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator)
  );
}

function normalizeSubcommandName(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0131/g, "i");
}

module.exports = {
  name: "sayioyunu",
  description: "Sayi oyununu kurar, kapatir ve durumunu gosterir.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      if (!interaction.guildId) {
        return interaction.editReply("Bu komut sadece sunucuda calisir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (!canManageNumberGame(interaction)) {
        return interaction
          .editReply("Bu komut icin Sunucuyu Yonet yetkisi gerekir.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const rawSub = interaction.options?.getSubcommand?.(false) || "kur";
      const sub = normalizeSubcommandName(rawSub);
      if (!["kur", "off", "durum"].includes(sub)) {
        return interaction
          .editReply("Gecersiz alt komut. `/sayioyunu kur|off|durum` kullan.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const game = client.features?.NumberGame || require("../features/NumberGame");

      if (sub === "durum") {
        const cfg = await game.getConfig(client.db, interaction.guildId);
        if (!cfg?.channelId) {
          return interaction
            .editReply("Sayi oyunu kurulmamis. `/sayioyunu kur` ile baslat.")
            .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        const status = cfg.enabled ? "Acik" : "Kapali";
        return interaction
          .editReply(
            `Sayi oyunu durumu: **${status}**\n` +
            `- Kanal: <#${cfg.channelId}>\n` +
            `- Beklenen sayi: **${String(cfg.expectedNumber || "1")}**`
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "off") {
        const cfg = await game.getConfig(client.db, interaction.guildId);
        if (!cfg?.channelId) {
          return interaction
            .editReply("Sayi oyunu zaten kurulu degil.")
            .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        await game.setConfig(client.db, interaction.guildId, {
          enabled: false,
          updatedBy: interaction.user.id,
        });

        return interaction
          .editReply("Sayi oyunu kapatildi. Tekrar baslatmak icin `/sayioyunu kur` kullan.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const channel = interaction.options?.getChannel?.("oda", true);
      if (!channel || !channel.isTextBased?.()) {
        return interaction.editReply("Lutfen metin tabanli bir kanal sec.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const allowedTypes = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement]);
      if (!allowedTypes.has(channel.type)) {
        return interaction
          .editReply("Sayi oyunu sadece metin/duyuru kanalinda kurulabilir.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      await game.restartGame(client, interaction.guildId, channel.id, interaction.user.id);

      await channel
        .send(
          "⊹ ︶︶︶︶︶︶ ୨♡୧ ︶︶︶︶︶︶⊹\n" +
          "**Sayı oyunu basladı**\n" +
          "・Ilk sayi: 1\n" +
          "・Kurallar: Sadece siradaki sayiyi yaz.\n" +
          "・Sıra bozan sayı ve alakasız mesajlar silinir."
        )
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

      return interaction
        .editReply(
          `Sayi oyunu kanali ayarlandi: <#${channel.id}>\n` +
          "Sayi dizisi 1'den baslatildi."
        )
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("sayioyunu command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Sayi oyunu kurulurken hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Sayi oyunu kurulurken hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
};
