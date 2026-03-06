const { PermissionFlagsBits } = require("discord.js");

const PANIC_DEFAULT_MS = 15 * 60_000;
const PANIC_MAX_MS = 24 * 60 * 60_000;

function canManagePanic(interaction) {
  return (
    interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator)
  );
}

function parseDurationMs(input) {
  const raw = String(input || "")
    .trim()
    .toLowerCase();
  if (!raw) return PANIC_DEFAULT_MS;

  const m = raw.match(/^(\d+)\s*([mhd])$/);
  if (!m) return null;

  const amount = Number.parseInt(m[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = m[2];
  const base = unit === "m"
    ? 60_000
    : unit === "h"
      ? 60 * 60_000
      : 24 * 60 * 60_000;
  const duration = amount * base;
  if (!Number.isFinite(duration) || duration <= 0 || duration > PANIC_MAX_MS) return null;
  return duration;
}

module.exports = {
  name: "panic",
  description: "Acil durumda koruma seviyesini gecici olarak en yuksege ceker.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      if (!interaction.guildId || !interaction.guild) {
        return interaction.editReply("Bu komut sadece sunucuda calisir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      if (!canManagePanic(interaction)) {
        return interaction
          .editReply("Bu komut icin `Sunucuyu Yonet` veya `Administrator` yetkisi gerekir.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const protection = client.features?.Protection || require("../features/Protection");
      if (!protection?.activatePanicMode || !protection?.deactivatePanicMode || !protection?.getPanicModeState) {
        return interaction.editReply("Protection modulu panic mode icin uygun degil.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const sub = String(interaction.options?.getSubcommand?.(false) || "").trim().toLowerCase();

      if (sub === "durum") {
        const state = await protection.getPanicModeState(interaction.guild, client);
        if (!state?.enabled) {
          return interaction.editReply("Panic mode su an **kapali**.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }
        return interaction
          .editReply(
            `Panic mode **aktif**.\n` +
            `- Baslangic: <t:${Math.floor(state.since / 1000)}:F>\n` +
            `- Bitis: <t:${Math.floor(state.until / 1000)}:F> (<t:${Math.floor(state.until / 1000)}:R>)\n` +
            `${state.byUserId ? `- Acan: <@${state.byUserId}>\n` : ""}` +
            `${state.reason ? `- Sebep: ${state.reason}` : ""}`
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "on") {
        const durationRaw = interaction.options?.getString?.("sure", false);
        const reason = String(interaction.options?.getString?.("sebep", false) || "").trim();
        const durationMs = parseDurationMs(durationRaw);
        if (!durationMs) {
          return interaction
            .editReply("Gecersiz sure. Ornek: `10m`, `1h`, `1d` (maks 24 saat).")
            .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        const activated = await protection.activatePanicMode(interaction.guild, client, {
          durationMs,
          actorId: interaction.user.id,
          reason,
        });
        if (!activated?.ok || !activated.state?.enabled) {
          return interaction.editReply("Panic mode aktif edilemedi.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        return interaction
          .editReply(
            `Panic mode aktif edildi.\n` +
            `- Bitis: <t:${Math.floor(activated.state.until / 1000)}:F> (<t:${Math.floor(activated.state.until / 1000)}:R>)\n` +
            `${reason ? `- Sebep: ${reason}` : ""}`
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "off") {
        const reason = String(interaction.options?.getString?.("sebep", false) || "").trim();
        const disabled = await protection.deactivatePanicMode(interaction.guild, client, {
          actorId: interaction.user.id,
          reason,
        });
        if (!disabled?.ok) {
          return interaction.editReply("Panic mode kapatilamadi.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }
        return interaction
          .editReply(`Panic mode kapatildi.${reason ? ` Sebep: ${reason}` : ""}`)
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      return interaction
        .editReply("Gecersiz alt komut. `/panic on|off|durum` kullan.")
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("panic command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Panic komutu calisirken hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Panic komutu calisirken hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
  __private: {
    parseDurationMs,
    canManagePanic,
  },
};
