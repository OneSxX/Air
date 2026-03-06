const { PermissionFlagsBits } = require("discord.js");

function canManageWelcome(interaction) {
  return (
    interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator)
  );
}

function normalizeSubcommandName(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/\u0131/g, "i");
}

module.exports = {
  name: "hosgeldin",
  description: "Hos geldin ust mesaj ayarlarini yapar.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      if (!interaction.guildId) {
        return interaction.editReply("Bu komut sadece sunucuda calisir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (!canManageWelcome(interaction)) {
        return interaction
          .editReply("Bu komut icin Sunucuyu Yonet yetkisi gerekir.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const rawSub = interaction.options?.getSubcommand?.(false) || "mesaji";
      const sub = normalizeSubcommandName(rawSub);
      if (!["mesaji", "ping"].includes(sub)) {
        return interaction
          .editReply("Gecersiz alt komut. /hosgeldin mesaji veya /hosgeldin ping kullan.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const welcome = client.features?.Welcome || require("../features/Welcome");
      const currentCfg = await welcome.getConfig(client.db, interaction.guildId);

      if (sub === "ping") {
        const selectedChannel = interaction.options?.getChannel?.("oda", true);
        if (!selectedChannel?.isTextBased?.() || typeof selectedChannel.send !== "function") {
          return interaction
            .editReply("Lutfen mesaj atilabilen bir metin kanali sec.")
            .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        await welcome.setConfig(client.db, interaction.guildId, {
          enabled: true,
          channelId: selectedChannel.id,
          updatedBy: interaction.user.id,
        });

        return interaction
          .editReply(`Hos geldin mesaji kanali guncellendi: <#${selectedChannel.id}>`)
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const template = String(interaction.options?.getString?.("mesaj", true) || "").trim();
      if (!template) {
        return interaction.editReply("Mesaj bos olamaz.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      if (!/\[user\]/i.test(template)) {
        return interaction
          .editReply("Mesajda `[user]` etiketi bulunmali. Ornek: `Hos geldin [user]`")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const nextCfg = await welcome.setConfig(client.db, interaction.guildId, {
        enabled: true,
        channelId: currentCfg.channelId || interaction.channelId,
        topMessageTemplate: template,
        updatedBy: interaction.user.id,
      });

      return interaction
        .editReply(
          `Hos geldin ust mesaji guncellendi.\n` +
          `- Kanal: <#${interaction.channelId}>\n` +
          `- Mesaj: ${nextCfg.topMessageTemplate}`
        )
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("hosgeldin command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Hos geldin ayari guncellenirken hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Hos geldin ayari guncellenirken hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
};
