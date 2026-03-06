const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { getUserCases } = require("../features/Moderation/caseStore");

function formatTimestamp(ts) {
  const n = Number(ts || 0);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return `<t:${Math.floor(n / 1000)}:f>`;
}

function formatCaseLine(item) {
  const reason = String(item.reason || "Belirtilmedi")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);

  const duration = Number(item.durationMs || 0);
  const durationLine = duration > 0 ? ` | Sure: ${Math.round(duration / 60000)}m` : "";
  const statusLine = item.success === false ? " | Durum: basarisiz" : "";

  return (
    `**#${item.id}** [${item.type}] - ${formatTimestamp(item.createdAt)}\n` +
    `Yetkili: <@${item.moderatorId}>${durationLine}${statusLine}\n` +
    `Sebep: ${reason}`
  );
}

module.exports = {
  name: "sicil",
  description: "Kullanicinin case kayitlarini gosterir.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      if (!interaction.guildId) {
        return interaction.editReply("Bu komut sadece sunucuda calisir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const canViewRecord =
        interaction.guild?.ownerId === interaction.user.id ||
        interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) ||
        interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild);
      if (!canViewRecord) {
        return interaction.editReply("Bu komut sadece yetkililere aciktir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const target = interaction.options?.getUser?.("uye", false) || interaction.user;
      const cases = await getUserCases(client.db, interaction.guildId, target.id);
      const top = cases.slice(0, 10);

      const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setTitle(`${target.username} - Sicil`)
        .setDescription(
          top.length
            ? top.map(formatCaseLine).join("\n\n")
            : "Bu kullanici icin case kaydi yok."
        )
        .setFooter({
          text: `Toplam case: ${cases.length} | Gosterilen: ${top.length}`,
        })
        .setTimestamp(Date.now());

      return interaction.editReply({ embeds: [embed] }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("sicil command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Sicil gosterilirken hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Sicil gosterilirken hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
};
