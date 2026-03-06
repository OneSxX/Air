const { EmbedBuilder } = require("discord.js");

function normalizeStatus(status) {
  const value = String(status || "offline").toLowerCase();
  if (value === "online" || value === "idle" || value === "dnd") return value;
  return "offline";
}

function obfuscateForCopy(text) {
  const raw = String(text || "").trim();
  if (!raw) return "-";
  return raw.split("").join("\u200b");
}

function collectTopRoleColors(member, limit = 2) {
  if (!member?.roles?.cache) return [];

  const guildId = String(member?.guild?.id || "").trim();
  const roles = [...member.roles.cache.values()]
    .filter((role) => {
      if (!role) return false;
      if (String(role.id || "").trim() === guildId) return false;
      return Number(role.color || 0) > 0;
    })
    .sort((a, b) => Number(b.position || 0) - Number(a.position || 0));

  const out = [];
  const seen = new Set();
  for (const role of roles) {
    const hex = String(role.hexColor || "").toLowerCase();
    if (!hex || hex === "#000000" || seen.has(hex)) continue;
    seen.add(hex);
    out.push(hex);
    if (out.length >= Math.max(1, limit)) break;
  }

  return out;
}

module.exports = {
  name: "avatar",
  description: "Secilen uyenin avatarini gosterir.",
  async execute(interaction) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }

      if (!interaction.guildId) {
        return interaction.editReply("Bu komut sadece sunucuda calisir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const target = interaction.options?.getUser?.("uye", false) || interaction.user;
      const member =
        interaction.guild?.members?.cache?.get?.(target.id) ||
        await (interaction.guild?.members?.fetch?.(target.id) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
      const avatarUrl = target.displayAvatarURL({ forceStatic: false, size: 4096 });
      const status = normalizeStatus(member?.presence?.status);
      const roleColors = collectTopRoleColors(member, 2);
      if (!roleColors.length) {
        const fallbackHex = String(member?.displayHexColor || "#000000").toLowerCase();
        roleColors.push(fallbackHex || "#000000");
      }
      const roleColorLabel = roleColors.length > 1 ? "RoleColors" : "RoleColor";
      const roleColorValue = roleColors.map((x) => obfuscateForCopy(x)).join("  |  ");
      const embedColor = Number(member?.displayColor || 0) > 0 ? Number(member.displayColor) : 0x2f3136;

      const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(`@${target.username} ${status}`)
        .setDescription(
          `ID: ${obfuscateForCopy(target.id)}\n` +
          `${roleColorLabel}: ${roleColorValue}`
        )
        .setImage(avatarUrl);

      return interaction.editReply({ embeds: [embed] }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("avatar command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Avatar gosterilirken hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Avatar gosterilirken hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
};
