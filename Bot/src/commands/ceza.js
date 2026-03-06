const { PermissionFlagsBits } = require("discord.js");
const { createCase } = require("../features/Moderation/caseStore");
const { canModerateTarget, canBotAffectTarget } = require("../features/Moderation/permissions");

const ALLOWED_ACTIONS = new Set(["timeout", "kick", "ban"]);
const ACTION_REQUIRED_PERMISSION = Object.freeze({
  timeout: PermissionFlagsBits.ModerateMembers,
  kick: PermissionFlagsBits.KickMembers,
  ban: PermissionFlagsBits.BanMembers,
});

function hasPerm(interaction, permission) {
  return interaction.memberPermissions?.has?.(permission);
}

function canUsePunish(interaction, action) {
  if (hasPerm(interaction, PermissionFlagsBits.Administrator)) return true;
  const required = ACTION_REQUIRED_PERMISSION[action];
  if (!required) return false;
  return hasPerm(interaction, required);
}

function getRequiredPermissionLabel(action) {
  if (action === "timeout") return "Kullanicilari Zaman Asimina Alma";
  if (action === "kick") return "Uyeleri At";
  if (action === "ban") return "Uyeleri Yasakla";
  return "ilgili";
}

function parseDurationToMs(input) {
  const raw = String(input || "")
    .trim()
    .toLowerCase();
  const m = raw.match(/^(\d+)\s*([mhdw])$/);
  if (!m) return null;

  const amount = parseInt(m[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = m[2];
  const multi =
    unit === "m" ? 60_000 :
    unit === "h" ? 3_600_000 :
    unit === "d" ? 86_400_000 :
    604_800_000;

  const ms = amount * multi;
  const max = 28 * 24 * 60 * 60 * 1000;
  if (ms > max) return null;
  return ms;
}

function formatDuration(ms) {
  const value = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  if (!value) return "0s";
  if (value % 3600 === 0) return `${Math.floor(value / 3600)}h`;
  if (value % 60 === 0) return `${Math.floor(value / 60)}m`;
  return `${value}s`;
}

async function getBotMember(guild) {
  if (!guild?.members) return null;
  if (guild.members.me) return guild.members.me;
  if (typeof guild.members.fetchMe === "function") {
    return guild.members.fetchMe().catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  }
  return null;
}

async function applyPunish(guild, member, targetUser, action, durationMs, reason) {
  try {
    if (action === "timeout") {
      if (!member) return { ok: false, detail: "Timeout icin uye bulunamadi." };
      await member.timeout(durationMs, reason);
      return { ok: true, detail: `timeout (${formatDuration(durationMs)})` };
    }
    if (action === "kick") {
      if (!member) return { ok: false, detail: "Kick icin uye bulunamadi." };
      await member.kick(reason);
      return { ok: true, detail: "kick" };
    }
    if (action === "ban") {
      await guild.members.ban(targetUser.id, { reason });
      return { ok: true, detail: "ban" };
    }
    return { ok: false, detail: "Desteklenmeyen ceza tipi." };
  } catch (err) {
    return { ok: false, detail: "Islem uygulanamadi." };
  }
}

module.exports = {
  name: "ceza",
  description: "Kullaniciya timeout, kick veya ban uygular ve case acar.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      if (!interaction.guildId) {
        return interaction.editReply("Bu komut sadece sunucuda calisir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const action = String(interaction.options?.getString?.("islem", true) || "")
        .trim()
        .toLowerCase();
      const target = interaction.options?.getUser?.("uye", true);
      const reason = String(interaction.options?.getString?.("sebep", true) || "").trim();
      const sure = String(interaction.options?.getString?.("sure", false) || "").trim();

      if (!target || !reason) {
        return interaction.editReply("Uye ve sebep zorunludur.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      if (!ALLOWED_ACTIONS.has(action)) {
        return interaction.editReply("Gecersiz ceza tipi. Sadece timeout/kick/ban kullan.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      if (!canUsePunish(interaction, action)) {
        return interaction
          .editReply(
            `\`${action}\` islemi icin \`${getRequiredPermissionLabel(action)}\` veya \`Administrator\` yetkisi gerekir.`
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      if (target.bot) {
        return interaction.editReply("Bot kullanicilara ceza uygulanamaz.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (target.id === interaction.user.id) {
        return interaction.editReply("Kendine ceza uygulayamazsin.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const guild = interaction.guild;
      if (target.id === guild.ownerId) {
        return interaction.editReply("Sunucu sahibine ceza uygulanamaz.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const member = await (guild.members.fetch(target.id) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
      const moderatorCheck = canModerateTarget(guild, interaction.member, member);
      if (!moderatorCheck.ok) {
        return interaction.editReply(moderatorCheck.reason).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const botMember = await getBotMember(guild);
      const botCheck = canBotAffectTarget(guild, botMember, member, action);
      if (!botCheck.ok) {
        return interaction.editReply(botCheck.reason).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
        return interaction.editReply("Administrator yetkisine sahip uyeye ceza uygulanamaz.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      let durationMs = 0;
      if (action === "timeout") {
        durationMs = parseDurationToMs(sure);
        if (!durationMs) {
          return interaction
            .editReply("Timeout icin `sure` zorunlu. Format: 10m, 2h, 1d, 1w")
            .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }
      }

      const applied = await applyPunish(
        guild,
        member,
        target,
        action,
        durationMs,
        `${interaction.user.tag}: ${reason}`
      );

      const caseEntry = await createCase(client.db, interaction.guildId, {
        type: action,
        targetId: target.id,
        moderatorId: interaction.user.id,
        reason,
        durationMs,
        success: applied.ok,
        meta: {
          detail: applied.detail,
        },
      });

      return interaction
        .editReply(
          `Case olusturuldu: **#${caseEntry.id}**\n` +
          `- Uye: <@${target.id}>\n` +
          `- Islem: **${action}${durationMs ? ` (${formatDuration(durationMs)})` : ""}**\n` +
          `- Durum: **${applied.ok ? "basarili" : `basarisiz (${applied.detail})`}**`
        )
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("ceza command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Ceza uygulanirken hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Ceza uygulanirken hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
};
