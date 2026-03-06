function normalizeSub(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0131/g, "i");
}

async function getMemberVoiceChannel(interaction) {
  const guild = interaction.guild;
  if (!guild) return null;

  const cachedMember = interaction.member;
  const member =
    cachedMember?.voice
      ? cachedMember
      : await (guild.members.fetch(interaction.user.id) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!member?.voice?.channelId) return null;

  return guild.channels.cache.get(member.voice.channelId) ||
    await (guild.channels.fetch(member.voice.channelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
}

function formatTrackLine(track, index) {
  return `${index + 1}. **${track.title}** \`[${track.durationText}]\``;
}

function mapMusicError(err) {
  const raw = String(err?.message || err || "").trim();
  const lower = raw.toLowerCase();

  if (!raw) return "Bilinmeyen hata.";
  if (lower.includes("client network socket disconnected")) {
    return "Sunucu YouTube'a baglanamadi. VPS agini kontrol et.";
  }
  if (lower.includes("status code: 429") || lower.includes("too many requests")) {
    return "YouTube istek limiti asildi. YOUTUBE_COOKIE tanimlayip tekrar dene.";
  }
  if (lower.includes("sign in to confirm") || lower.includes("confirm your age")) {
    return "YouTube erisim engeli var. .env dosyasina YOUTUBE_COOKIE eklenmeli.";
  }
  if (lower.includes("ffmpeg")) {
    return "FFmpeg eksik gorunuyor. VPS'e ffmpeg kurmalisin.";
  }

  return raw.slice(0, 220);
}

const SKIP_VOTE_EMOJI = "\u2705";
const SKIP_VOTE_REQUIRED = 2;
const SKIP_VOTE_TIMEOUT_MS = 30_000;
const SKIP_VOTE_THRESHOLD = 3;

function getHumanVoiceMembers(voiceChannel) {
  if (!voiceChannel?.members) return [];
  return [...voiceChannel.members.values()].filter((member) => !member?.user?.bot);
}

async function collectSkipVotes(interaction, voiceChannel) {
  const humans = getHumanVoiceMembers(voiceChannel);
  if (humans.length <= SKIP_VOTE_THRESHOLD) {
    return { required: false, approved: true, votes: 0, requiredVotes: 0 };
  }

  const eligibleIds = new Set(humans.map((member) => member.id));
  const baseText =
    `Kanalda bot haric **${humans.length}** kisi var.\n` +
    `Sarkiyi gecmek icin **${SKIP_VOTE_REQUIRED}** onay gerekiyor.\n` +
    `${SKIP_VOTE_EMOJI} tepkisi vererek oylamaya katil. (30 sn)`;

  const message = await interaction
    .editReply(`${baseText}\nOnay: **0/${SKIP_VOTE_REQUIRED}**`)
    .catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!message?.createReactionCollector) {
    return {
      required: true,
      approved: false,
      votes: 0,
      requiredVotes: SKIP_VOTE_REQUIRED,
      reason: "vote_message_unavailable",
    };
  }

  await (message.react(SKIP_VOTE_EMOJI) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  const votes = new Set();

  const result = await new Promise((resolve) => {
    let settled = false;
    const collector = message.createReactionCollector({
      filter: (reaction, user) =>
        reaction?.emoji?.name === SKIP_VOTE_EMOJI &&
        !user?.bot &&
        eligibleIds.has(user.id) &&
        voiceChannel.members?.has?.(user.id),
      time: SKIP_VOTE_TIMEOUT_MS,
    });

    const finalize = (approved) => {
      if (settled) return;
      settled = true;
      collector.stop(approved ? "approved" : "ended");
      resolve({ approved, votes: votes.size });
    };

    collector.on("collect", async (_, user) => {
      votes.add(user.id);
      await interaction
        .editReply(`${baseText}\nOnay: **${votes.size}/${SKIP_VOTE_REQUIRED}**`)
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      if (votes.size >= SKIP_VOTE_REQUIRED) {
        finalize(true);
      }
    });

    collector.on("end", () => {
      if (settled) return;
      settled = true;
      resolve({ approved: votes.size >= SKIP_VOTE_REQUIRED, votes: votes.size });
    });
  });

  return {
    required: true,
    approved: result.approved,
    votes: result.votes,
    requiredVotes: SKIP_VOTE_REQUIRED,
  };
}

module.exports = {
  name: "muzik",
  description: "Muzik sistemi komutlari.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }

      if (!interaction.guildId || !interaction.guild) {
        return interaction.editReply("Bu komut sadece sunucuda calisir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const music = client.features?.Music || require("../features/Music");
      const sub = normalizeSub(interaction.options?.getSubcommand?.(false) || "kuyruk");

      if (sub === "cal") {
        const query = String(interaction.options?.getString?.("sorgu", true) || "").trim();
        if (!query) {
          return interaction.editReply("Sarki ismi veya YouTube linki yazmalisin.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        const voiceChannel = await getMemberVoiceChannel(interaction);
        if (!voiceChannel) {
          return interaction.editReply("Muzik icin once bir ses kanalina gir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        const snapshot = music.getQueueSnapshot(client, interaction.guildId);
        if (snapshot.voiceChannelId && snapshot.voiceChannelId !== voiceChannel.id) {
          return interaction
            .editReply(`Bot su an <#${snapshot.voiceChannelId}> kanalinda. Ayni kanala gecmelisin.`)
            .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        const result = await music.enqueueFromQuery(client, {
          guild: interaction.guild,
          voiceChannel,
          textChannelId: interaction.channelId,
          requestedBy: interaction.user.id,
          query,
        });

        if (!result?.addedCount) {
          return interaction.editReply("Sarki kuyruga eklenemedi.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        const playlistText = result.wasPlaylist
          ? `\n- Playlist eklendi: **${result.addedCount}** sarki`
          : "";
        const nowPlayingText = result.current
          ? `\n- Simdi calan: **${result.current.title}**`
          : "";
        const skippedText = result.skippedCount > 0
          ? `\n- Limit nedeniyle eklenemeyen: **${result.skippedCount}**`
          : "";

        return interaction
          .editReply(
            `Muzik kuyruga eklendi.\n` +
            `- Ilk sarki: **${result.firstAdded?.title || "Bilinmeyen"}**` +
            `${playlistText}` +
            `${nowPlayingText}` +
            `${skippedText}`
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "kuyruk") {
        const snapshot = music.getQueueSnapshot(client, interaction.guildId);
        if (!snapshot.current && snapshot.queueCount === 0) {
          return interaction.editReply("Muzik kuyrugu bos.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        const nowLine = snapshot.current
          ? `Simdi calan: **${snapshot.current.title}** \`[${snapshot.current.durationText}]\``
          : "Simdi calan: -";

        const queueLines = snapshot.queue.length
          ? snapshot.queue.map((track, idx) => formatTrackLine(track, idx)).join("\n")
          : "Sirada bekleyen sarki yok.";

        const remain = snapshot.queueCount - snapshot.queue.length;
        const remainLine = remain > 0 ? `\n...ve **${remain}** sarki daha.` : "";

        return interaction
          .editReply(
            `${nowLine}\n\n` +
            `Kuyruk (${snapshot.queueCount}):\n${queueLines}${remainLine}`
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "simdicalan") {
        const snapshot = music.getQueueSnapshot(client, interaction.guildId);
        if (!snapshot.current) {
          return interaction.editReply("Su an calan sarki yok.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        return interaction
          .editReply(
            `Simdi caliyor: **${snapshot.current.title}** \`[${snapshot.current.durationText}]\`\n` +
            `- Link: ${snapshot.current.url}`
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const voiceChannel = await getMemberVoiceChannel(interaction);
      if (!voiceChannel) {
        return interaction.editReply("Bu komut icin ses kanalinda olmalisin.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "gec") {
        const vote = await collectSkipVotes(interaction, voiceChannel);
        if (vote.required && !vote.approved) {
          const failLine = vote.reason === "vote_message_unavailable"
            ? "Oylama baslatilamadi."
            : `Yeterli onay toplanamadi (**${vote.votes}/${vote.requiredVotes}**).`;
          return interaction
            .editReply(`Sarki gecilmedi. ${failLine}`)
            .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        const result = await music.skip(client, interaction.guildId, voiceChannel.id);
        const voteLine = vote.required
          ? `\nOylama sonucu: **${vote.votes}/${vote.requiredVotes}** onay`
          : "";
        return interaction
          .editReply(
            `Sarki gecildi: **${result.skipped?.title || "Bilinmeyen"}**` +
            `${result.next ? `\nSiradaki: **${result.next.title}**` : ""}` +
            `${voteLine}`
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "duraklat") {
        const result = await music.pause(client, interaction.guildId, voiceChannel.id);
        return interaction
          .editReply(`Duraklatildi: **${result.current?.title || "Sarki"}**`)
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "devam") {
        const result = await music.resume(client, interaction.guildId, voiceChannel.id);
        return interaction
          .editReply(`Devam ediyor: **${result.current?.title || "Sarki"}**`)
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (sub === "durdur") {
        const result = await music.stop(client, interaction.guildId, voiceChannel.id);
        if (!result?.hadMusic) {
          return interaction.editReply("Durdurulacak aktif muzik yok.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }
        return interaction.editReply("Muzik durduruldu ve kuyruk temizlendi.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      return interaction
        .editReply("Gecersiz alt komut. `/muzik` alt komutlarini kullan.")
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("muzik command error:", err);
      const reason = mapMusicError(err);
      if (interaction.deferred || interaction.replied) {
        return interaction
          .editReply(`Muzik komutunda hata olustu: ${reason}`)
          .catch((replyErr) => { globalThis.__airWarnSuppressedError?.(replyErr); });
      }
      return interaction
        .reply({ content: `Muzik komutunda hata olustu: ${reason}`, ephemeral: true })
        .catch((replyErr) => { globalThis.__airWarnSuppressedError?.(replyErr); });
    }
  },
};
