const WORD_GAME_CFG_KEY = (guildId) => `word_game_cfg_${guildId}`;
const REWARD_DECI = 1; // 0.1 coin
const POSITIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const TDK_TIMEOUT_MS = 7_000;
const FAST_GTS_TIMEOUT_MS = 2_000;
const AUTOCOMPLETE_TIMEOUT_MS = 15_000;
const AUTOCOMPLETE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const TDK_GTS_URL = "https://sozluk.gov.tr/gts?ara=";
const TDK_AUTOCOMPLETE_URL = "https://sozluk.gov.tr/autocomplete.json";
const DEFAULT_APPROVE_EMOJI = "<:Onay:1479576579171680306>";

const START_LETTERS = [
  "a", "b", "c", "\u00e7", "d", "e", "f", "g", "h", "\u0131", "i", "j", "k",
  "l", "m", "n", "o", "\u00f6", "p", "r", "s", "\u015f", "t", "u", "\u00fc", "v", "y", "z",
];

const tdkCache = new Map();
const guildLocks = new Map();
let autocompleteWordSet = null;
let autocompleteLoadedAt = 0;
let autocompleteLoadPromise = null;

const LETTER_RE = /^[a-z\u00e2\u00e7\u00ee\u011f\u0131\u00f6\u015f\u00fb\u00fc]+$/u;

function normalizeLetter(value) {
  const base = String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/\u00e2/g, "a")
    .replace(/\u00ee/g, "i")
    .replace(/\u00fb/g, "u");
  return base ? [...base][0] : "";
}

function normalizeWord(raw) {
  const text = String(raw || "")
    .trim()
    .toLocaleLowerCase("tr-TR");

  if (!text || text.includes(" ")) return "";
  if ([...text].length < 2) return "";
  if (!LETTER_RE.test(text)) return "";
  return text;
}

function firstLetter(word) {
  const chars = [...String(word || "")];
  return chars.length ? normalizeLetter(chars[0]) : "";
}

function lastLetter(word) {
  const chars = [...String(word || "")];
  return chars.length ? normalizeLetter(chars[chars.length - 1]) : "";
}

function buildLookupVariants(word) {
  const base = normalizeWord(word);
  if (!base) return [];

  const out = [base];
  const iToDotless = base.replace(/i/g, "\u0131");
  const dotlessToI = base.replace(/\u0131/g, "i");

  if (iToDotless !== base) out.push(iToDotless);
  if (dotlessToI !== base && dotlessToI !== iToDotless) out.push(dotlessToI);

  return [...new Set(out)];
}

function pickRandomStartLetter() {
  const pool = START_LETTERS.filter(Boolean);
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx] || "a";
}

function normalizeUsedWords(input) {
  const arr = Array.isArray(input) ? input : [];
  const out = [];
  const seen = new Set();

  for (const item of arr) {
    const word = normalizeWord(item);
    if (!word || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
  }

  return out;
}

function normalizeConfig(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const channelId = /^\d{15,25}$/.test(String(src.channelId || "").trim())
    ? String(src.channelId).trim()
    : null;
  const expectedLetter = normalizeLetter(src.expectedLetter) || pickRandomStartLetter();
  const usedWords = normalizeUsedWords(src.usedWords);
  const round = Number.isFinite(Number(src.round)) && Number(src.round) > 0
    ? Math.floor(Number(src.round))
    : 1;

  return {
    enabled: src.enabled !== false,
    channelId,
    expectedLetter,
    usedWords,
    round,
    lastUserId: /^\d{15,25}$/.test(String(src.lastUserId || "").trim())
      ? String(src.lastUserId).trim()
      : null,
    updatedAt: Number(src.updatedAt || 0) || 0,
    updatedBy: src.updatedBy ? String(src.updatedBy) : null,
  };
}

function buildReactionCandidates(raw) {
  const base = String(raw || "").trim();
  const out = [];
  if (base) out.push(base);

  const match = base.match(/<a?:\w+:(\d{15,25})>/);
  if (match?.[1]) out.push(match[1]);

  if (!out.length) out.push(DEFAULT_APPROVE_EMOJI);
  return [...new Set(out)];
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reactApprove(message) {
  const raw = process.env.WORD_GAME_APPROVE_EMOJI || DEFAULT_APPROVE_EMOJI;
  const candidates = buildReactionCandidates(raw);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const candidate of candidates) {
      const ok = await message.react(candidate).then(() => true).catch(() => false);
      if (ok) return true;
    }

    if (attempt < 2) {
      await wait(120 * (attempt + 1));
    }
  }

  return false;
}

function getCacheEntry(word) {
  const entry = tdkCache.get(word);
  if (!entry) return null;

  const age = Date.now() - Number(entry.at || 0);
  const ttl = entry.ok ? POSITIVE_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS;
  if (age > ttl) {
    tdkCache.delete(word);
    return null;
  }

  return entry;
}

function setCacheEntry(word, ok) {
  tdkCache.set(word, { ok: Boolean(ok), at: Date.now() });
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  if (typeof fetch !== "function") {
    return { ok: false, data: null, status: 0, error: "fetch_unavailable" };
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), Math.max(1_000, Number(timeoutMs || TDK_TIMEOUT_MS)))
    : null;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json, text/plain, */*",
      },
      signal: controller?.signal,
    });

    const text = await res.text().catch(() => "");
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }

    return {
      ok: res.ok,
      status: Number(res.status || 0),
      data,
      text,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      text: "",
      error: err?.message || "fetch_failed",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchJsonWithRetry(url, attempts = 3, timeoutMs = TDK_TIMEOUT_MS) {
  const total = Math.max(1, Number(attempts || 1));
  let last = null;

  for (let i = 0; i < total; i += 1) {
    const out = await fetchJsonWithTimeout(url, timeoutMs);
    last = out;

    if (out.ok && out.data != null) return out;
    if (out.status >= 400 && out.status < 500 && out.status !== 429) return out;
  }

  return last || { ok: false, status: 0, data: null, text: "", error: "unknown" };
}

function parseGtsResult(payload) {
  if (Array.isArray(payload) && payload.length > 0) return "found";
  if (payload && typeof payload === "object" && typeof payload.error === "string") return "not_found";
  return "unknown";
}

async function validateFromGts(lookupVariants, opts = {}) {
  const timeoutMs = Math.max(500, Number(opts.timeoutMs || TDK_TIMEOUT_MS));
  const attempts = Math.max(1, Number(opts.attempts || 3));
  let anyKnownResponse = false;
  let anyUnknown = false;
  let anyNotFound = false;

  const responses = await Promise.all(
    lookupVariants.map((variant) => {
      const url = `${TDK_GTS_URL}${encodeURIComponent(variant)}`;
      return fetchJsonWithRetry(url, attempts, timeoutMs);
    })
  );

  for (const response of responses) {

    if (!response.ok || response.data == null) {
      anyUnknown = true;
      continue;
    }

    const kind = parseGtsResult(response.data);
    if (kind === "found") {
      return {
        found: true,
        definitiveNotFound: false,
        uncertain: false,
      };
    }

    anyKnownResponse = true;
    if (kind === "not_found") anyNotFound = true;
    if (kind === "unknown") anyUnknown = true;
  }

  return {
    found: false,
    definitiveNotFound: anyKnownResponse && anyNotFound && !anyUnknown,
    uncertain: anyUnknown || !anyKnownResponse,
  };
}

async function loadAutocompleteSet() {
  const now = Date.now();
  if (autocompleteWordSet && now - autocompleteLoadedAt <= AUTOCOMPLETE_CACHE_TTL_MS) {
    return autocompleteWordSet;
  }

  if (autocompleteLoadPromise) return autocompleteLoadPromise;

  autocompleteLoadPromise = (async () => {
    const response = await fetchJsonWithRetry(TDK_AUTOCOMPLETE_URL, 2, AUTOCOMPLETE_TIMEOUT_MS);
    if (!response.ok || !Array.isArray(response.data)) {
      return autocompleteWordSet;
    }

    const set = new Set();
    for (const row of response.data) {
      const normalized = normalizeWord(row?.madde || "");
      if (!normalized) continue;
      set.add(normalized);
      for (const variant of buildLookupVariants(normalized)) {
        set.add(variant);
      }
    }

    if (set.size > 10_000) {
      autocompleteWordSet = set;
      autocompleteLoadedAt = Date.now();
    }

    return autocompleteWordSet;
  })()
    .catch(() => autocompleteWordSet)
    .finally(() => {
      autocompleteLoadPromise = null;
    });

  return autocompleteLoadPromise;
}

function validateFromAutocompleteSync(lookupVariants) {
  const set = autocompleteWordSet;
  if (!set || !set.size) return null;

  for (const variant of lookupVariants) {
    if (set.has(variant)) return true;
  }
  return false;
}

async function validateFromAutocomplete(lookupVariants) {
  const set = await loadAutocompleteSet();
  if (!set || !set.size) return null;

  for (const variant of lookupVariants) {
    if (set.has(variant)) return true;
  }
  return false;
}

async function validateWordWithTdk(word) {
  const cached = getCacheEntry(word);
  if (cached) return cached.ok;

  const variants = buildLookupVariants(word);
  if (!variants.length) {
    setCacheEntry(word, false);
    return false;
  }

  const syncAutocomplete = validateFromAutocompleteSync(variants);
  if (syncAutocomplete === true) {
    setCacheEntry(word, true);
    return true;
  }

  // Liste yuklu degilse arka planda yuklemeyi baslat.
  if (syncAutocomplete == null) {
    loadAutocompleteSet().catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  const gtsResult = await validateFromGts(variants, {
    attempts: 1,
    timeoutMs: FAST_GTS_TIMEOUT_MS,
  });
  if (gtsResult.found) {
    setCacheEntry(word, true);
    return true;
  }

  const autocompleteResult = syncAutocomplete == null
    ? validateFromAutocompleteSync(variants)
    : syncAutocomplete;
  if (autocompleteResult === true) {
    setCacheEntry(word, true);
    return true;
  }
  if (autocompleteResult === false && gtsResult.definitiveNotFound) {
    setCacheEntry(word, false);
    return false;
  }
  if (gtsResult.definitiveNotFound) {
    setCacheEntry(word, false);
    return false;
  }

  // Belirsiz durumda fail-close: sozluk disi kelime kabul edilmesin.
  setCacheEntry(word, false);
  return false;
}

function withGuildLock(guildId, task) {
  const key = String(guildId || "").trim();
  const prev = guildLocks.get(key) || Promise.resolve();

  const next = prev
    .catch((err) => { globalThis.__airWarnSuppressedError?.(err); })
    .then(task)
    .finally(() => {
      if (guildLocks.get(key) === next) guildLocks.delete(key);
    });

  guildLocks.set(key, next);
  return next;
}

async function getConfig(db, guildId) {
  const raw = await (db.get(WORD_GAME_CFG_KEY(guildId)) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  const cfg = normalizeConfig(raw);
  if (!raw || JSON.stringify(raw) !== JSON.stringify(cfg)) {
    await (db.set(WORD_GAME_CFG_KEY(guildId), cfg) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }
  return cfg;
}

async function setConfig(db, guildId, patch = {}) {
  const current = await getConfig(db, guildId);
  const next = normalizeConfig({
    ...current,
    ...(patch || {}),
    updatedAt: Date.now(),
    updatedBy: patch?.updatedBy ? String(patch.updatedBy) : current.updatedBy,
  });
  await (db.set(WORD_GAME_CFG_KEY(guildId), next) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  return next;
}

function applyAcceptedWordState(cfg, word) {
  const normalized = normalizeWord(word);
  if (!normalized) return null;

  const ending = lastLetter(normalized);
  if (ending === "\u011f") {
    return {
      roundEnded: true,
      nextRound: Number(cfg?.round || 1) + 1,
      nextExpectedLetter: pickRandomStartLetter(),
      nextUsedWords: [],
    };
  }

  const used = normalizeUsedWords([...(cfg?.usedWords || []), normalized]);
  return {
    roundEnded: false,
    nextRound: Number(cfg?.round || 1),
    nextExpectedLetter: ending,
    nextUsedWords: used,
  };
}

async function restartGame(client, guildId, channelId, actorId) {
  const current = await getConfig(client.db, guildId);
  const next = await setConfig(client.db, guildId, {
    enabled: true,
    channelId,
    expectedLetter: pickRandomStartLetter(),
    usedWords: [],
    round: Number(current.round || 1) + 1,
    lastUserId: null,
    updatedBy: actorId,
  });
  return next;
}

async function rewardWinner(client, guildId, userId, deciAmount) {
  const level = client.features?.Level;
  if (!level?.grantCoins) return null;
  return level.grantCoins(client.db, guildId, userId, deciAmount).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
}

function buildRoundWinMessage(userId, endingLetter, nextLetter) {
  const memberId = String(userId || "").trim();
  const safeEnding = normalizeLetter(endingLetter) || "\u011f";
  const safeNext = normalizeLetter(nextLetter) || pickRandomStartLetter();

  return (
    "⏔⏔⏔⏔⏔⏔⏔⏔⏔⏔ ꒰ ᧔ෆ᧓ ꒱ ⏔⏔⏔⏔⏔⏔⏔⏔⏔⏔\n" +
    "**Tebrikler**\n" +
    `・<@${memberId}> kelimeyi ${safeEnding} ile bitirerek turu kazandi.\n` +
    "・0.1 coin kazandin.\n" +
    `・Yeni tur harfi: ${safeNext}`
  );
}

async function onMessage(message, client) {
  if (!message?.guild || !message?.author || message.author.bot || message.webhookId) {
    return { handled: false };
  }
  if (!client?.db) return { handled: false };

  const guildId = message.guild.id;
  return withGuildLock(guildId, async () => {
    const cfg = await getConfig(client.db, guildId);
    if (!cfg.enabled || !cfg.channelId || message.channelId !== cfg.channelId) {
      return { handled: false };
    }

    const word = normalizeWord(message.content);
    if (!word) {
      await (message.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return { handled: true, accepted: false, reason: "invalid_format" };
    }

    const expected = normalizeLetter(cfg.expectedLetter);
    if (expected && firstLetter(word) !== expected) {
      await (message.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return { handled: true, accepted: false, reason: "wrong_letter" };
    }

    if (cfg.usedWords.includes(word)) {
      await (message.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return { handled: true, accepted: false, reason: "already_used" };
    }

    if (cfg.lastUserId && cfg.lastUserId === message.author.id) {
      await (message.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return { handled: true, accepted: false, reason: "same_user_twice" };
    }

    const existsInTdk = await validateWordWithTdk(word);
    if (!existsInTdk) {
      await (message.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return { handled: true, accepted: false, reason: "tdk_reject" };
    }

    const state = applyAcceptedWordState(cfg, word);
    if (!state) {
      await (message.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return { handled: true, accepted: false, reason: "state_error" };
    }

    await setConfig(client.db, guildId, {
      enabled: true,
      channelId: cfg.channelId,
      expectedLetter: state.nextExpectedLetter,
      usedWords: state.nextUsedWords,
      round: state.nextRound,
      lastUserId: message.author.id,
      updatedBy: message.author.id,
    });

    await (reactApprove(message) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

    if (state.roundEnded) {
      await (rewardWinner(client, guildId, message.author.id, REWARD_DECI) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
      const endingLetter = lastLetter(word);
      const nextLetter = normalizeLetter(state.nextExpectedLetter);

      await message.channel
        .send(buildRoundWinMessage(message.author.id, endingLetter, nextLetter))
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }

    return {
      handled: true,
      accepted: true,
      roundEnded: state.roundEnded,
      nextLetter: state.nextExpectedLetter,
    };
  });
}

function init() {
  loadAutocompleteSet().catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
}

module.exports = {
  init,
  getConfig,
  setConfig,
  restartGame,
  onMessage,
  __private: {
    normalizeLetter,
    normalizeWord,
    buildLookupVariants,
    validateFromAutocompleteSync,
    pickRandomStartLetter,
    normalizeConfig,
    buildReactionCandidates,
    applyAcceptedWordState,
    buildRoundWinMessage,
    firstLetter,
    lastLetter,
  },
};
