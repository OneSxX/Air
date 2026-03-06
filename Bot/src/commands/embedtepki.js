const { PermissionFlagsBits } = require("discord.js");

function canManageReactionRoles(interaction) {
  return (
    interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageRoles) ||
    interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator)
  );
}

function normalizeSub(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0131/g, "i");
}

function normalizeMultiline(value) {
  return String(value || "")
    .replace(/\[(satir|sat\u0131r)\]/giu, "\n")
    .trim();
}

module.exports = {
  name: "embedtepki",
  description: "Embed tepki rol kayitlarini yonetir.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      if (!interaction.guildId) {
        return interaction.editReply("Bu komut sadece sunucuda calisir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (!canManageReactionRoles(interaction)) {
        return interaction
          .editReply("Bu komut icin Rolleri Yonet yetkisi gerekir.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const feature = client.features?.ReactionRole || require("../features/ReactionRole");
      const sub = normalizeSub(interaction.options?.getSubcommand?.(false) || "");
      if (!["rol", "kucukresim", "buyukresim", "at", "sil"].includes(sub)) {
        return interaction
          .editReply("Gecersiz alt komut. `/embedtepki rol|kucukresim|buyukresim|at|sil` kullan.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "rol") {
        const name = String(interaction.options?.getString?.("isim", true) || "").trim();
        const title = String(interaction.options?.getString?.("baslik", true) || "").trim();
        const description = normalizeMultiline(interaction.options?.getString?.("mesaj", true));
        const footer = String(interaction.options?.getString?.("alt", true) || "").trim();
        const emoji = String(interaction.options?.getString?.("emoji", false) || "\u2705").trim();
        const role = interaction.options?.getRole?.("rol", true);
        if (!role?.id) {
          return interaction.editReply("Gecerli bir rol sec.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        const template = await feature.upsertEmbedTemplate(client.db, interaction.guildId, {
          name,
          embedName: name,
          title,
          description,
          footer,
          roleId: role.id,
          emoji,
          updatedBy: interaction.user.id,
        });

        return interaction
          .editReply(
            `Embed tepki rol kaydi olusturuldu.\n` +
            `- Isim: **${template.name}**\n` +
            `- Rol: <@&${template.roleId}>\n` +
            `- Emoji: ${template.emojiDisplay}\n` +
            `Mesaji gondermek icin: \`/embedtepki at\``
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "kucukresim") {
        const name = String(interaction.options?.getString?.("isim", true) || "").trim();
        const link = String(interaction.options?.getString?.("link", true) || "").trim();
        const template = await feature.updateEmbedImages(client.db, interaction.guildId, {
          name,
          smallImageUrl: link,
          updatedBy: interaction.user.id,
        });
        return interaction
          .editReply(
            `Embed tepki kucuk resim guncellendi.\n` +
            `- Isim: **${template.name}**\n` +
            `- Kucuk resim: ${template.smallImageUrl || "Yok"}`
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "buyukresim") {
        const name = String(interaction.options?.getString?.("isim", true) || "").trim();
        const link = String(interaction.options?.getString?.("link", true) || "").trim();
        const template = await feature.updateEmbedImages(client.db, interaction.guildId, {
          name,
          largeImageUrl: link,
          updatedBy: interaction.user.id,
        });
        return interaction
          .editReply(
            `Embed tepki buyuk resim guncellendi.\n` +
            `- Isim: **${template.name}**\n` +
            `- Buyuk resim: ${template.largeImageUrl || "Yok"}`
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "at") {
        const name = String(interaction.options?.getString?.("isim", true) || "").trim();
        const sent = await feature.postTemplate(client, interaction.guildId, interaction.channelId, name);
        return interaction
          .editReply(
            `Embed tepki mesaji gonderildi.\n` +
            `- Isim: **${sent.template.name}**\n` +
            `- Kanal: <#${sent.channelId}>\n` +
            `- Mesaj: ${sent.jumpUrl}`
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const name = String(interaction.options?.getString?.("isim", true) || "").trim();
      const result = await feature.deleteTemplate(client.db, interaction.guildId, name);
      if (!result.removedTemplate) {
        return interaction
          .editReply("Bu isimde embed tepki kaydi bulunamadi.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      return interaction
        .editReply(
          `Embed tepki kaydi silindi.\n` +
          `- Silinen aktif mesaj baglantisi: **${result.removedActiveCount}**`
        )
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("embedtepki command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Embed tepki komutunda hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Embed tepki komutunda hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
};
