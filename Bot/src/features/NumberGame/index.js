const NUMBER_GAME_CFG_KEY = (guildId) => `number_game_cfg_${guildId}`;
const DEFAULT_APPROVE_EMOJI = "<:Onay:1477967088344891474>";

const guildLocks = new Map();

const DEFAULT_CONFIG = {
  enabled: true,
  channelId: null,
  expectedNumber: "1",
  lastUserId: null,
  updatedAt: 0,
  updatedBy: null,
};

function normalizeNumberText(raw) {
  const text = String(raw || "").trim();
  if (!/^\d+$/.test(text)) return "";
  try {
    return BigInt(text).toString();
  } catch {
    return "";
  }
}

function nextExpectedNumber(current) {
  const normalized = normalizeNumberText(current) || "1";
  try {
    return (BigInt(normalized) + 1n).toString();
  } catch {
    return "2";
  }
}

function normalizeConfig(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const channelId = /^\d{15,25}$/.test(String(src.channelId || "").trim())
    ? String(src.channelId).trim()
    : null;
  const expectedNumber = normalizeNumberText(src.expectedNumber) || DEFAULT_CONFIG.expectedNumber;
  const lastUserId = /^\d{15,25}$/.test(String(src.lastUserId || "").trim())
    ? String(src.lastUserId).trim()
    : null;

  return {
    enabled: src.enabled !== false,
    channelId,
    expectedNumber,
    lastUserId,
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
  const raw = await (db.get(NUMBER_GAME_CFG_KEY(guildId)) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  const cfg = normalizeConfig(raw);
  if (!raw || JSON.stringify(raw) !== JSON.stringify(cfg)) {
    await (db.set(NUMBER_GAME_CFG_KEY(guildId), cfg) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
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
  await (db.set(NUMBER_GAME_CFG_KEY(guildId), next) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  return next;
}

async function restartGame(client, guildId, channelId, actorId) {
  return setConfig(client.db, guildId, {
    enabled: true,
    channelId,
    expectedNumber: "1",
    lastUserId: null,
    updatedBy: actorId,
  });
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

    const value = normalizeNumberText(message.content);
    if (!value) {
      await (message.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return { handled: true, accepted: false, reason: "invalid_message" };
    }

    if (value !== cfg.expectedNumber) {
      await (message.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return { handled: true, accepted: false, reason: "wrong_number" };
    }

    if (cfg.lastUserId && cfg.lastUserId === message.author.id) {
      await (message.delete() || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      return { handled: true, accepted: false, reason: "same_user_twice" };
    }

    await (reactApprove(message) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    const nextValue = nextExpectedNumber(value);
    await setConfig(client.db, guildId, {
      expectedNumber: nextValue,
      lastUserId: message.author.id,
      updatedBy: message.author.id,
    });

    return {
      handled: true,
      accepted: true,
      nextNumber: nextValue,
    };
  });
}

function init() {}

module.exports = {
  init,
  getConfig,
  setConfig,
  restartGame,
  onMessage,
  __private: {
    normalizeNumberText,
    nextExpectedNumber,
    normalizeConfig,
    buildReactionCandidates,
  },
};
