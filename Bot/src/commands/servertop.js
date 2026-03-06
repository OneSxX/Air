const { EmbedBuilder } = require("discord.js");
const DEFAULT_TOP_THUMBNAIL_URL = "https://i.imgur.com/nK3i3gSh.jpg";
const RAW_TOP_THUMBNAIL_URL = process.env.SERVERTOP_THUMBNAIL_URL || "https://imgur.com/30RZhzE";
const COIN_EMOJI = "<:coin:1476059043389767792>";
const PREV_EMOJI = "\u2B05\uFE0F";
const NEXT_EMOJI = "\u27A1\uFE0F";
const PAGE_SIZE = 10;
const PAGINATION_TIMEOUT_MS = 10 * 60 * 1000;

function normalizeImageUrl(rawUrl, fallback = "") {
  const raw = String(rawUrl || "").trim();
  if (!raw) return fallback;
  if (/imgur\.com\/undefined/i.test(raw)) return fallback;

  const directImgur = raw.match(
    /^https?:\/\/(?:www\.)?imgur\.com\/([a-zA-Z0-9]+)(?:\.(png|jpg|jpeg|gif|webp))?(?:[?#].*)?$/i
  );
  if (directImgur) {
    const id = directImgur[1];
    const ext = directImgur[2] ? directImgur[2].toLowerCase() : "png";
    return `https://i.imgur.com/${id}.${ext}`;
  }

  return raw;
}

const TOP_THUMBNAIL_URL = normalizeImageUrl(RAW_TOP_THUMBNAIL_URL, DEFAULT_TOP_THUMBNAIL_URL);

function normalizeEmojiName(name) {
  return String(name || "").replace(/\uFE0F/g, "");
}

function isPrevEmoji(name) {
  const n = normalizeEmojiName(name);
  return n === "\u2B05" || n === "\u25C0";
}

function isNextEmoji(name) {
  const n = normalizeEmojiName(name);
  return n === "\u27A1" || n === "\u25B6";
}

function formatCoin(value) {
  const amount = Number(value || 0) / 10;
  if (!Number.isFinite(amount) || amount <= 0) return "0.0";
  return amount.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function lineForRow(row, index, mode) {
  if (mode === "voice") {
    const lv = Number(row.voiceLevel || 0);
    const total = Number(row.voiceTotalXp || 0);
    return `${index + 1}. <@${row.userId}> - Lv.${lv} (${total} XP)`;
  }
  if (mode === "coin") {
    return `${index + 1}. <@${row.userId}> - ${COIN_EMOJI} ${formatCoin(row.coinDeci)}`;
  }

  const lv = Number(row.textLevel ?? row.level ?? 0);
  const total = Number(row.textTotalXp ?? row.totalXp ?? 0);
  return `${index + 1}. <@${row.userId}> - Lv.${lv} (${total} XP)`;
}

function paginateRows(rows, pageSize = PAGE_SIZE) {
  const out = [];
  for (let i = 0; i < rows.length; i += pageSize) {
    out.push(rows.slice(i, i + pageSize));
  }
  return out;
}

function resolveFetchLimit(memberCountHint) {
  const count = Number(memberCountHint || 0);
  if (Number.isFinite(count) && count > 0) return Math.max(10, Math.floor(count));
  return Number.POSITIVE_INFINITY;
}

function collectMemberScopeFromCache(guild) {
  const includeSet = new Set();
  const botSet = new Set();
  const members = guild?.members?.cache?.values?.();

  if (members) {
    for (const member of members) {
      const id = String(member?.id || "").trim();
      if (!id) continue;
      if (member.user?.bot) {
        botSet.add(id);
      } else {
        includeSet.add(id);
      }
    }
  }

  const cacheSize = Number(guild?.members?.cache?.size || 0);
  const memberCount = Number(guild?.memberCount || 0);
  const cacheLooksComplete =
    cacheSize > 0 &&
    memberCount > 0 &&
    cacheSize + 2 >= memberCount;

  return {
    includeUserIds: cacheLooksComplete ? [...includeSet] : [],
    botUserIds: [...botSet],
    humanCountHint: includeSet.size,
    cacheLooksComplete,
  };
}

function buildEmbed(guildName, totalMembers, pages, pageIndex, mode) {
  const title = mode === "voice" ? "Top Voice" : mode === "coin" ? "Top Coin" : "Top Text";
  const start = pageIndex * PAGE_SIZE;
  const rows = pages[pageIndex] || [];
  const lines = rows.map((row, idx) => lineForRow(row, start + idx, mode));

  const embed = new EmbedBuilder()
    .setColor(0x000000)
    .setTitle(title)
    .setThumbnail(TOP_THUMBNAIL_URL)
    .setDescription(
      `Sunucu: **${guildName}**\n` +
      `Toplam uye: **${totalMembers}**`
    )
    .addFields({
      name: "Siralama",
      value: lines.length ? lines.join("\n") : "Veri yok",
      inline: false,
    });

  if (pages.length > 1) {
    embed.setFooter({
      text: `${PREV_EMOJI} Onceki | Sonraki ${NEXT_EMOJI} - Sayfa ${pageIndex + 1}/${pages.length}`,
    });
  } else {
    embed.setFooter({ text: `Sayfa ${pageIndex + 1}/${Math.max(1, pages.length)}` });
  }

  return embed;
}

module.exports = {
  name: "servertop",
  description: "Sunucunun yazi, ses veya coin siralamasini gosterir.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }

      if (!interaction.guildId) {
        return interaction.editReply("Bu komut sadece sunucuda calisir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const level = client.features?.Level;
      if (!level?.getTopByType) {
        return interaction.editReply("Seviye sistemi su an aktif degil.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const selectedType = interaction.options?.getString?.("type", true) || "text";
      const mode = selectedType === "voice" ? "voice" : selectedType === "coin" ? "coin" : "text";

      const memberScope = collectMemberScopeFromCache(interaction.guild);
      const includeUserIds = memberScope.includeUserIds;
      const botUserIds = new Set(memberScope.botUserIds);

      const fetchLimit = resolveFetchLimit(
        includeUserIds.length || memberScope.humanCountHint || interaction.guild?.memberCount || 0
      );
      const includeSet = new Set(includeUserIds.map((x) => String(x || "").trim()).filter(Boolean));
      const topRaw = await level.getTopByType(client.db, interaction.guildId, mode, fetchLimit, {
        includeUserIds: includeUserIds.length ? includeUserIds : undefined,
        excludeUserIds: [...botUserIds],
        includeInactive: true,
      });
      const top = includeSet.size
        ? topRaw.filter((row) => includeSet.has(String(row?.userId || "").trim()))
        : topRaw;

      if (!top.length) {
        return interaction.editReply("Henuz seviye verisi yok.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const pages = paginateRows(top, PAGE_SIZE);
      let pageIndex = 0;
      const totalMembersHint = includeUserIds.length || memberScope.humanCountHint || top.length;

      const sendPayload = () => ({
        embeds: [buildEmbed(interaction.guild?.name || "Sunucu", totalMembersHint, pages, pageIndex, mode)],
      });

      await (interaction.editReply(sendPayload()) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

      if (pages.length <= 1) return;

      const msg = await (interaction.fetchReply() || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
      if (!msg?.react || !msg?.createReactionCollector) return;

      await (msg.react(PREV_EMOJI) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      await (msg.react(NEXT_EMOJI) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

      let busy = false;
      const collector = msg.createReactionCollector({
        filter: (reaction, user) => {
          if (user?.bot) return false;
          if (user.id !== interaction.user.id) return false;
          return isPrevEmoji(reaction?.emoji?.name) || isNextEmoji(reaction?.emoji?.name);
        },
        time: PAGINATION_TIMEOUT_MS,
      });

      collector.on("collect", async (reaction, user) => {
        if (busy) {
          await (reaction.users.remove(user.id) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
          return;
        }

        busy = true;
        try {
          if (isNextEmoji(reaction?.emoji?.name)) {
            pageIndex = (pageIndex + 1) % pages.length;
          } else if (isPrevEmoji(reaction?.emoji?.name)) {
            pageIndex = (pageIndex - 1 + pages.length) % pages.length;
          }

          await (interaction.editReply(sendPayload()) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
          await (reaction.users.remove(user.id) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        } finally {
          busy = false;
        }
      });
    } catch (err) {
      console.error("servertop command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Server siralamasi alinirken hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Server siralamasi alinirken hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
  __private: {
    resolveFetchLimit,
    paginateRows,
    collectMemberScopeFromCache,
  },
};
