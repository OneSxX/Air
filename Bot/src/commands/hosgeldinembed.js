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
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0131/g, "i");
}

function normalizeDescriptionInput(value) {
  return String(value || "")
    .replace(/\[(satir|sat\u0131r)\]/giu, "\n")
    .trim();
}

module.exports = {
  name: "hosgeldinembed",
  description: "Hos geldin embed ayarlarini yapar.",
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

      const welcome = client.features?.Welcome || require("../features/Welcome");
      const rawSub = interaction.options?.getSubcommand?.(false);
      const sub = normalizeSubcommandName(rawSub);
      if (!sub || !["basligi", "aciklama", "fotograf", "renk"].includes(sub)) {
        return interaction
          .editReply("Gecersiz alt komut. /hosgeldinembed basligi|aciklama|fotograf|renk kullan.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "basligi") {
        const title = String(interaction.options?.getString?.("mesaj", true) || "").trim();
        if (!title) {
          return interaction.editReply("Embed basligi bos olamaz.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        await welcome.setConfig(client.db, interaction.guildId, {
          enabled: true,
          channelId: interaction.channelId,
          embedTitle: title,
          updatedBy: interaction.user.id,
        });

        return interaction
          .editReply(`Hos geldin embed basligi guncellendi: **${title}**`)
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "aciklama") {
        const raw = String(interaction.options?.getString?.("mesaj", true) || "").trim();
        const description = normalizeDescriptionInput(raw);
        if (!description) {
          return interaction.editReply("Embed aciklamasi bos olamaz.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        await welcome.setConfig(client.db, interaction.guildId, {
          enabled: true,
          channelId: interaction.channelId,
          embedDescription: description,
          updatedBy: interaction.user.id,
        });

        return interaction
          .editReply("Hos geldin embed aciklamasi guncellendi. `[satir]` ve `[sat\u0131r]` satir atlama olarak desteklenir.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "renk") {
        const rawColor = String(interaction.options?.getString?.("renk", true) || "").trim();
        const color = welcome.__private.normalizeEmbedColor(rawColor);
        if (color == null) {
          return interaction
            .editReply("Gecerli bir renk kodu gir. Ornek: `#ff6600`, `ff6600`, `0xff6600`")
            .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        await welcome.setConfig(client.db, interaction.guildId, {
          enabled: true,
          channelId: interaction.channelId,
          embedColor: color,
          updatedBy: interaction.user.id,
        });

        const hex = `#${color.toString(16).padStart(6, "0").toUpperCase()}`;
        return interaction
          .editReply(`Hos geldin embed rengi guncellendi: **${hex}**`)
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const imageUrl = String(interaction.options?.getString?.("link", true) || "").trim();
      const normalizedImageUrl = welcome.__private.normalizeImageUrl(imageUrl);
      if (!normalizedImageUrl) {
        return interaction
          .editReply("Gecerli bir gorsel linki gir. Ornek: https://site.com/foto.jpg")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      await welcome.setConfig(client.db, interaction.guildId, {
        enabled: true,
        channelId: interaction.channelId,
        embedImageUrl: normalizedImageUrl,
        updatedBy: interaction.user.id,
      });

      return interaction
        .editReply("Hos geldin embed gorseli guncellendi.")
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("hosgeldinembed command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Hos geldin embed ayari guncellenirken hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Hos geldin embed ayari guncellenirken hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
};
