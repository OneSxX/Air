const { PermissionFlagsBits } = require("discord.js");

const AUTO_ROLE_KEY = (guildId) => `auto_role_${guildId}`;

module.exports = {
  name: "autorol",
  description: "Sunucuya gelen uyelere otomatik rol verir.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      if (!interaction.guildId) {
        return interaction.editReply("Bu komut sadece sunucuda calisir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const hasPerm =
        interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageRoles) ||
        interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator);
      if (!hasPerm) {
        return interaction.editReply("Bu komut icin Rolleri Yonet yetkisi gerekir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const sub = interaction.options?.getSubcommand?.(false) || "ekle";

      if (sub === "durum") {
        const roleId = await client.db.get(AUTO_ROLE_KEY(interaction.guildId));
        if (!roleId) {
          return interaction
            .editReply("Otomatik rol deaktif. Ayarlamak icin `/autorol ekle` kullan.")
            .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        const role = interaction.guild.roles.cache.get(roleId) || await (interaction.guild.roles.fetch(roleId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
        if (!role) {
          await (client.db.delete(AUTO_ROLE_KEY(interaction.guildId)) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
          return interaction
            .editReply("Otomatik rol kaydi bulundu ama rol silinmis. Ayar sifirlandi.")
            .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        return interaction
          .editReply(
            `Otomatik rol aktif: <@&${role.id}>\n` +
            `Sunucuya yeni gelen uyelere otomatik verilir.\n` +
            `Botlara rol verilmez.`
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "sil") {
        await (client.db.delete(AUTO_ROLE_KEY(interaction.guildId)) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        return interaction.editReply("Otomatik rol sistemi kapatildi.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub !== "ekle") {
        return interaction.editReply("Gecersiz alt komut. /autorol ekle kullan.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const role = interaction.options?.getRole?.("rol", true);
      if (!role) {
        return interaction.editReply("Lutfen bir rol sec.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (role.id === interaction.guild.roles.everyone.id) {
        return interaction.editReply("@everyone rolunu otomatik rol yapamazsin.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (role.managed) {
        return interaction.editReply("Bu rol entegre/yonetilen bir rol. Baska bir rol sec.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const me = interaction.guild.members.me || await (interaction.guild.members.fetch(client.user.id) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
      if (!me) {
        return interaction.editReply("Bot uye bilgisi alinamadi. Tekrar dene.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      if (!me.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
        return interaction
          .editReply("Botun `Rolleri Yonet` yetkisi yok. Once bu yetkiyi vermelisin.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (role.position >= me.roles.highest.position) {
        return interaction
          .editReply("Bu rol botun en yuksek rolunden ustte veya esit. Bot rolunu yukariya tasimalisin.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      await client.db.set(AUTO_ROLE_KEY(interaction.guildId), role.id);

      return interaction
        .editReply(
          `Otomatik rol ayarlandi: <@&${role.id}>\n` +
          `Sunucuya gelen uyelere otomatik verilecek.\n` +
          `Botlara rol verilmeyecek.`
        )
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("autorol command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Otomatik rol ayarlanirken hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Otomatik rol ayarlanirken hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
};
