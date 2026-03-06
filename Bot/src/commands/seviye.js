const { ChannelType, PermissionFlagsBits } = require("discord.js");

const LEVEL_ELIGIBLE_CHANNEL_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
]);

function isEligibleChannel(channel) {
  return Boolean(channel && LEVEL_ELIGIBLE_CHANNEL_TYPES.has(channel.type));
}

function normalizeSubcommand(value) {
  return String(value || "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

module.exports = {
  name: "seviye",
  description: "Kanallarda seviye kazanimi ac/kapat.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      if (!interaction.guildId) {
        return interaction.editReply("Bu komut sadece sunucuda calisir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.editReply("Bu komutu kullanmak icin Sunucuyu Yonet yetkisi lazim.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const level = client.features?.Level;
      if (!level?.getConfig || !level?.setConfig) {
        return interaction.editReply("Seviye sistemi su an aktif degil.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const subRaw = interaction.options?.getSubcommand?.(true);
      const sub = normalizeSubcommand(subRaw);
      const channel = interaction.options?.getChannel?.("kanal", true);

      if (!isEligibleChannel(channel)) {
        return interaction
          .editReply("Lutfen sadece bir yazi veya ses kanali sec.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const cfg = await level.getConfig(client.db, interaction.guildId);
      const disabledSet = new Set(Array.isArray(cfg?.disabledChannelIds) ? cfg.disabledChannelIds : []);

      if (sub === "kapat") {
        if (disabledSet.has(channel.id)) {
          return interaction.editReply(`Bu kanal zaten kapali: <#${channel.id}>`).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }
        disabledSet.add(channel.id);
        await level.setConfig(client.db, interaction.guildId, {
          disabledChannelIds: [...disabledSet],
        });
        return interaction
          .editReply(`Seviye kazanimi kapatildi: <#${channel.id}> (Toplam kapali kanal: ${disabledSet.size})`)
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub.startsWith("a")) {
        if (!disabledSet.has(channel.id)) {
          return interaction.editReply(`Bu kanal zaten acik: <#${channel.id}>`).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }
        disabledSet.delete(channel.id);
        await level.setConfig(client.db, interaction.guildId, {
          disabledChannelIds: [...disabledSet],
        });
        return interaction
          .editReply(`Seviye kazanimi acildi: <#${channel.id}> (Toplam kapali kanal: ${disabledSet.size})`)
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      return interaction.editReply("Gecersiz alt komut. `/seviye kapat` veya `/seviye ac` kullan.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("seviye command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Seviye kanal ayari guncellenirken hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Seviye kanal ayari guncellenirken hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
};

