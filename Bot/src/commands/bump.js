const { PermissionFlagsBits } = require("discord.js");

function parseRoleIdsFromInput(rawInput) {
  const raw = String(rawInput || "").trim();
  if (!raw) return [];

  const out = [];
  const seen = new Set();

  const mentionMatches = [...raw.matchAll(/<@&(\d{15,25})>/g)];
  for (const match of mentionMatches) {
    const id = String(match?.[1] || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  const idMatches = raw.match(/\b\d{15,25}\b/g) || [];
  for (const item of idMatches) {
    const id = String(item || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out;
}

module.exports = {
  name: "bump",
  description: "Bump reminder ayarlari.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      if (!interaction.guildId || !interaction.guild) {
        return interaction.editReply("Bu komut sadece sunucuda calisir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      const hasPerm =
        interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild) ||
        interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator);
      if (!hasPerm) {
        return interaction
          .editReply("Bu komut icin `Sunucuyu Yonet` veya `Administrator` yetkisi gerekir.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const sub = interaction.options?.getSubcommand?.(false);
      if (sub !== "remind") {
        return interaction.editReply("Gecersiz alt komut. `/bump remind` kullan.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const reminderFeature = client.features?.Reminder;
      if (!reminderFeature?.setBumpReminder) {
        return interaction.editReply("Bump reminder sistemi su an yuklu degil.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      const enabled = reminderFeature.isBumpReminderEnabled
        ? await reminderFeature.isBumpReminderEnabled(client.db, interaction.guildId)
        : true;
      if (!enabled) {
        return interaction
          .editReply("Bump remind sistemi kapali. Once `/bumpremind on` kullan.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const message = String(interaction.options?.getString?.("mesaj", true) || "").trim();
      const roleInput = String(interaction.options?.getString?.("roller", true) || "").trim();

      if (!message) {
        return interaction.editReply("Mesaj bos olamaz.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      if (message.length > 1700) {
        return interaction.editReply("Mesaj en fazla 1700 karakter olabilir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const parsedRoleIds = parseRoleIdsFromInput(roleInput);
      if (!parsedRoleIds.length) {
        return interaction
          .editReply("En az bir rol mentioni veya rol ID yazmalisin. Ornek: `<@&ROL_ID> <@&ROL_ID>`")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const validRoleIds = [];
      let includesEveryone = false;
      for (const roleId of parsedRoleIds) {
        const role =
          interaction.guild.roles?.cache?.get?.(roleId) ||
          await (interaction.guild.roles?.fetch?.(roleId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
        if (!role?.id) continue;
        if (String(role.id) === String(interaction.guild.id)) {
          includesEveryone = true;
          continue;
        }
        validRoleIds.push(role.id);
      }

      if (includesEveryone) {
        return interaction
          .editReply("`@everyone` rolunu bump hatirlatmasinda kullanamazsin.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (!validRoleIds.length) {
        return interaction
          .editReply("Gecersiz rol girdisi. Sadece bu sunucudaki rolleri kullanabilirsin.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const result = await reminderFeature.setBumpReminder(client, {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        authorId: interaction.user.id,
        message,
        roleIds: validRoleIds,
      });

      const mentions = validRoleIds.map((id) => `<@&${id}>`).join(" ");
      const pendingText = result?.pending?.dueAt
        ? `${`<t:${Math.floor(result.pending.dueAt / 1000)}:F>`} (${`<t:${Math.floor(result.pending.dueAt / 1000)}:R>`})`
        : "Ilk bump mesaji geldikten sonra otomatik zamanlanacak.";
      const botText = result?.config?.bumpBotId
        ? `<@${result.config.bumpBotId}>`
        : "Ilk bump bot mesaji geldikten sonra otomatik algilanacak.";

      return interaction
        .editReply(
          `Bump remind ayarlandi.\n` +
          `- Kanal: <#${interaction.channelId}>\n` +
          `- Roller: ${mentions}\n` +
          `- Bump bot: ${botText}\n` +
          `- Sonraki hatirlatma: ${pendingText}\n` +
          `- Dongu: **2 saat (veya bump mesajindan algilanan sure) araliklarla surekli**`
        )
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("bump command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Bump komutu calisirken hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Bump komutu calisirken hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
};
