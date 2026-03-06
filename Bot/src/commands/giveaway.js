const { ChannelType, PermissionFlagsBits } = require("discord.js");

function canManageGiveaway(interaction) {
  return (
    interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild) ||
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

function parseDurationInput(raw) {
  const text = String(raw || "").trim().toLowerCase();
  if (!text) return null;

  const totalRegex = /(\d+)\s*(days?|day|g|d|hours?|hour|saat|sa|h|minutes?|minute|min|dk|m|seconds?|second|sec|saniye|sn|s)\b/gi;
  let totalMs = 0;
  let matched = false;

  for (const match of text.matchAll(totalRegex)) {
    const n = Number(match?.[1] || 0);
    const unit = String(match?.[2] || "").toLowerCase();
    if (!Number.isFinite(n) || n <= 0) continue;
    matched = true;

    if (["d", "g", "day", "days"].includes(unit)) {
      totalMs += n * 24 * 60 * 60 * 1000;
    } else if (["h", "sa", "saat", "hour", "hours"].includes(unit)) {
      totalMs += n * 60 * 60 * 1000;
    } else if (["m", "dk", "min", "minute", "minutes"].includes(unit)) {
      totalMs += n * 60 * 1000;
    } else {
      totalMs += n * 1000;
    }
  }

  if (!matched) return null;
  if (totalMs < 10_000) return null;
  if (totalMs > 30 * 24 * 60 * 60 * 1000) return null;
  return totalMs;
}

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const day = Math.floor(totalSec / 86400);
  const hour = Math.floor((totalSec % 86400) / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const parts = [];
  if (day) parts.push(`${day}g`);
  if (hour) parts.push(`${hour}s`);
  if (min) parts.push(`${min}d`);
  if (sec && !parts.length) parts.push(`${sec}sn`);
  return parts.join(" ");
}

module.exports = {
  name: "giveaway",
  description: "Giveaway baslatir, bitirir ve yeniden ceker.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      if (!interaction.guildId || !interaction.guild) {
        return interaction.editReply("Bu komut sadece sunucuda calisir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (!canManageGiveaway(interaction)) {
        return interaction
          .editReply("Bu komut icin Sunucuyu Yonet yetkisi gerekir.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const feature = client.features?.Giveaway || require("../features/Giveaway");
      const sub = normalizeSub(interaction.options?.getSubcommand?.(false) || "durum");

      if (!["baslat", "bitir", "yeniden", "durum"].includes(sub)) {
        return interaction
          .editReply("Gecersiz alt komut. `/giveaway baslat|bitir|yeniden|durum` kullan.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "baslat") {
        const prize = String(interaction.options?.getString?.("odul", true) || "").trim();
        const sureRaw = String(interaction.options?.getString?.("sure", true) || "").trim();
        const winnerCount = Number(interaction.options?.getInteger?.("kazanan", true) || 1);
        const selectedChannel = interaction.options?.getChannel?.("kanal", false);
        const channel = selectedChannel || interaction.channel;

        if (!channel?.isTextBased?.() || typeof channel.send !== "function") {
          return interaction.editReply("Giveaway icin yazi kanali secmelisin.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }
        if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
          return interaction.editReply("Giveaway sadece metin/duyuru kanalinda baslatilabilir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }
        if (!prize) {
          return interaction.editReply("Odul bos olamaz.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        const durationMs = parseDurationInput(sureRaw);
        if (!durationMs) {
          return interaction
            .editReply("Sure formati gecersiz. Ornek: `30m`, `2h`, `1d 2h`")
            .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        const result = await feature.createGiveaway(client, {
          guildId: interaction.guildId,
          channelId: channel.id,
          hostId: interaction.user.id,
          prize,
          winnerCount: Math.max(1, Math.min(20, winnerCount || 1)),
          durationMs,
        });

        return interaction
          .editReply(
            `Giveaway baslatildi.\n` +
            `- Kanal: <#${result.row.channelId}>\n` +
            `- Odul: **${result.row.prize}**\n` +
            `- Kazanan: **${result.row.winnerCount}**\n` +
            `- Sure: **${formatDuration(durationMs)}**\n` +
            `- Mesaj: ${result.jumpUrl}`
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "bitir") {
        const messageIdInput = String(interaction.options?.getString?.("mesajid", false) || "").trim();
        let messageId = messageIdInput;

        if (!messageId) {
          const latest = await feature.findLatestActiveInChannel(client.db, interaction.guildId, interaction.channelId);
          if (!latest?.messageId) {
            return interaction
              .editReply("Bu kanalda aktif giveaway bulunamadi. `mesajid` girerek dene.")
              .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
          }
          messageId = latest.messageId;
        }

        const ended = await feature.endGiveawayNow(client, interaction.guildId, messageId);
        if (!ended) {
          return interaction
            .editReply("Bu mesaj id icin aktif giveaway bulunamadi.")
            .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        return interaction
          .editReply(
            `Giveaway bitirildi.\n` +
            `- Mesaj ID: **${ended.messageId}**\n` +
            `- Odul: **${ended.prize}**`
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "yeniden") {
        const messageId = String(interaction.options?.getString?.("mesajid", true) || "").trim();
        const winnerCount = Number(interaction.options?.getInteger?.("kazanan", false) || 0);
        const row = await feature.rerollGiveaway(
          client,
          interaction.guildId,
          messageId,
          winnerCount > 0 ? winnerCount : undefined
        );

        return interaction
          .editReply(
            `Giveaway yeniden cekildi.\n` +
            `- Mesaj ID: **${row.messageId}**\n` +
            `- Odul: **${row.prize}**\n` +
            `- Yeni kazanan sayisi: **${row.winnerIds.length}**`
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const messageId = String(interaction.options?.getString?.("mesajid", false) || "").trim();
      let active = null;
      let history = null;

      if (messageId) {
        active = await feature.getActiveRow(client.db, interaction.guildId, messageId);
        history = active ? null : await feature.getHistoryRow(client.db, interaction.guildId, messageId);
      } else {
        active = await feature.findLatestActiveInChannel(client.db, interaction.guildId, interaction.channelId);
      }

      const row = active || history;
      if (!row) {
        return interaction
          .editReply("Aktif veya bitmis giveaway kaydi bulunamadi.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const ended = Boolean(row.endedAt);
      const endLine = ended
        ? `<t:${Math.floor(Number(row.endedAt) / 1000)}:F>`
        : `<t:${Math.floor(Number(row.endAt) / 1000)}:F> (<t:${Math.floor(Number(row.endAt) / 1000)}:R>)`;
      const winners = Array.isArray(row.winnerIds) && row.winnerIds.length
        ? row.winnerIds.map((id) => `<@${id}>`).join(", ")
        : "-";
      const winnerLabel = Array.isArray(row.winnerIds) && row.winnerIds.length > 1
        ? "Kazananlar"
        : "Kazanan";

      return interaction
        .editReply(
          `Giveaway durumu:\n` +
          `- Mesaj ID: **${row.messageId}**\n` +
          `- Kanal: <#${row.channelId}>\n` +
          `- Odul: **${row.prize}**\n` +
          `- Durum: **${ended ? "Bitti" : "Aktif"}**\n` +
          `- Zaman: ${endLine}\n` +
          `- Katilimci: **${Array.isArray(row.participantIds) ? row.participantIds.length : 0}**\n` +
          `- ${winnerLabel}: ${winners}`
        )
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("giveaway command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Giveaway komutunda hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Giveaway komutunda hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
  __private: {
    parseDurationInput,
  },
};
