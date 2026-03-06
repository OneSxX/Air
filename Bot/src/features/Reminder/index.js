const BUMP_CFG_KEY = (gid) => `bump_reminder_cfg_${gid}`;
const BUMP_PENDING_KEY = (gid) => `bump_reminder_pending_${gid}`;
const BUMP_ENABLED_KEY = (gid) => `bump_reminder_enabled_${gid}`;

const DEFAULT_BUMP_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const MAX_TIMEOUT_MS = 2_147_483_647;
const MIN_DELAY_MS = 30_000;
const MAX_DELAY_MS = 48 * 60 * 60 * 1000;
const MIN_LOOP_INTERVAL_MS = 30 * 60 * 1000;
const RESCHEDULE_GUARD_MS = 60_000;
const MIN_VALID_TIMESTAMP_COOLDOWN_MS = 3 * 60 * 1000;
const MIN_VALID_DURATION_COOLDOWN_MS = 60_000;

const KNOWN_BUMP_BOT_IDS = new Set([
  "302050872383242240", // DISBOARD
]);

const bumpTimers = new Map();
const bumpStoreLocks = new Map();

function logSuppressedError(context, err) {
  if (!err) return;
  console.warn(`[Reminder] ${context}:`, err?.message || err);
}

function normalizeRoleIds(input) {
  const arr = Array.isArray(input) ? input : [];
  const out = [];
  const seen = new Set();

  for (const item of arr) {
    const id = String(item || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out;
}

function normalizeBumpConfig(raw) {
  if (!raw || typeof raw !== "object") return null;

  const guildId = String(raw.guildId || "").trim();
  const channelId = String(raw.channelId || "").trim();
  const authorId = String(raw.authorId || "").trim() || "0";
  const message = String(raw.message || "").trim();
  const roleIds = normalizeRoleIds(raw.roleIds);
  const bumpBotId = String(raw.bumpBotId || "").trim() || null;
  const updatedAt = Number(raw.updatedAt || Date.now());

  if (!guildId || !channelId || !message || !roleIds.length) return null;

  return {
    guildId,
    channelId,
    authorId,
    message,
    roleIds,
    bumpBotId,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : Date.now(),
  };
}

function normalizePending(raw) {
  if (!raw || typeof raw !== "object") return null;

  const guildId = String(raw.guildId || "").trim();
  const channelId = String(raw.channelId || "").trim();
  const message = String(raw.message || "").trim();
  const roleIds = normalizeRoleIds(raw.roleIds);
  const bumpBotId = String(raw.bumpBotId || "").trim() || null;
  const dueAt = Number(raw.dueAt || 0);
  const intervalMs = normalizeLoopIntervalMs(raw.intervalMs || DEFAULT_BUMP_COOLDOWN_MS);
  const updatedAt = Number(raw.updatedAt || Date.now());

  if (!guildId || !channelId || !message || !roleIds.length) return null;
  if (!Number.isFinite(dueAt) || dueAt <= 0) return null;

  return {
    guildId,
    channelId,
    message,
    roleIds,
    bumpBotId,
    dueAt,
    intervalMs,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : Date.now(),
  };
}

function clampDelayMs(ms) {
  const value = Number(ms || 0);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_BUMP_COOLDOWN_MS;
  return Math.max(MIN_DELAY_MS, Math.min(MAX_DELAY_MS, Math.floor(value)));
}

function normalizeLoopIntervalMs(ms) {
  const safe = clampDelayMs(ms);
  if (safe < MIN_LOOP_INTERVAL_MS) return DEFAULT_BUMP_COOLDOWN_MS;
  return safe;
}

function shouldRescheduleFromLatestBump(currentPending, latestPending, now = Date.now()) {
  const latestDueAt = Number(latestPending?.dueAt || 0);
  if (!Number.isFinite(latestDueAt) || latestDueAt <= 0) return false;
  if (latestDueAt - now <= RESCHEDULE_GUARD_MS) return false;

  const currentDueAt = Number(currentPending?.dueAt || 0);
  if (!Number.isFinite(currentDueAt) || currentDueAt <= 0) return true;

  return latestDueAt > currentDueAt + RESCHEDULE_GUARD_MS;
}

function clearBumpTimer(guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return;

  const timer = bumpTimers.get(gid);
  if (timer) {
    clearTimeout(timer);
    bumpTimers.delete(gid);
  }
}

async function withStoreLock(guildIdOrTask, maybeTask) {
  const isLegacyCall = typeof guildIdOrTask === "function";
  const guildId = isLegacyCall ? "__global__" : String(guildIdOrTask || "").trim() || "__global__";
  const task = isLegacyCall ? guildIdOrTask : maybeTask;
  if (typeof task !== "function") return null;

  const prev = bumpStoreLocks.get(guildId) || Promise.resolve();
  const next = prev
    .catch((err) => {
      logSuppressedError(`withStoreLock previous task ${guildId}`, err);
    })
    .then(task)
    .finally(() => {
      if (bumpStoreLocks.get(guildId) === next) {
        bumpStoreLocks.delete(guildId);
      }
    });

  bumpStoreLocks.set(guildId, next);
  return next;
}

async function getConfig(db, guildId) {
  const raw = await db.get(BUMP_CFG_KEY(guildId)).catch((err) => {
    logSuppressedError(`getConfig ${guildId}`, err);
    return null;
  });
  return normalizeBumpConfig(raw);
}

async function clearConfig(db, guildId) {
  await db.delete(BUMP_CFG_KEY(guildId)).catch((err) => {
    logSuppressedError(`clearConfig ${guildId}`, err);
  });
}

async function isBumpReminderEnabled(db, guildId) {
  const raw = await db.get(BUMP_ENABLED_KEY(guildId)).catch((err) => {
    logSuppressedError(`isBumpReminderEnabled ${guildId}`, err);
    return null;
  });
  if (raw === false) return false;
  return true;
}

async function setBumpReminderEnabled(client, guildId, enabled, opts = {}) {
  const db = client?.db;
  if (!db) throw new Error("Veritabani bulunamadi.");

  const gid = String(guildId || "").trim();
  if (!gid) throw new Error("Gecersiz guild id.");

  return withStoreLock(gid, async () => {
    const turnOn = Boolean(enabled);
    await db.set(BUMP_ENABLED_KEY(gid), turnOn).catch((err) => {
      logSuppressedError(`setBumpReminderEnabled ${gid}`, err);
    });

    if (turnOn) {
      const config = await (getConfig(db, gid) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
      const pending = await (getPending(db, gid) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
      if (pending) schedulePendingReminder(client, pending);
      return { enabled: true, config, pending };
    }

    clearBumpTimer(gid);
    await clearPending(db, gid);
    const shouldClearConfig = opts?.clearConfig !== false;
    if (shouldClearConfig) {
      await clearConfig(db, gid);
    }

    return { enabled: false, config: null, pending: null };
  });
}

async function setConfig(db, guildId, cfg) {
  const normalized = normalizeBumpConfig({ ...cfg, guildId });
  if (!normalized) throw new Error("Bump reminder ayari gecersiz.");
  await db.set(BUMP_CFG_KEY(guildId), normalized).catch((err) => {
    logSuppressedError(`setConfig ${guildId}`, err);
  });
  return normalized;
}

async function getPending(db, guildId) {
  const raw = await db.get(BUMP_PENDING_KEY(guildId)).catch((err) => {
    logSuppressedError(`getPending ${guildId}`, err);
    return null;
  });
  return normalizePending(raw);
}

async function setPending(db, guildId, pending) {
  const normalized = normalizePending({ ...pending, guildId });
  if (!normalized) throw new Error("Bump pending verisi gecersiz.");
  await db.set(BUMP_PENDING_KEY(guildId), normalized).catch((err) => {
    logSuppressedError(`setPending ${guildId}`, err);
  });
  return normalized;
}

async function clearPending(db, guildId) {
  await db.delete(BUMP_PENDING_KEY(guildId)).catch((err) => {
    logSuppressedError(`clearPending ${guildId}`, err);
  });
}

function collectMessageText(message) {
  const parts = [];
  parts.push(String(message?.content || ""));

  for (const embed of message?.embeds || []) {
    parts.push(String(embed?.title || ""));
    parts.push(String(embed?.description || ""));
    for (const field of embed?.fields || []) {
      parts.push(String(field?.name || ""));
      parts.push(String(field?.value || ""));
    }
    if (embed?.footer?.text) parts.push(String(embed.footer.text || ""));
    if (embed?.author?.name) parts.push(String(embed.author.name || ""));
  }

  return parts.join("\n").toLowerCase();
}

function isLikelyBumpText(text) {
  const t = String(text || "").toLowerCase();
  return /(^|[\s`*_])bump([\s`*_]|$)/i.test(t) || t.includes("/bump");
}

function isKnownBumpBot(authorId) {
  return KNOWN_BUMP_BOT_IDS.has(String(authorId || "").trim());
}

function isLikelyDisboardPayload(message, textHint = "") {
  const interactionName = String(message?.interactionMetadata?.name || "").toLowerCase();
  if (interactionName === "bump") return true;

  const messageText = String(textHint || collectMessageText(message) || "").toLowerCase();
  if (!messageText) return false;

  if (messageText.includes("disboard")) return true;
  if (messageText.includes("disboard.org")) return true;
  if (messageText.includes("bump done")) return true;
  if (messageText.includes("can bump again")) return true;
  if (messageText.includes("please wait another")) return true;

  return false;
}

function parseCooldownDetails(text, now = Date.now()) {
  const t = String(text || "");
  if (!t) return null;

  const timestampCandidates = [];
  const timestampRegex = /<t:(\d{10,13})(?::[a-zA-Z])?>/g;
  for (const match of t.matchAll(timestampRegex)) {
    const raw = String(match?.[1] || "").trim();
    if (!raw) continue;

    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) continue;
    const rawDueAt = raw.length > 10 ? numeric : numeric * 1000;
    timestampCandidates.push(rawDueAt);
  }
  if (timestampCandidates.length) {
    const futureCandidates = timestampCandidates.filter((x) => x > now + 5_000);
    const selectedRawDueAt = futureCandidates.length
      ? Math.min(...futureCandidates)
      : Math.max(...timestampCandidates);
    const normalizedDueAt = selectedRawDueAt > now + 1_000
      ? selectedRawDueAt
      : now + MIN_DELAY_MS;
    return {
      source: "timestamp",
      rawDueAt: selectedRawDueAt,
      dueAt: normalizedDueAt,
      delayMs: clampDelayMs(normalizedDueAt - now),
    };
  }

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  const hourRegex = /(?:^|[^0-9a-zA-Z])(\d+)\s*(?:h|hour|hours|hr|hrs|saat)(?=$|[^0-9a-zA-Z])/gi;
  for (const match of t.matchAll(hourRegex)) {
    hours += Number(match?.[1] || 0);
  }

  const minuteRegex = /(?:^|[^0-9a-zA-Z])(\d+)\s*(?:m|min|mins|minute|minutes|dk|dakika)(?=$|[^0-9a-zA-Z])/gi;
  for (const match of t.matchAll(minuteRegex)) {
    minutes += Number(match?.[1] || 0);
  }

  const secondRegex = /(?:^|[^0-9a-zA-Z])(\d+)\s*(?:s|sec|secs|second|seconds|sn|saniye)(?=$|[^0-9a-zA-Z])/gi;
  for (const match of t.matchAll(secondRegex)) {
    seconds += Number(match?.[1] || 0);
  }

  const totalMs = (hours * 60 * 60 + minutes * 60 + seconds) * 1000;
  if (totalMs >= MIN_VALID_DURATION_COOLDOWN_MS) {
    const delayMs = clampDelayMs(totalMs);
    return {
      source: "duration",
      rawDueAt: now + totalMs,
      dueAt: now + delayMs,
      delayMs,
    };
  }

  return null;
}

function parseCooldownFromText(text, now = Date.now()) {
  return parseCooldownDetails(text, now)?.delayMs || null;
}

function buildPendingFromBumpMessage(cfg, message, now = Date.now()) {
  if (!cfg?.guildId || !cfg?.channelId || !cfg?.message) return null;

  const text = collectMessageText(message);
  const details = parseCooldownDetails(text, now);
  const messageCreatedAt = Number(message?.createdTimestamp || 0);
  const anchorAt = Number.isFinite(messageCreatedAt) && messageCreatedAt > 0
    ? messageCreatedAt
    : now;
  const fallbackDueAt = anchorAt + DEFAULT_BUMP_COOLDOWN_MS;
  const timestampRawDueAt = Number(details?.rawDueAt || 0);
  const timestampDeltaFromMessage = timestampRawDueAt - anchorAt;
  const hasUsableTimestampCooldown =
    details?.source === "timestamp" &&
    Number.isFinite(timestampRawDueAt) &&
    Number.isFinite(timestampDeltaFromMessage) &&
    timestampDeltaFromMessage >= MIN_VALID_TIMESTAMP_COOLDOWN_MS &&
    timestampDeltaFromMessage <= MAX_DELAY_MS;
  const dueAtRaw = hasUsableTimestampCooldown
    ? timestampRawDueAt
    : details?.source === "duration"
      ? Number(details?.dueAt || fallbackDueAt)
      : fallbackDueAt;
  const dueAt = dueAtRaw > now + 1_000 ? dueAtRaw : (now + MIN_DELAY_MS);

  let intervalMs = DEFAULT_BUMP_COOLDOWN_MS;
  if (details?.source === "duration") {
    intervalMs = clampDelayMs(details.delayMs || DEFAULT_BUMP_COOLDOWN_MS);
  } else if (hasUsableTimestampCooldown) {
    const createdAt = Number(message?.createdTimestamp || 0);
    const rawDueAt = Number(details.rawDueAt || 0);
    const derivedCycleMs = rawDueAt - createdAt;
    if (
      Number.isFinite(derivedCycleMs) &&
      derivedCycleMs >= MIN_DELAY_MS &&
      derivedCycleMs <= MAX_DELAY_MS
    ) {
      intervalMs = clampDelayMs(derivedCycleMs);
    }
  }

  return {
    guildId: cfg.guildId,
    channelId: cfg.channelId,
    message: cfg.message,
    roleIds: cfg.roleIds,
    bumpBotId: String(message?.author?.id || "").trim() || cfg.bumpBotId || null,
    dueAt,
    intervalMs: normalizeLoopIntervalMs(intervalMs),
    updatedAt: now,
  };
}

function isCandidateHistoryBumpMessage(message, cfg) {
  if (!message?.author?.bot) return false;

  const authorId = String(message.author.id || "").trim();
  const cfgBotId = String(cfg?.bumpBotId || "").trim();
  const knownBumpBot = isKnownBumpBot(authorId);
  const text = collectMessageText(message);
  const likelyBump = isLikelyBumpText(text);
  const disboardLike = isLikelyDisboardPayload(message, text);

  if (!likelyBump && !disboardLike) return false;

  if (cfgBotId) {
    if (authorId === cfgBotId) return true;

    const cfgBotKnown = isKnownBumpBot(cfgBotId);
    if (knownBumpBot && !cfgBotKnown) return true;
    return false;
  }

  return knownBumpBot || disboardLike;
}

async function findLatestBumpMessageInChannel(channel, cfg, opts = {}) {
  if (!channel?.messages?.fetch) return null;

  const maxPagesRaw = Number(opts.maxPages || 3);
  const maxPages = Number.isFinite(maxPagesRaw) && maxPagesRaw >= 1
    ? Math.min(Math.floor(maxPagesRaw), 10)
    : 3;

  let before = null;
  for (let page = 0; page < maxPages; page += 1) {
    const query = before ? { limit: 100, before } : { limit: 100 };
    const batch = await (channel.messages.fetch(query) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (!batch?.size) break;

    for (const message of batch.values()) {
      if (isCandidateHistoryBumpMessage(message, cfg)) {
        return message;
      }
    }

    const oldest = typeof batch.last === "function"
      ? batch.last()
      : [...batch.values()].at(-1);
    before = oldest?.id || null;
    if (!before) break;
  }

  return null;
}

async function findLatestBumpMessage(client, cfg) {
  if (!client || !cfg?.guildId || !cfg?.channelId) return null;

  const guild =
    client.guilds?.cache?.get?.(cfg.guildId) ||
    await (client.guilds?.fetch?.(cfg.guildId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!guild) return null;

  const channel =
    guild.channels?.cache?.get?.(cfg.channelId) ||
    await (guild.channels?.fetch?.(cfg.channelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!channel?.isTextBased?.()) return null;

  return findLatestBumpMessageInChannel(channel, cfg);
}

async function sendPendingReminder(client, pending) {
  const guild =
    client.guilds?.cache?.get?.(pending.guildId) ||
    await (client.guilds?.fetch?.(pending.guildId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!guild) return false;

  const channel =
    guild.channels?.cache?.get?.(pending.channelId) ||
    await (guild.channels?.fetch?.(pending.channelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!channel?.isTextBased?.()) return false;

  const validRoleIds = [];
  for (const roleId of pending.roleIds) {
    const role =
      guild.roles?.cache?.get?.(roleId) ||
      await (guild.roles?.fetch?.(roleId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (role?.id) validRoleIds.push(role.id);
  }

  const mentions = validRoleIds.map((id) => `<@&${id}>`).join(" ");
  const content = `${mentions}\n${pending.message}`.trim();
  if (!content) return false;

  const sent = await channel
    .send({
      content,
      allowedMentions: {
        parse: [],
        roles: validRoleIds,
        users: [],
        repliedUser: false,
      },
    })
    .then(() => true)
    .catch(() => false);

  return sent;
}

function schedulePendingReminder(client, pending) {
  const normalized = normalizePending(pending);
  if (!normalized) return;

  clearBumpTimer(normalized.guildId);

  const remaining = normalized.dueAt - Date.now();
  const waitMs = remaining > 0 ? Math.min(remaining, MAX_TIMEOUT_MS) : 250;

  const timer = setTimeout(() => {
    runPendingReminder(client, normalized.guildId).catch((err) => {
      console.error("bump reminder process error:", err);
    });
  }, waitMs);

  if (typeof timer.unref === "function") timer.unref();
  bumpTimers.set(normalized.guildId, timer);
}

async function runPendingReminder(client, guildId) {
  clearBumpTimer(guildId);

  await withStoreLock(guildId, async () => {
    const db = client?.db;
    if (!db) return;
    const enabled = await isBumpReminderEnabled(db, guildId);
    if (!enabled) {
      await clearPending(db, guildId);
      return;
    }

    const pending = await getPending(db, guildId);
    if (!pending) return;

    const remaining = pending.dueAt - Date.now();
    if (remaining > 1_000) {
      schedulePendingReminder(client, pending);
      return;
    }

    const cfg = await (getConfig(db, guildId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    const baseCfg = {
      guildId,
      channelId: cfg?.channelId || pending.channelId,
      message: cfg?.message || pending.message,
      roleIds: (Array.isArray(cfg?.roleIds) && cfg.roleIds.length) ? cfg.roleIds : pending.roleIds,
      bumpBotId: cfg?.bumpBotId || pending.bumpBotId || null,
    };

    const latestBumpMessage = await (findLatestBumpMessage(client, baseCfg) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (latestBumpMessage) {
      const rebuiltPending = buildPendingFromBumpMessage(baseCfg, latestBumpMessage, Date.now());
      if (shouldRescheduleFromLatestBump(pending, rebuiltPending, Date.now())) {
        const refreshedPending = await setPending(db, guildId, rebuiltPending);
        schedulePendingReminder(client, refreshedPending);
        return;
      }
    }

    await sendPendingReminder(client, pending).catch((err) => {
      logSuppressedError(`sendPendingReminder ${guildId}`, err);
    });
    const intervalMs = normalizeLoopIntervalMs(pending.intervalMs || DEFAULT_BUMP_COOLDOWN_MS);
    const nextPending = await setPending(db, guildId, {
      ...pending,
      dueAt: Date.now() + intervalMs,
      intervalMs,
      updatedAt: Date.now(),
    });
    schedulePendingReminder(client, nextPending);
  });
}

async function setBumpReminder(client, data) {
  const db = client?.db;
  if (!db) throw new Error("Veritabani bulunamadi.");

  const guildId = String(data?.guildId || "").trim();
  const channelId = String(data?.channelId || "").trim();
  const authorId = String(data?.authorId || "").trim() || "0";
  const message = String(data?.message || "").trim();
  const roleIds = normalizeRoleIds(data?.roleIds);

  if (!guildId || !channelId || !message || !roleIds.length) {
    throw new Error("Bump remind ayarlari gecersiz.");
  }
  const enabled = await isBumpReminderEnabled(db, guildId);
  if (!enabled) {
    throw new Error("Bump remind sistemi kapali. Once `/bumpremind on` kullan.");
  }

  return withStoreLock(guildId, async () => {
    const existingCfg = await getConfig(db, guildId);

    let nextCfg = await setConfig(db, guildId, {
      guildId,
      channelId,
      authorId,
      message,
      roleIds,
      bumpBotId: existingCfg?.bumpBotId || null,
      updatedAt: Date.now(),
    });

    let nextPending = null;
    const historyMessage = await (findLatestBumpMessage(client, nextCfg) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });

    if (historyMessage?.author?.id) {
      const historyBumpBotId = String(historyMessage.author.id).trim();
      if (historyBumpBotId && nextCfg.bumpBotId !== historyBumpBotId) {
        nextCfg = await setConfig(db, guildId, {
          ...nextCfg,
          bumpBotId: historyBumpBotId,
          updatedAt: Date.now(),
        });
      }
    }

    if (historyMessage) {
      const pendingFromHistory = buildPendingFromBumpMessage(nextCfg, historyMessage, Date.now());
      if (pendingFromHistory) {
        nextPending = await setPending(db, guildId, pendingFromHistory);
        schedulePendingReminder(client, nextPending);
      }
    } else {
      const existingPending = await getPending(db, guildId);
      if (existingPending) {
        nextPending = await setPending(db, guildId, {
          ...existingPending,
          channelId: nextCfg.channelId,
          message: nextCfg.message,
          roleIds: nextCfg.roleIds,
          bumpBotId: nextCfg.bumpBotId || existingPending.bumpBotId || null,
          intervalMs: normalizeLoopIntervalMs(existingPending.intervalMs || DEFAULT_BUMP_COOLDOWN_MS),
          updatedAt: Date.now(),
        });
        schedulePendingReminder(client, nextPending);
      }
    }

    return { config: nextCfg, pending: nextPending };
  });
}

async function getBumpReminder(client, guildId) {
  const db = client?.db;
  if (!db) return { enabled: false, config: null, pending: null };

  const enabled = await isBumpReminderEnabled(db, guildId);
  const config = await getConfig(db, guildId);
  const pending = await getPending(db, guildId);
  return { enabled, config, pending };
}

async function onMessage(message, client) {
  if (!message?.guild || !message?.author?.bot || !client?.db) return;

  const guildId = message.guild.id;
  const enabled = await isBumpReminderEnabled(client.db, guildId);
  if (!enabled) return;

  let cfg = await getConfig(client.db, guildId);
  if (!cfg) return;

  const text = collectMessageText(message);
  const knownBumpBot = isKnownBumpBot(message.author.id);
  const disboardLike = isLikelyDisboardPayload(message, text);
  const likelyBump = isLikelyBumpText(text);

  if (cfg.bumpBotId && cfg.bumpBotId !== message.author.id) {
    const cfgBotIsKnown = isKnownBumpBot(cfg.bumpBotId);
    if (knownBumpBot && !cfgBotIsKnown) {
      cfg = await setConfig(client.db, guildId, {
        ...cfg,
        bumpBotId: String(message.author.id),
        updatedAt: Date.now(),
      });
    } else {
      return;
    }
  }

  if (!cfg.bumpBotId) {
    if (!knownBumpBot && !disboardLike) return;
    cfg = await setConfig(client.db, guildId, {
      ...cfg,
      bumpBotId: String(message.author.id),
      updatedAt: Date.now(),
    });
  }

  if (message.channelId !== cfg.channelId) {
    if (!knownBumpBot && !disboardLike) return;
    cfg = await setConfig(client.db, guildId, {
      ...cfg,
      channelId: String(message.channelId),
      updatedAt: Date.now(),
    });
  }

  if (!likelyBump && !disboardLike) return;

  const nextBumpBotId = cfg.bumpBotId || message.author.id;

  await withStoreLock(guildId, async () => {
    const freshCfg = await getConfig(client.db, guildId);
    if (!freshCfg) return;

    const pendingPayload = buildPendingFromBumpMessage(
      {
        ...freshCfg,
        bumpBotId: freshCfg.bumpBotId || nextBumpBotId,
      },
      message,
      Date.now()
    );
    if (!pendingPayload) return;

    const pending = await setPending(client.db, guildId, {
      guildId,
      ...pendingPayload,
    });

    schedulePendingReminder(client, pending);
  });
}

async function onReady(client) {
  if (!client?.db) return;

  const guilds = [...(client.guilds?.cache?.values?.() || [])];
  for (const guild of guilds) {
    const enabled = await isBumpReminderEnabled(client.db, guild.id);
    if (!enabled) {
      clearBumpTimer(guild.id);
      continue;
    }
    const pending = await getPending(client.db, guild.id);
    if (!pending) continue;
    schedulePendingReminder(client, pending);
  }
}

function init() {}

module.exports = {
  init,
  onReady,
  onMessage,
  setBumpReminder,
  getBumpReminder,
  setBumpReminderEnabled,
  isBumpReminderEnabled,
  __private: {
    withStoreLock,
    isLikelyBumpText,
    isLikelyDisboardPayload,
    parseCooldownDetails,
    parseCooldownFromText,
    buildPendingFromBumpMessage,
    findLatestBumpMessageInChannel,
    normalizeLoopIntervalMs,
    shouldRescheduleFromLatestBump,
  },
};
