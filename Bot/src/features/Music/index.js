const {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  entersState,
  createAudioPlayer,
  createAudioResource,
  getVoiceConnection,
  joinVoiceChannel,
} = require("@discordjs/voice");
const { ChannelType, PermissionFlagsBits } = require("discord.js");
const play = require("play-dl");

const MAX_QUEUE_LENGTH = 100;
const MAX_PLAYLIST_ADD = 20;
const CONNECT_TIMEOUT_MS = 20_000;
const RECONNECT_GRACE_MS = 5_000;
const AUTO_DISCONNECT_MS = 2 * 60 * 1000;
const MAX_QUEUE_PREVIEW = 10;
const READY_RETRY_COUNT = 3;
const READY_RETRY_WAIT_MS = 2_000;
const PLAY_START_RETRY_COUNT = 3;
const PLAY_START_TIMEOUT_MS = 8_000;
const PLAY_START_RETRY_WAIT_MS = 1_000;
const DISCONNECT_REJOIN_ATTEMPTS = 3;
const DISCONNECT_REJOIN_WAIT_MS = 2_000;
const SPOTIFY_TOKEN_REFRESH_GUARD_MS = 60_000;
const SPOTIFY_ACCOUNT_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_OEMBED_URL = "https://open.spotify.com/oembed?url=";
const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1";

const guildStates = new Map();
const attachedConnections = new WeakSet();
const spotifyTokenState = {
  token: null,
  expiresAt: 0,
  lock: Promise.resolve(),
};

function normalizeQuery(input) {
  return String(input || "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  const hh = Math.floor(seconds / 3600);
  const mm = Math.floor((seconds % 3600) / 60);
  const ss = seconds % 60;

  if (hh > 0) {
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function buildTrack(video, requesterId) {
  const durationInSec = Number(video?.durationInSec || 0);
  const durationText = String(video?.durationRaw || "").trim() || formatDuration(durationInSec);

  return {
    title: String(video?.title || "Bilinmeyen Sarki").trim().slice(0, 180),
    url: String(video?.url || "").trim(),
    durationInSec: Number.isFinite(durationInSec) && durationInSec > 0 ? durationInSec : 0,
    durationText: durationText || "00:00",
    requestedBy: String(requesterId || "0"),
  };
}

function parseSpotifyInput(input) {
  const raw = normalizeQuery(input);
  if (!raw) return null;

  const match = raw.match(
    /(?:https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?|spotify:)(track|playlist|album)[/:]([A-Za-z0-9]{10,})(?:\?.*)?$/i
  );
  if (!match) return null;

  return {
    type: String(match[1] || "").toLowerCase(),
    id: String(match[2] || "").trim(),
    url: raw,
  };
}

function getSpotifyCredentials() {
  const clientId = String(process.env.SPOTIFY_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.SPOTIFY_CLIENT_SECRET || "").trim();
  const market = String(process.env.SPOTIFY_MARKET || "TR").trim().toUpperCase() || "TR";

  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    market,
  };
}

function withSpotifyTokenLock(task) {
  const run = (spotifyTokenState.lock || Promise.resolve())
    .catch((err) => { globalThis.__airWarnSuppressedError?.(err); })
    .then(task);
  spotifyTokenState.lock = run.catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  return run;
}

async function getSpotifyAccessToken() {
  const creds = getSpotifyCredentials();
  if (!creds) return null;

  if (
    spotifyTokenState.token &&
    Number(spotifyTokenState.expiresAt || 0) > Date.now() + SPOTIFY_TOKEN_REFRESH_GUARD_MS
  ) {
    return spotifyTokenState.token;
  }

  return withSpotifyTokenLock(async () => {
    if (
      spotifyTokenState.token &&
      Number(spotifyTokenState.expiresAt || 0) > Date.now() + SPOTIFY_TOKEN_REFRESH_GUARD_MS
    ) {
      return spotifyTokenState.token;
    }

    if (typeof fetch !== "function") return null;
    const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
    const res = await fetch(SPOTIFY_ACCOUNT_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (!res?.ok) return null;

    const data = await (res.json() || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    const token = String(data?.access_token || "").trim();
    const expiresIn = Number(data?.expires_in || 0);
    if (!token || !Number.isFinite(expiresIn) || expiresIn <= 0) return null;

    spotifyTokenState.token = token;
    spotifyTokenState.expiresAt = Date.now() + expiresIn * 1000;
    return spotifyTokenState.token;
  });
}

async function spotifyFetchJson(url, token) {
  if (!token || typeof fetch !== "function") return null;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!res?.ok) return null;
  return res.json().catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
}

function normalizeSpotifyTrackMeta(row) {
  const source = row?.track ? row.track : row;
  if (!source || source.is_local) return null;

  const name = String(source.name || "").trim();
  const artists = Array.isArray(source.artists)
    ? source.artists.map((x) => String(x?.name || "").trim()).filter(Boolean)
    : [];
  const durationInSec = Math.max(0, Math.floor(Number(source.duration_ms || 0) / 1000));
  const url = String(source.external_urls?.spotify || source.href || "").trim();

  if (!name) return null;
  return {
    name,
    artists,
    durationInSec,
    url,
  };
}

function buildSpotifySearchQuery(meta) {
  const name = String(meta?.name || "").trim();
  const artistText = Array.isArray(meta?.artists)
    ? meta.artists.filter(Boolean).join(" ")
    : "";
  return `${name} ${artistText} audio`.replace(/\s+/g, " ").trim();
}

async function searchYoutubeFromText(query, requesterId) {
  const search = await play.search(query, {
    limit: 5,
    source: { youtube: "video" },
  }).catch(() => []);

  const first = Array.isArray(search) ? search.find((x) => x?.url) : null;
  const track = first ? buildTrack(first, requesterId) : null;
  return track?.url ? track : null;
}

function mapSpotifyMetaToTrack(meta, ytTrack, requesterId) {
  const artistText = Array.isArray(meta?.artists) ? meta.artists.filter(Boolean).join(", ") : "";
  const durationInSec = Number(meta?.durationInSec || ytTrack?.durationInSec || 0);
  const durationText = durationInSec > 0
    ? formatDuration(durationInSec)
    : String(ytTrack?.durationText || "00:00");

  const titleBase = String(meta?.name || ytTrack?.title || "Bilinmeyen Sarki").trim();
  const title = artistText ? `${titleBase} - ${artistText}` : titleBase;

  return {
    title: title.slice(0, 180),
    url: String(ytTrack?.url || "").trim(),
    durationInSec: Number.isFinite(durationInSec) && durationInSec > 0 ? durationInSec : 0,
    durationText,
    requestedBy: String(requesterId || "0"),
  };
}

async function resolveSpotifyTrackByOEmbed(spotify) {
  if (spotify?.type !== "track" || typeof fetch !== "function") return [];

  const res = await (fetch(`${SPOTIFY_OEMBED_URL}${encodeURIComponent(spotify.url)}`) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!res?.ok) return [];
  const data = await (res.json() || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });

  const title = String(data?.title || "").trim();
  const author = String(data?.author_name || "").trim();
  if (!title) return [];

  return [
    {
      name: title,
      artists: author ? [author] : [],
      durationInSec: 0,
      url: spotify.url,
    },
  ];
}

async function resolveSpotifyTracksFromApi(spotify) {
  const creds = getSpotifyCredentials();
  if (!creds) return [];

  const token = await getSpotifyAccessToken();
  if (!token) return [];

  const market = encodeURIComponent(creds.market || "TR");
  if (spotify.type === "track") {
    const data = await spotifyFetchJson(
      `${SPOTIFY_API_BASE_URL}/tracks/${spotify.id}?market=${market}`,
      token
    );
    const meta = normalizeSpotifyTrackMeta(data);
    return meta ? [meta] : [];
  }

  if (spotify.type === "album") {
    const album = await spotifyFetchJson(
      `${SPOTIFY_API_BASE_URL}/albums/${spotify.id}?market=${market}`,
      token
    );
    if (!album) return [];

    const out = [];
    let tracksContainer = album?.tracks;
    while (tracksContainer && out.length < MAX_PLAYLIST_ADD) {
      const items = Array.isArray(tracksContainer.items) ? tracksContainer.items : [];
      for (const item of items) {
        const meta = normalizeSpotifyTrackMeta(item);
        if (!meta) continue;
        out.push(meta);
        if (out.length >= MAX_PLAYLIST_ADD) break;
      }
      if (out.length >= MAX_PLAYLIST_ADD || !tracksContainer.next) break;
      tracksContainer = await spotifyFetchJson(tracksContainer.next, token);
    }
    return out;
  }

  if (spotify.type === "playlist") {
    const playlist = await spotifyFetchJson(
      `${SPOTIFY_API_BASE_URL}/playlists/${spotify.id}?market=${market}`,
      token
    );
    if (!playlist) return [];

    const out = [];
    let tracksContainer = playlist?.tracks;
    while (tracksContainer && out.length < MAX_PLAYLIST_ADD) {
      const items = Array.isArray(tracksContainer.items) ? tracksContainer.items : [];
      for (const item of items) {
        const meta = normalizeSpotifyTrackMeta(item);
        if (!meta) continue;
        out.push(meta);
        if (out.length >= MAX_PLAYLIST_ADD) break;
      }
      if (out.length >= MAX_PLAYLIST_ADD || !tracksContainer.next) break;
      tracksContainer = await spotifyFetchJson(tracksContainer.next, token);
    }
    return out;
  }

  return [];
}

async function resolveSpotifyTracks(spotify) {
  if (!spotify?.type) return [];

  const apiTracks = await resolveSpotifyTracksFromApi(spotify);
  if (apiTracks.length) return apiTracks;

  const embedTracks = await resolveSpotifyTrackByOEmbed(spotify);
  if (embedTracks.length) return embedTracks;

  return [];
}

function createEmptyState(client, guildId) {
  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Pause,
    },
  });

  const state = {
    client,
    guildId: String(guildId || ""),
    player,
    connection: null,
    voiceChannelId: null,
    textChannelId: null,
    queue: [],
    current: null,
    idleTimer: null,
    lock: Promise.resolve(),
    reconnecting: false,
  };

  player.on(AudioPlayerStatus.Idle, () => {
    withStateLock(state, async () => {
      state.current = null;
      await playNext(state);
    }).catch((err) => {
      console.error("Music player idle flow error:", err);
    });
  });

  player.on("error", (err) => {
    withStateLock(state, async () => {
      const trackTitle = state.current?.title || "Bilinmeyen sarki";
      await sendToTextChannel(
        state,
        `Muzik oynatma hatasi: **${trackTitle}** atlandi.\nSebep: ${err?.message || "bilinmeyen"}`
      );
      state.current = null;
      await playNext(state);
    }).catch((flowErr) => {
      console.error("Music player error flow failure:", flowErr);
    });
  });

  return state;
}

function getState(client, guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) throw new Error("Gecersiz sunucu.");

  let state = guildStates.get(gid);
  if (!state) {
    state = createEmptyState(client, gid);
    guildStates.set(gid, state);
  }
  if (!state.client) state.client = client;
  return state;
}

function withStateLock(state, task) {
  const run = (state.lock || Promise.resolve())
    .catch((err) => { globalThis.__airWarnSuppressedError?.(err); })
    .then(task);
  state.lock = run.catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  return run;
}

function clearIdleTimer(state) {
  if (!state?.idleTimer) return;
  clearTimeout(state.idleTimer);
  state.idleTimer = null;
}

function scheduleAutoDisconnect(state) {
  clearIdleTimer(state);
  state.idleTimer = setTimeout(() => {
    withStateLock(state, async () => {
      if (state.current || state.queue.length) return;
      await disconnectState(state, { clearQueue: false, notify: true });
    }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }, AUTO_DISCONNECT_MS);

  if (typeof state.idleTimer.unref === "function") state.idleTimer.unref();
}

function attachConnectionListeners(state, connection) {
  if (!connection || attachedConnections.has(connection)) return;
  attachedConnections.add(connection);

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, RECONNECT_GRACE_MS),
        entersState(connection, VoiceConnectionStatus.Connecting, RECONNECT_GRACE_MS),
      ]);
    } catch {
      withStateLock(state, async () => {
        if (state.connection !== connection) return;

        if (state.reconnecting || !state.voiceChannelId || !state.client) {
          await disconnectState(state, { clearQueue: true, notify: true });
          return;
        }

        state.reconnecting = true;
        let reconnected = false;
        let lastErr = null;

        try {
          const guild =
            state.client.guilds?.cache?.get?.(state.guildId) ||
            await (state.client.guilds?.fetch?.(state.guildId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
          const voiceChannel =
            guild?.channels?.cache?.get?.(state.voiceChannelId) ||
            await (guild?.channels?.fetch?.(state.voiceChannelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });

          if (!guild || !voiceChannel?.isVoiceBased?.()) {
            await disconnectState(state, { clearQueue: true, notify: true });
            return;
          }

          for (let attempt = 1; attempt <= DISCONNECT_REJOIN_ATTEMPTS; attempt += 1) {
            try {
              try {
                connection.destroy();
              } catch {}

              const fresh = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,
                selfDeaf: true,
                selfMute: false,
              });

              attachConnectionListeners(state, fresh);
              await entersState(fresh, VoiceConnectionStatus.Ready, CONNECT_TIMEOUT_MS);
              fresh.subscribe(state.player);
              state.connection = fresh;
              reconnected = true;
              await sendToTextChannel(state, "Ses baglantisi koptu ama tekrar baglandim.");
              break;
            } catch (err) {
              lastErr = err;
              if (attempt < DISCONNECT_REJOIN_ATTEMPTS) {
                await sleep(DISCONNECT_REJOIN_WAIT_MS * attempt);
              }
            }
          }
        } finally {
          state.reconnecting = false;
        }

        if (!reconnected) {
          await sendToTextChannel(
            state,
            `Ses baglantisi tekrar kurulamadi: ${lastErr?.message || "bilinmeyen"}`
          );
          await disconnectState(state, { clearQueue: true, notify: true });
        }
      }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  });
}

async function ensureVoiceConnection(state, voiceChannel) {
  const guild = voiceChannel?.guild;
  if (!guild) throw new Error("Ses kanali bulunamadi.");

  let connection =
    state.connection ||
    getVoiceConnection(guild.id);

  if (connection && connection.joinConfig?.channelId !== voiceChannel.id) {
    connection.destroy();
    connection = null;
  }

  if (!connection) {
    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });
  }

  attachConnectionListeners(state, connection);
  let ready = false;
  let lastStatus = String(connection.state?.status || "unknown");
  for (let attempt = 1; attempt <= READY_RETRY_COUNT; attempt += 1) {
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, CONNECT_TIMEOUT_MS);
      ready = true;
      break;
    } catch {
      lastStatus = String(connection.state?.status || "unknown");

      try {
        if (typeof connection.rejoin === "function") {
          connection.rejoin();
        }
      } catch {}

      if (attempt < READY_RETRY_COUNT) {
        await sleep(READY_RETRY_WAIT_MS * attempt);
      }
    }
  }

  if (!ready) {
    try {
      connection.destroy();
    } catch {}
    throw new Error(
      `Ses kanalina baglanilamadi (durum: ${lastStatus}). Kanal izinlerini ve VPS UDP ag erisimini kontrol et.`
    );
  }

  connection.subscribe(state.player);
  state.connection = connection;
  state.voiceChannelId = voiceChannel.id;
}

async function resolveTracks(query, requesterId) {
  const q = normalizeQuery(query);
  if (!q) throw new Error("Sarki veya link yazmalisin.");

  const spotify = parseSpotifyInput(q);
  if (spotify) {
    const spotifyTracks = await resolveSpotifyTracks(spotify);
    if (!spotifyTracks.length) {
      // Spotify metadata alinamazsa URL'nin kendisiyle YouTube aramasi yap.
      const fallbackTrack = await searchYoutubeFromText(q, requesterId);
      if (fallbackTrack?.url) return [fallbackTrack];

      if (spotify.type === "track") {
        throw new Error("Spotify sarki bilgisi alinamadi.");
      }
      throw new Error(
        "Spotify playlist/album acilamadi. SPOTIFY_CLIENT_ID ve SPOTIFY_CLIENT_SECRET tanimlayip tekrar dene."
      );
    }

    const tracks = [];
    for (const meta of spotifyTracks.slice(0, MAX_PLAYLIST_ADD)) {
      const searchQuery = buildSpotifySearchQuery(meta);
      const ytTrack = await searchYoutubeFromText(searchQuery, requesterId);
      if (!ytTrack?.url) continue;
      tracks.push(mapSpotifyMetaToTrack(meta, ytTrack, requesterId));
    }

    if (!tracks.length) {
      throw new Error("Spotify sarkilari YouTube'da bulunamadi.");
    }

    return tracks;
  }

  const ytType = play.yt_validate(q);
  if (ytType === "video") {
    const info = await (play.video_info(q) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    const track = info?.video_details ? buildTrack(info.video_details, requesterId) : null;
    if (!track?.url) throw new Error("Video bilgisi alinamadi.");
    return [track];
  }

  if (ytType === "playlist") {
    const playlist = await (play.playlist_info(q, { incomplete: true }) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (!playlist) throw new Error("Playlist bilgisi alinamadi.");

    const videos = await playlist.all_videos().catch(() => []);
    const tracks = [];
    for (const video of videos) {
      const track = buildTrack(video, requesterId);
      if (!track.url) continue;
      tracks.push(track);
      if (tracks.length >= MAX_PLAYLIST_ADD) break;
    }
    if (!tracks.length) throw new Error("Playlistte oynatilabilir video bulunamadi.");
    return tracks;
  }

  const search = await play.search(q, {
    limit: 1,
    source: { youtube: "video" },
  }).catch(() => []);

  const first = Array.isArray(search) ? search[0] : null;
  const track = first ? buildTrack(first, requesterId) : null;
  if (!track?.url) throw new Error("Aramana uygun sarki bulunamadi.");
  return [track];
}

async function createResourceFromTrack(track) {
  const stream = await play.stream(track.url, {
    discordPlayerCompatibility: true,
  });

  return createAudioResource(stream.stream, {
    inputType: stream.type || StreamType.Arbitrary,
  });
}

async function sendToTextChannel(state, content) {
  const text = String(content || "").trim();
  if (!text || !state?.textChannelId || !state?.client) return false;

  const guild =
    state.client.guilds?.cache?.get?.(state.guildId) ||
    await (state.client.guilds?.fetch?.(state.guildId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!guild) return false;

  const channel =
    guild.channels?.cache?.get?.(state.textChannelId) ||
    await (guild.channels?.fetch?.(state.textChannelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!channel?.isTextBased?.() || typeof channel.send !== "function") return false;

  return channel.send({ content: text }).then(() => true).catch(() => false);
}

async function playNext(state) {
  clearIdleTimer(state);

  if (!state.connection) {
    state.current = null;
    return false;
  }

  const next = state.queue.shift();
  if (!next) {
    state.current = null;
    scheduleAutoDisconnect(state);
    return false;
  }

  state.current = next;

  let lastErr = null;
  let started = false;
  for (let attempt = 1; attempt <= PLAY_START_RETRY_COUNT; attempt += 1) {
    try {
      const resource = await createResourceFromTrack(next);
      state.player.play(resource);
      await entersState(state.player, AudioPlayerStatus.Playing, PLAY_START_TIMEOUT_MS);
      started = true;
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < PLAY_START_RETRY_COUNT) {
        await sleep(PLAY_START_RETRY_WAIT_MS * attempt);
      }
    }
  }

  if (!started) {
    await sendToTextChannel(
      state,
      `Sarki baslatilamadi: **${next.title}**\nSebep: ${lastErr?.message || "bilinmeyen"}`
    );
    state.current = null;
    return playNext(state);
  }

  await sendToTextChannel(state, `Simdi caliyor: **${next.title}** \`[${next.durationText}]\``);
  return true;
}

async function disconnectState(state, opts = {}) {
  const clearQueue = opts?.clearQueue !== false;
  const notify = opts?.notify === true;

  clearIdleTimer(state);
  if (clearQueue) state.queue = [];
  state.current = null;

  try {
    state.player.stop(true);
  } catch {}

  try {
    const conn = state.connection || getVoiceConnection(state.guildId);
    if (conn) conn.destroy();
  } catch {}

  state.connection = null;
  state.voiceChannelId = null;

  if (notify) {
    await sendToTextChannel(state, "Muzik baglantisi kapatildi.");
  }
}

async function validateJoinPermissions(voiceChannel) {
  if (!voiceChannel) throw new Error("Ses kanalina girmen gerekiyor.");
  if (!voiceChannel.isVoiceBased?.()) throw new Error("Gecerli bir ses kanali sec.");
  if (![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(voiceChannel.type)) {
    throw new Error("Bu kanal turunde muzik calinamaz.");
  }

  const me = voiceChannel.guild.members?.me ||
    await (voiceChannel.guild.members.fetchMe() || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!me) throw new Error("Bot uye bilgisi alinamadi.");

  const perms = voiceChannel.permissionsFor(me);
  if (!perms?.has?.(PermissionFlagsBits.ViewChannel)) {
    throw new Error("Botun kanali gorme izni yok.");
  }
  if (!perms?.has?.(PermissionFlagsBits.Connect)) {
    throw new Error("Botun ses kanalina baglanma izni yok.");
  }
  if (!perms?.has?.(PermissionFlagsBits.Speak)) {
    throw new Error("Botun ses kanalinda konusma izni yok.");
  }
}

function canControlState(state, userVoiceChannelId) {
  const userChannel = String(userVoiceChannelId || "").trim();
  if (!userChannel) return { ok: false, reason: "Ses kanalinda olmalisin." };
  if (!state?.voiceChannelId) return { ok: false, reason: "Bot su an bir ses kanalinda degil." };
  if (String(state.voiceChannelId) !== userChannel) {
    return { ok: false, reason: "Botla ayni ses kanalinda olmalisin." };
  }
  return { ok: true, reason: "" };
}

async function enqueueFromQuery(client, payload) {
  const guild = payload?.guild;
  const voiceChannel = payload?.voiceChannel;
  const requesterId = String(payload?.requestedBy || "").trim();
  const textChannelId = String(payload?.textChannelId || "").trim() || null;
  const query = normalizeQuery(payload?.query);

  if (!guild?.id) throw new Error("Sunucu bulunamadi.");
  if (!requesterId) throw new Error("Kullanici bilgisi bulunamadi.");

  await validateJoinPermissions(voiceChannel);

  const state = getState(client, guild.id);
  return withStateLock(state, async () => {
    await ensureVoiceConnection(state, voiceChannel);

    const tracks = await resolveTracks(query, requesterId);
    if (!tracks.length) throw new Error("Eklenecek sarki bulunamadi.");

    const availableSlots = Math.max(0, MAX_QUEUE_LENGTH - state.queue.length - (state.current ? 1 : 0));
    if (availableSlots <= 0) {
      throw new Error("Kuyruk dolu. Biraz bekleyip tekrar dene.");
    }

    const toAdd = tracks.slice(0, availableSlots);
    state.queue.push(...toAdd);
    state.textChannelId = textChannelId || state.textChannelId;

    const shouldStart =
      !state.current &&
      state.player.state.status !== AudioPlayerStatus.Playing &&
      state.player.state.status !== AudioPlayerStatus.Buffering;

    let started = false;
    if (shouldStart) {
      started = await playNext(state);
    }

    return {
      addedCount: toAdd.length,
      firstAdded: toAdd[0],
      started,
      queueSize: state.queue.length,
      current: state.current,
      wasPlaylist: tracks.length > 1,
      skippedCount: tracks.length - toAdd.length,
    };
  });
}

async function skip(client, guildId, userVoiceChannelId) {
  const state = getState(client, guildId);
  return withStateLock(state, async () => {
    const control = canControlState(state, userVoiceChannelId);
    if (!control.ok) throw new Error(control.reason);
    if (!state.current) throw new Error("Calan sarki yok.");

    const skipped = state.current;
    state.player.stop(true);
    return {
      skipped,
      next: state.queue[0] || null,
    };
  });
}

async function stop(client, guildId, userVoiceChannelId) {
  const state = getState(client, guildId);
  return withStateLock(state, async () => {
    const control = canControlState(state, userVoiceChannelId);
    if (!control.ok) throw new Error(control.reason);

    const hadMusic = Boolean(state.current || state.queue.length || state.connection);
    await disconnectState(state, { clearQueue: true, notify: false });
    return { hadMusic };
  });
}

async function pause(client, guildId, userVoiceChannelId) {
  const state = getState(client, guildId);
  return withStateLock(state, async () => {
    const control = canControlState(state, userVoiceChannelId);
    if (!control.ok) throw new Error(control.reason);
    if (!state.current) throw new Error("Calan sarki yok.");

    const ok = state.player.pause(true);
    if (!ok) throw new Error("Sarki duraklatilamadi.");
    return { current: state.current };
  });
}

async function resume(client, guildId, userVoiceChannelId) {
  const state = getState(client, guildId);
  return withStateLock(state, async () => {
    const control = canControlState(state, userVoiceChannelId);
    if (!control.ok) throw new Error(control.reason);
    if (!state.current) throw new Error("Calan sarki yok.");

    const ok = state.player.unpause();
    if (!ok) throw new Error("Sarki zaten caliyor olabilir.");
    return { current: state.current };
  });
}

function getQueueSnapshot(client, guildId) {
  const state = getState(client, guildId);
  return {
    connected: Boolean(state.connection),
    voiceChannelId: state.voiceChannelId,
    current: state.current
      ? { ...state.current }
      : null,
    queueCount: state.queue.length,
    queue: state.queue.slice(0, MAX_QUEUE_PREVIEW).map((x) => ({ ...x })),
  };
}

async function onVoiceStateUpdate(oldState, newState, client) {
  if (!client?.user?.id) return;

  const botId = client.user.id;
  if (oldState?.id !== botId && newState?.id !== botId) return;

  const guildId = String(oldState?.guild?.id || newState?.guild?.id || "").trim();
  if (!guildId) return;

  const state = guildStates.get(guildId);
  if (!state) return;

  await withStateLock(state, async () => {
    const botChannelId = String(newState?.channelId || "").trim();
    if (!botChannelId) {
      await disconnectState(state, { clearQueue: true, notify: false });
      return;
    }

    state.voiceChannelId = botChannelId;
  });
}

function init() {
  const youtubeCookie = String(process.env.YOUTUBE_COOKIE || "").trim();
  if (!youtubeCookie || typeof play?.setToken !== "function") return;

  try {
    play.setToken({
      youtube: {
        cookie: youtubeCookie,
      },
    });
  } catch (err) {
    console.warn("Music youtube cookie set hatasi:", err?.message || err);
  }
}

module.exports = {
  init,
  enqueueFromQuery,
  skip,
  stop,
  pause,
  resume,
  getQueueSnapshot,
  onVoiceStateUpdate,
  __private: {
    normalizeQuery,
    formatDuration,
    canControlState,
    parseSpotifyInput,
    buildSpotifySearchQuery,
    sleep,
  },
};
