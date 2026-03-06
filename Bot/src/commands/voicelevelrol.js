const { PermissionFlagsBits } = require("discord.js");
const { createEmbed } = require("../utils/embed");

function normalizeSubcommand(value) {
  return String(value || "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function fallbackNormalizeRewards(raw) {
  const input = Array.isArray(raw) ? raw : [];
  const byLevel = new Map();
  for (const item of input) {
    const level = Math.floor(Number(item?.level));
    const roleId = String(item?.roleId || "").trim();
    if (!Number.isFinite(level) || level < 1 || level > 10_000) continue;
    if (!/^\d{15,25}$/.test(roleId)) continue;
    byLevel.set(level, { level, roleId });
  }
  return [...byLevel.values()].sort((a, b) => a.level - b.level).slice(0, 250);
}

function buildListEmbed(list) {
  const rows = Array.isArray(list) ? list : [];
  const maxItems = 60;
  const visible = rows.slice(0, maxItems);
  const hiddenCount = rows.length - visible.length;

  let description = "Kayitli voice level rol odulu yok.";
  if (visible.length) {
    description = visible.map((x, i) => `${i + 1}. **Lv.${x.level}** -> <@&${x.roleId}>`).join("\n");
    if (hiddenCount > 0) {
      description += `\n...ve **${hiddenCount}** kayit daha.`;
    }
  }

  return createEmbed()
    .setTitle("Voice Level Rol Listesi")
    .setDescription(description)
    .addFields(
      {
        name: "Silme",
        value: "`/voicelevelrol sil voice_level:<seviye>`",
        inline: false,
      },
      {
        name: "Sifirlama",
        value: "`/voicelevelrol sifirla onay:EVET`",
        inline: false,
      }
    );
}

function parseConfirm(raw) {
  return String(raw || "").trim().toLowerCase() === "evet";
}

module.exports = {
  name: "voicelevelrol",
  description: "Voice level rol odullerini ayarlar.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      if (!interaction.guildId) {
        return interaction.editReply("Bu komut sadece sunucuda calisir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.editReply("Bu komut icin Sunucuyu Yonet yetkisi gerekir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const levelFeature = client.features?.Level;
      if (!levelFeature?.getConfig || !levelFeature?.setConfig) {
        return interaction.editReply("Seviye sistemi su an aktif degil.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const sub = normalizeSubcommand(interaction.options?.getSubcommand?.(true));
      const cfg = await levelFeature.getConfig(client.db, interaction.guildId);
      const normalizeRewards = levelFeature.__private?.normalizeRoleRewards || fallbackNormalizeRewards;
      const current = Array.isArray(cfg?.voiceRoleRewards) ? cfg.voiceRoleRewards : [];

      if (sub === "list") {
        return interaction.editReply({ embeds: [buildListEmbed(current)] }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "sil") {
        const targetLevel = Number(interaction.options?.getInteger?.("voice_level", true) || 0);
        if (!Number.isFinite(targetLevel) || targetLevel < 1 || targetLevel > 10_000) {
          return interaction.editReply("Voice level 1 ile 10000 arasinda olmali.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        const next = normalizeRewards(current.filter((x) => Number(x?.level) !== targetLevel));
        if (next.length === current.length) {
          return interaction.editReply(`Lv.${targetLevel} icin kayitli voice rol odulu yok.`).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        await levelFeature.setConfig(client.db, interaction.guildId, {
          voiceRoleRewards: next,
        });

        return interaction
          .editReply(`Voice level rol odulu silindi: **Lv.${targetLevel}**\nKalan kayit: **${next.length}**`)
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "sifirla") {
        const confirm = String(interaction.options?.getString?.("onay", true) || "");
        if (!parseConfirm(confirm)) {
          return interaction.editReply("Sifirlama icin `onay` degerini `EVET` secmelisin.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        await levelFeature.setConfig(client.db, interaction.guildId, {
          voiceRoleRewards: [],
        });

        return interaction.editReply("Tum voice level rol odulleri sifirlandi.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub !== "ayarla") {
        return interaction
          .editReply("Gecersiz alt komut. `/voicelevelrol ayarla|list|sil|sifirla` kullan.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const role = interaction.options?.getRole?.("rol", true);
      const targetLevel = Number(interaction.options?.getInteger?.("voice_level", true) || 0);

      if (!role?.id) {
        return interaction.editReply("Gecerli bir rol secmelisin.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      if (!Number.isFinite(targetLevel) || targetLevel < 1 || targetLevel > 10_000) {
        return interaction.editReply("Voice level 1 ile 10000 arasinda olmali.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      if (role.id === interaction.guild.roles.everyone.id) {
        return interaction.editReply("@everyone rolu odul olarak ayarlanamaz.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      if (role.managed) {
        return interaction.editReply("Bu rol yonetilen bir rol. Baska bir rol secmelisin.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const me = interaction.guild.members?.me || await (interaction.guild.members.fetchMe() || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
      if (!me?.roles?.highest) {
        return interaction.editReply("Bot rol bilgisine erisemedi.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      if (role.position >= me.roles.highest.position) {
        return interaction
          .editReply("Bu rol botun en yuksek rolune esit/ustte. Bot rolunu yukari tasimalisin.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const next = normalizeRewards([
        ...current.filter((x) => Number(x?.level) !== targetLevel && String(x?.roleId || "") !== role.id),
        { level: targetLevel, roleId: role.id },
      ]);

      await levelFeature.setConfig(client.db, interaction.guildId, {
        voiceRoleRewards: next,
      });

      return interaction.editReply(
        `Voice level rolu ayarlandi.\n` +
        `- Seviye: **${targetLevel}**\n` +
        `- Rol: <@&${role.id}>\n` +
        `- Toplam kayit: **${next.length}**`
      ).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("voicelevelrol command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Voice level rol ayarlanirken hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Voice level rol ayarlanirken hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
};
