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

module.exports = {
  name: "tepkirol",
  description: "Tepki rol kaydi olusturur, atar veya siler.",
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
      if (!["rol", "at", "sil"].includes(sub)) {
        return interaction
          .editReply("Gecersiz alt komut. `/tepkirol rol|at|sil` kullan.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "rol") {
        const name = String(interaction.options?.getString?.("isim", true) || "").trim();
        const message = String(interaction.options?.getString?.("mesaj", true) || "").trim();
        const emoji = String(interaction.options?.getString?.("emoji", true) || "").trim();
        const role = interaction.options?.getRole?.("rol", true);
        if (!role?.id) {
          return interaction.editReply("Gecerli bir rol sec.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        const template = await feature.upsertTextTemplate(client.db, interaction.guildId, {
          name,
          message,
          emoji,
          roleId: role.id,
          updatedBy: interaction.user.id,
        });

        return interaction
          .editReply(
            `Tepki rol kaydi olusturuldu.\n` +
            `- Isim: **${template.name}**\n` +
            `- Rol: <@&${template.roleId}>\n` +
            `- Emoji: ${template.emojiDisplay}\n` +
            `- Mesaj: ${template.message}\n` +
            `Mesaji gondermek icin: \`/tepkirol at\``
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "at") {
        const name = String(interaction.options?.getString?.("isim", true) || "").trim();
        const sent = await feature.postTemplate(client, interaction.guildId, interaction.channelId, name);
        return interaction
          .editReply(
            `Tepki rol mesaji gonderildi.\n` +
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
          .editReply("Bu isimde tepki rol kaydi bulunamadi.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      return interaction
        .editReply(
          `Tepki rol kaydi silindi.\n` +
          `- Silinen aktif mesaj baglantisi: **${result.removedActiveCount}**`
        )
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("tepkirol command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Tepki rol komutunda hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Tepki rol komutunda hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
};
