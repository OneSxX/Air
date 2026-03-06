const { EmbedBuilder } = require("discord.js");

function formatNumber(value) {
  return Number(value || 0).toLocaleString("tr-TR");
}

function formatCoin(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "0.0";
  return amount.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatHours(totalSeconds) {
  const sec = Number(totalSeconds || 0);
  if (sec <= 0) return "0h";

  const hours = sec / 3600;
  if (hours >= 1) return `${hours.toFixed(1)}h`;

  const minutes = sec / 60;
  if (minutes >= 1) return `${Math.floor(minutes)}m`;
  return `${Math.max(1, Math.floor(sec))}s`;
}

function formatVoiceDurationTwoUnits(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  if (sec <= 0) return "0 seconds";

  const units = [
    { label: "week", value: 604800 },
    { label: "day", value: 86400 },
    { label: "hour", value: 3600 },
    { label: "minute", value: 60 },
    { label: "second", value: 1 },
  ];

  let remain = sec;
  const parts = [];

  for (const unit of units) {
    const amount = Math.floor(remain / unit.value);
    if (amount <= 0) continue;

    parts.push(`${amount} ${unit.label}${amount === 1 ? "" : "s"}`);
    remain -= amount * unit.value;
    if (parts.length === 2) break;
  }

  return parts.length ? parts.join(" ") : "0 seconds";
}

function sumDailySeconds(dailyMap) {
  return Object.values(dailyMap || {}).reduce((acc, value) => acc + (Number(value) || 0), 0);
}

function formatDiscordDate(ts) {
  if (!Number.isFinite(Number(ts))) return "-";
  return `<t:${Math.floor(Number(ts) / 1000)}:D>`;
}

function progressBar(progress) {
  const size = 12;
  const safe = Number.isFinite(Number(progress)) ? Number(progress) : 0;
  const ratio = Math.max(0, Math.min(1, safe));
  const filled = Math.round(ratio * size);
  return `${"\u2588".repeat(filled)}${"\u2591".repeat(size - filled)}`;
}

function pushTopLines(topLines, rows, formatFn) {
  for (const row of rows || []) {
    topLines.push(formatFn(row));
  }
}

function collectMemberScopeFromCache(guild, targetUserId) {
  const includeSet = new Set();
  const excludeSet = new Set();
  const members = guild?.members?.cache?.values?.();

  if (members) {
    for (const member of members) {
      const id = String(member?.id || "").trim();
      if (!id) continue;
      if (member.user?.bot) {
        excludeSet.add(id);
      } else {
        includeSet.add(id);
      }
    }
  }

  const targetId = String(targetUserId || "").trim();
  if (targetId && !excludeSet.has(targetId)) {
    includeSet.add(targetId);
  }

  const cacheSize = Number(guild?.members?.cache?.size || 0);
  const memberCount = Number(guild?.memberCount || 0);
  const cacheLooksComplete =
    cacheSize > 0 &&
    memberCount > 0 &&
    cacheSize + 2 >= memberCount;

  return {
    includeUserIds: cacheLooksComplete ? [...includeSet] : undefined,
    excludeUserIds: excludeSet.size ? [...excludeSet] : undefined,
  };
}

module.exports = {
  name: "profile",
  description: "Kullanicinin detayli siralama kartini gosterir.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }

      if (!interaction.guildId) {
        return interaction.editReply("Bu komut sadece sunucuda calisir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const level = client.features?.Level;
      if (!level?.getRankCardData) {
        return interaction.editReply("Seviye sistemi su an aktif degil.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const target = interaction.options?.getUser?.("uye") || interaction.user;
      const guild = interaction.guild;
      const member =
        guild.members?.cache?.get?.(target.id) ||
        await (guild.members.fetch(target.id) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
      const memberScope = collectMemberScopeFromCache(guild, target.id);

      const card = await level.getRankCardData(client.db, interaction.guildId, target.id, {
        includeUserIds: memberScope.includeUserIds,
        excludeUserIds: memberScope.excludeUserIds,
      });
      const profile = card?.profile || {};
      const textProfile = profile?.text || {
        level: Number(profile.level || 0),
        xp: Number(profile.xp || 0),
        nextXp: Number(profile.nextXp || 0),
        totalXp: Number(profile.totalXp || 0),
        progress: Number(profile.progress || 0),
      };
      const voiceProfile = profile?.voice || {
        level: 0,
        xp: 0,
        nextXp: 0,
        totalXp: 0,
        progress: 0,
      };
      const totalMessages = Number(profile?.messages || 0);
      const totalVoiceSeconds = sumDailySeconds(profile?.stats?.dailyVoiceSec);
      const totalCoins = Number(profile?.coins || 0);
      const ranksValue =
        `Toplam Mesaj: **${formatNumber(totalMessages)}**\n` +
        `Yazi Seviyesi: **${formatNumber(textProfile.level)}**\n` +
        `Ses Toplam Sure: **${formatVoiceDurationTwoUnits(totalVoiceSeconds)}**\n` +
        `Ses Seviyesi: **${formatNumber(voiceProfile.level)}**\n` +
        `Coin: <:coin:1476059043389767792> **${formatCoin(totalCoins)}**`;

      const messagesValue =
        `1g: **${formatNumber(card?.messageActivity?.d1)}**\n` +
        `7g: **${formatNumber(card?.messageActivity?.d7)}**\n` +
        `14g: **${formatNumber(card?.messageActivity?.d14)}**`;

      const voiceValue =
        `1g: **${formatHours(card?.voiceActivity?.d1)}**\n` +
        `7g: **${formatHours(card?.voiceActivity?.d7)}**\n` +
        `14g: **${formatHours(card?.voiceActivity?.d14)}**`;

      const topLines = [];
      pushTopLines(topLines, (card?.topTextChannels || []).slice(0, 2), (x) => `# <#${x.id}> - ${formatNumber(x.value)} mesaj`);
      pushTopLines(topLines, (card?.topVoiceChannels || []).slice(0, 2), (x) => `V <#${x.id}> - ${formatHours(x.value)}`);

      const textNextXp = Number(textProfile.nextXp || 0);
      const textProgress =
        Number.isFinite(Number(textProfile.progress))
          ? Number(textProfile.progress)
          : textNextXp > 0
            ? Number(textProfile.xp || 0) / textNextXp
            : 0;

      const voiceNextXp = Number(voiceProfile.nextXp || 0);
      const voiceProgress =
        Number.isFinite(Number(voiceProfile.progress))
          ? Number(voiceProfile.progress)
          : voiceNextXp > 0
            ? Number(voiceProfile.xp || 0) / voiceNextXp
            : 0;

      const rankLevelValue =
        `Sira: **#${card?.textLevelRank || card?.levelRank || "-"}**\n` +
        `Seviye: **${formatNumber(textProfile.level)}**\n` +
        `XP: **${formatNumber(textProfile.xp)}/${formatNumber(textProfile.nextXp)}**\n` +
        `Ilerleme: \`${progressBar(textProgress)}\``;

      const voiceLevelValue =
        `Sira: **${card?.voiceLevelRank ? `#${card.voiceLevelRank}` : "Veri yok"}**\n` +
        `Seviye: **${formatNumber(voiceProfile.level)}**\n` +
        `XP: **${formatNumber(voiceProfile.xp)}/${formatNumber(voiceProfile.nextXp)}**\n` +
        `Ilerleme: \`${progressBar(voiceProgress)}\``;

      const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setTitle(`${target.username} - Sunucu Siralama`)
        .setThumbnail(target.displayAvatarURL({ forceStatic: false, size: 256 }))
        .setDescription(
          `Sunucu: **${guild.name}**\n` +
          `Olusturulma: ${formatDiscordDate(target.createdTimestamp)}\n` +
          `Sunucuya Katilma: ${formatDiscordDate(member?.joinedTimestamp)}`
        )
        .addFields(
          { name: "Sunucu Siralamalari", value: ranksValue, inline: true },
          { name: "Mesajlar", value: messagesValue, inline: true },
          { name: "Ses Aktivitesi", value: voiceValue, inline: true },
          {
            name: "En Aktif Kanallar",
            value: topLines.length ? topLines.join("\n") : "Veri yok",
            inline: false,
          },
          { name: "Mesaj Seviyesi", value: rankLevelValue, inline: true },
          { name: "Ses Seviyesi", value: voiceLevelValue, inline: true }
        )
        .setFooter({ text: "Sunucu Ozeti: Son 14 gun - Saat Dilimi: UTC" })
        .setTimestamp(Date.now());

      return interaction.editReply({ embeds: [embed] }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("profile command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Siralama bilgisi alinirken hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Siralama bilgisi alinirken hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
  __private: {
    collectMemberScopeFromCache,
  },
};
