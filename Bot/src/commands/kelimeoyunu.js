const { ChannelType, PermissionFlagsBits } = require("discord.js");

function canManageWordGame(interaction) {
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
  name: "kelimeoyunu",
  description: "Kelime oyununu kurar, kapatir ve durumunu gosterir.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      if (!interaction.guildId) {
        return interaction.editReply("Bu komut sadece sunucuda calisir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (!canManageWordGame(interaction)) {
        return interaction
          .editReply("Bu komut icin Sunucuyu Yonet yetkisi gerekir.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const rawSub = interaction.options?.getSubcommand?.(false) || "kur";
      const sub = normalizeSubcommandName(rawSub);
      if (!["kur", "off", "durum"].includes(sub)) {
        return interaction
          .editReply("Gecersiz alt komut. `/kelimeoyunu kur|off|durum` kullan.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const game = client.features?.WordGame || require("../features/WordGame");

      if (sub === "durum") {
        const cfg = await game.getConfig(client.db, interaction.guildId);
        if (!cfg?.channelId) {
          return interaction
            .editReply("Kelime oyunu kurulmamis. `/kelimeoyunu kur` ile baslat.")
            .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        const status = cfg.enabled ? "Acik" : "Kapali";
        return interaction
          .editReply(
            `Kelime oyunu durumu: **${status}**\n` +
            `- Kanal: <#${cfg.channelId}>\n` +
            `- Beklenen harf: **${String(cfg.expectedLetter || "-").toUpperCase()}**\n` +
            `- Tur: **${Number(cfg.round || 1)}**\n` +
            `- Tur icinde kullanilan kelime: **${Array.isArray(cfg.usedWords) ? cfg.usedWords.length : 0}**`
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "off") {
        const cfg = await game.getConfig(client.db, interaction.guildId);
        if (!cfg?.channelId) {
          return interaction
            .editReply("Kelime oyunu zaten kurulu degil.")
            .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        await game.setConfig(client.db, interaction.guildId, {
          enabled: false,
          updatedBy: interaction.user.id,
        });

        return interaction
          .editReply("Kelime oyunu kapatildi. Tekrar baslatmak icin `/kelimeoyunu kur` kullan.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const channel = interaction.options?.getChannel?.("oda", true);
      if (!channel || !channel.isTextBased?.()) {
        return interaction.editReply("Lutfen metin tabanli bir kanal sec.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const allowedTypes = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement]);
      if (!allowedTypes.has(channel.type)) {
        return interaction
          .editReply("Kelime oyunu sadece metin/duyuru kanalinda kurulabilir.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const next = await game.restartGame(client, interaction.guildId, channel.id, interaction.user.id);
      const firstLetter =
        String(next?.expectedLetter || "a").trim().toLocaleLowerCase("tr-TR") || "a";

      await channel
        .send(
          `⊹ ︶︶︶︶︶︶ ୨♡୧ ︶︶︶︶︶︶⊹\n` +
          `**Kelime oyunu basladı**\n` +
          `・ilk harf: ${firstLetter}\n` +
          `・Kurallar: kelime TDK'de olmali.\n` +
          `・Sonraki kelime onceki kelimenin son harfiyle baslar.\n` +
          `・Tur icinde kullanilan kelime tekrar kullanilamaz.\n` +
          `・ğ ile biten kelime turu bitirir ve yazana 0.1 coin verir.`
        )
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

      return interaction
        .editReply(
          `Kelime oyunu kanali ayarlandi: <#${channel.id}>\n` +
          `Yeni tur baslatildi, ilk harf: **${firstLetter}**`
        )
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("kelimeoyunu command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Kelime oyunu kurulurken hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Kelime oyunu kurulurken hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
};
