const { ChannelType } = require("discord.js");
const {
  isServerOwnerOrManager,
  getCommandChannelConfig,
  setCommandChannelConfig,
  clearCommandChannelConfig,
} = require("../utils/commandChannel");

function isValidCommandChannel(channel) {
  const type = Number(channel?.type);
  return type === ChannelType.GuildText || type === ChannelType.GuildAnnouncement;
}

module.exports = {
  name: "komutoda",
  description: "Komutlarin kullanilacagi kanali ayarlar.",
  async execute(interaction, client) {
    try {
      if (!interaction?.inGuild?.()) {
        return interaction
          .reply({ content: "Bu komut sadece sunucuda kullanilabilir.", ephemeral: true })
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      await interaction.deferReply({ ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

      if (!isServerOwnerOrManager(interaction)) {
        return interaction
          .editReply("Bu komutu sadece sunucu sahibi veya `Sunucuyu Yonet` yetkisi olanlar kullanabilir.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const sub = String(interaction.options?.getSubcommand?.(false) || "durum")
        .trim()
        .toLowerCase();

      if (sub === "durum") {
        const cfg = await getCommandChannelConfig(client?.db, interaction.guildId);
        if (!cfg?.channelId) {
          return interaction
            .editReply("Komut odasi ayarlanmamis. Ayarlamak icin `/komutoda belirle kanal:#kanal` kullan.")
            .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        const actor = cfg.updatedBy ? `<@${cfg.updatedBy}>` : "Bilinmiyor";
        const when = cfg.updatedAt ? `<t:${Math.floor(Number(cfg.updatedAt) / 1000)}:R>` : "Bilinmiyor";
        return interaction
          .editReply(
            `Komut odasi: <#${cfg.channelId}>\nSon guncelleyen: ${actor}\nSon guncelleme: ${when}`
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "belirle") {
        const channel = interaction.options?.getChannel?.("kanal", true);
        if (!isValidCommandChannel(channel)) {
          return interaction
            .editReply("Komut odasi sadece yazi veya duyuru kanali olabilir.")
            .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        const cfg = await setCommandChannelConfig(client?.db, interaction.guildId, channel.id, interaction.user?.id);
        if (!cfg?.channelId) {
          return interaction
            .editReply("Komut odasi ayarlanamadi. Veritabani erisimi kontrol et.")
            .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        return interaction
          .editReply(`Komut odasi ayarlandi: <#${cfg.channelId}>`)
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "sifirla") {
        await clearCommandChannelConfig(client?.db, interaction.guildId).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        return interaction
          .editReply("Komut odasi kisiti kaldirildi. Komutlar tum kanallarda kullanilabilir.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      return interaction
        .editReply("Gecersiz alt komut. `/komutoda belirle|durum|sifirla` kullan.")
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("komutoda command error:", err);
      if (interaction?.deferred && !interaction?.replied) {
        return interaction
          .editReply("Komut odasi ayarlanirken hata olustu.")
          .catch((e) => { globalThis.__airWarnSuppressedError?.(e); });
      }
      if (!interaction?.deferred && !interaction?.replied) {
        return interaction
          .reply({ content: "Komut odasi ayarlanirken hata olustu.", ephemeral: true })
          .catch((e) => { globalThis.__airWarnSuppressedError?.(e); });
      }
      return interaction
        .followUp({ content: "Komut odasi ayarlanirken hata olustu.", ephemeral: true })
        .catch((e) => { globalThis.__airWarnSuppressedError?.(e); });
    }
  },
};
