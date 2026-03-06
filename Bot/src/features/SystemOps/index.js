const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const ROOT_DIR = path.resolve(__dirname, "../../../");
const DB_FILE_PATH = path.join(ROOT_DIR, "json.sqlite");
const BACKUP_DIR = path.join(ROOT_DIR, "backups", "db");
const PENDING_RESTORE_FILE = path.join(BACKUP_DIR, "pending-restore.sqlite");
const PENDING_RESTORE_META_FILE = path.join(BACKUP_DIR, "pending-restore.json");
const RESTORE_CONFIRM_STORE_FILE = path.join(BACKUP_DIR, "restore-confirmations.json");

const CMD_AUDIT_KEY = (gid) => `command_audit_${gid || "global"}`;
const MAX_AUDIT_ROWS = 300;
const MAX_RATE_CACHE_SIZE = 50_000;
const RATE_CACHE_PRUNE_INTERVAL_MS = 30_000;
const RESTORE_CONFIRM_TTL_MS = 10 * 60 * 1000;
const RESTORE_CONFIRM_CODE_LEN = 6;
const RESTORE_CONFIRM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const runtimeByClient = new WeakMap();
const rateLimitCache = new Map();
const restoreConfirmations = new Map();
let nextRateCacheCleanupAt = 0;
let restoreConfirmLoaded = false;

function ensureBackupDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function pad(num) {
  return String(num || 0).padStart(2, "0");
}

function stampForFile(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hour = pad(d.getHours());
  const min = pad(d.getMinutes());
  const sec = pad(d.getSeconds());
  return `${year}${month}${day}-${hour}${min}${sec}`;
}

function sanitizeReason(reason) {
  return String(reason || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function normalizeBackupFileName(raw) {
  const file = path.basename(String(raw || "").trim());
  if (!file) return null;
  if (!/^db-[a-z0-9_-]{5,40}\.sqlite$/i.test(file)) return null;
  return file;
}

function normalizeBackupFileKey(raw) {
  const file = normalizeBackupFileName(raw);
  return file ? file.toLowerCase() : null;
}

function logSuppressedError(context, err) {
  if (!err) return;
  console.warn(`[SystemOps] ${context}:`, err?.message || err);
}

function resolveBackupSourceFile(raw) {
  ensureBackupDir();
  const normalized = normalizeBackupFileName(raw);
  if (!normalized) return null;

  const lookupKey = normalized.toLowerCase();
  const entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = String(entry.name || "");
    if (!/^db-[a-z0-9_-]{5,40}\.sqlite$/i.test(name)) continue;
    if (name.toLowerCase() !== lookupKey) continue;
    return {
      fileName: name,
      path: path.join(BACKUP_DIR, name),
    };
  }

  const direct = path.join(BACKUP_DIR, normalized);
  if (fs.existsSync(direct)) {
    return {
      fileName: normalized,
      path: direct,
    };
  }

  return null;
}

function normalizeRestoreConfirmCode(input) {
  return String(input || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, RESTORE_CONFIRM_CODE_LEN);
}

function getRestoreConfirmKey(fileName, requestedBy) {
  const normalizedFileName = normalizeBackupFileKey(fileName);
  const requester = String(requestedBy || "").trim();
  if (!normalizedFileName || !requester) return null;
  return `${normalizedFileName}:${requester}`;
}

function persistRestoreConfirmations() {
  try {
    ensureBackupDir();
    if (!restoreConfirmations.size) {
      if (fs.existsSync(RESTORE_CONFIRM_STORE_FILE)) {
        fs.unlinkSync(RESTORE_CONFIRM_STORE_FILE);
      }
      return;
    }

    const payload = {};
    for (const [key, value] of restoreConfirmations.entries()) {
      payload[key] = value;
    }
    fs.writeFileSync(RESTORE_CONFIRM_STORE_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    logSuppressedError("persistRestoreConfirmations", err);
  }
}

function ensureRestoreConfirmationsLoaded(now = Date.now()) {
  if (restoreConfirmLoaded) return;
  restoreConfirmLoaded = true;
  ensureBackupDir();
  if (!fs.existsSync(RESTORE_CONFIRM_STORE_FILE)) return;

  try {
    const raw = fs.readFileSync(RESTORE_CONFIRM_STORE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const entries = parsed && typeof parsed === "object" ? Object.entries(parsed) : [];
    let dirty = false;

    for (const [rawKey, value] of entries) {
      const key = String(rawKey || "").trim();
      if (!key || !value || typeof value !== "object") {
        dirty = true;
        continue;
      }

      const fileName = normalizeBackupFileName(value.fileName || key.split(":")[0] || "");
      const requestedBy = String(value.requestedBy || key.split(":").slice(1).join(":") || "").trim();
      const code = normalizeRestoreConfirmCode(value.code || "");
      const issuedAt = Number(value.issuedAt || now);
      const expiresAt = Number(value.expiresAt || 0);

      if (!fileName || !requestedBy || code.length !== RESTORE_CONFIRM_CODE_LEN) {
        dirty = true;
        continue;
      }
      if (!Number.isFinite(expiresAt) || expiresAt <= now) {
        dirty = true;
        continue;
      }

      const canonicalKey = getRestoreConfirmKey(fileName, requestedBy);
      if (!canonicalKey) {
        dirty = true;
        continue;
      }

      restoreConfirmations.set(canonicalKey, {
        code,
        fileName,
        requestedBy,
        issuedAt: Number.isFinite(issuedAt) && issuedAt > 0 ? issuedAt : now,
        expiresAt,
      });

      if (canonicalKey !== key) dirty = true;
    }

    if (dirty) persistRestoreConfirmations();
  } catch (err) {
    logSuppressedError("ensureRestoreConfirmationsLoaded", err);
  }
}

function pruneRestoreConfirmations(now = Date.now(), opts = {}) {
  ensureRestoreConfirmationsLoaded(now);
  let removed = 0;
  for (const [key, value] of restoreConfirmations.entries()) {
    if (Number(value?.expiresAt || 0) <= now) {
      restoreConfirmations.delete(key);
      removed += 1;
    }
  }
  if (removed && opts?.persist !== false) {
    persistRestoreConfirmations();
  }
  return removed;
}

function generateRestoreConfirmCode() {
  let out = "";
  for (let i = 0; i < RESTORE_CONFIRM_CODE_LEN; i += 1) {
    const idx = Math.floor(Math.random() * RESTORE_CONFIRM_ALPHABET.length);
    out += RESTORE_CONFIRM_ALPHABET[idx];
  }
  return out;
}

function issueRestoreConfirmation(fileName, requestedBy, now = Date.now()) {
  ensureRestoreConfirmationsLoaded(now);
  pruneRestoreConfirmations(now, { persist: false });

  const requester = String(requestedBy || "").trim();
  if (!requester) throw new Error("Gecersiz kullanici.");

  const source = resolveBackupSourceFile(fileName);
  if (!source) throw new Error("Secilen yedek dosyasi bulunamadi.");

  const key = getRestoreConfirmKey(source.fileName, requester);
  if (!key) throw new Error("Gecersiz yedek dosya adi.");

  const code = generateRestoreConfirmCode();
  const issuedAt = Number(now);
  const expiresAt = issuedAt + RESTORE_CONFIRM_TTL_MS;
  const payload = {
    code,
    fileName: source.fileName,
    requestedBy: requester,
    issuedAt,
    expiresAt,
  };
  restoreConfirmations.set(key, payload);
  persistRestoreConfirmations();
  return payload;
}

function consumeRestoreConfirmation(fileName, requestedBy, confirmationCode, now = Date.now()) {
  ensureRestoreConfirmationsLoaded(now);
  const key = getRestoreConfirmKey(fileName, requestedBy);
  const code = normalizeRestoreConfirmCode(confirmationCode);
  if (!key || !code) {
    return { ok: false, reason: "invalid_request" };
  }

  const pending = restoreConfirmations.get(key);
  if (!pending) {
    pruneRestoreConfirmations(now);
    return { ok: false, reason: "not_found" };
  }

  if (Number(pending.expiresAt || 0) <= now) {
    restoreConfirmations.delete(key);
    persistRestoreConfirmations();
    return { ok: false, reason: "expired" };
  }

  if (pending.code !== code) {
    return { ok: false, reason: "invalid_code" };
  }

  restoreConfirmations.delete(key);
  persistRestoreConfirmations();
  return {
    ok: true,
    fileName: pending.fileName,
    requestedBy: pending.requestedBy,
    issuedAt: pending.issuedAt,
    expiresAt: pending.expiresAt,
  };
}

function resetRestoreConfirmations() {
  restoreConfirmations.clear();
  restoreConfirmLoaded = true;
  persistRestoreConfirmations();
}

function reloadRestoreConfirmationsFromDisk(now = Date.now()) {
  restoreConfirmations.clear();
  restoreConfirmLoaded = false;
  ensureRestoreConfirmationsLoaded(now);
  return restoreConfirmations.size;
}

async function backupSqlite(sourcePath, targetPath) {
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(targetPath);
  } finally {
    source.close();
  }
}

function listBackups(limit = 20) {
  ensureBackupDir();
  const files = fs.readdirSync(BACKUP_DIR, { withFileTypes: true })
    .filter((x) => x.isFile())
    .map((x) => x.name)
    .filter((name) => /^db-[a-z0-9_-]{5,40}\.sqlite$/i.test(name))
    .map((name) => {
      const fullPath = path.join(BACKUP_DIR, name);
      const stat = fs.statSync(fullPath);
      return {
        name,
        path: fullPath,
        sizeBytes: Number(stat.size || 0),
        mtimeMs: Number(stat.mtimeMs || 0),
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const safeLimit = Math.max(1, Math.min(200, Number(limit || 20)));
  return files.slice(0, safeLimit);
}

function purgeOldBackups(maxKeep = 24) {
  const keep = Math.max(3, Math.min(200, Number(maxKeep || 24)));
  const backups = listBackups(1000);
  for (const item of backups.slice(keep)) {
    try {
      fs.unlinkSync(item.path);
    } catch (err) {
      logSuppressedError(`purgeOldBackups unlink ${item.path}`, err);
    }
  }
}

async function createBackup(client, opts = {}) {
  ensureBackupDir();
  if (!fs.existsSync(DB_FILE_PATH)) {
    throw new Error("Veritabani dosyasi bulunamadi.");
  }

  const reason = sanitizeReason(opts.reason || "manual");
  const stamp = stampForFile(new Date());
  const suffix = reason ? `-${reason}` : "";
  const name = `db-${stamp}${suffix}.sqlite`;
  const outPath = path.join(BACKUP_DIR, name);

  await backupSqlite(DB_FILE_PATH, outPath);

  const stat = fs.statSync(outPath);
  const info = {
    name,
    path: outPath,
    sizeBytes: Number(stat.size || 0),
    mtimeMs: Number(stat.mtimeMs || Date.now()),
    reason: reason || "manual",
    requestedBy: opts.requestedBy ? String(opts.requestedBy) : null,
  };

  if (client) {
    const runtime = getRuntime(client);
    runtime.lastBackup = info;
  }

  purgeOldBackups(opts.keepCount || process.env.AUTO_BACKUP_KEEP || 24);
  return info;
}

function getPendingRestoreMeta() {
  if (!fs.existsSync(PENDING_RESTORE_META_FILE)) return null;
  try {
    const raw = fs.readFileSync(PENDING_RESTORE_META_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const fileName = normalizeBackupFileName(parsed?.fileName || "");
    if (!fileName) return null;
    return {
      fileName,
      requestedBy: parsed?.requestedBy ? String(parsed.requestedBy) : null,
      requestedAt: Number(parsed?.requestedAt || 0) || 0,
    };
  } catch (err) {
    logSuppressedError("getPendingRestoreMeta parse", err);
    return null;
  }
}

function scheduleRestore(fileName, requestedBy) {
  ensureBackupDir();
  const source = resolveBackupSourceFile(fileName);
  if (!source) throw new Error("Secilen yedek dosyasi bulunamadi.");

  fs.copyFileSync(source.path, PENDING_RESTORE_FILE);
  const requestedAt = Date.now();
  fs.writeFileSync(
    PENDING_RESTORE_META_FILE,
    JSON.stringify({
      fileName: source.fileName,
      requestedBy: requestedBy ? String(requestedBy) : null,
      requestedAt,
    }, null, 2),
    "utf8"
  );

  return {
    fileName: source.fileName,
    requestedBy: requestedBy ? String(requestedBy) : null,
    requestedAt,
  };
}

function applyPendingRestoreIfExists() {
  try {
    if (!fs.existsSync(PENDING_RESTORE_FILE)) {
      return { applied: false, reason: "pending_restore_not_found" };
    }

    ensureBackupDir();
    if (fs.existsSync(DB_FILE_PATH)) {
      const preName = `db-${stampForFile(new Date())}-pre-restore.sqlite`;
      const prePath = path.join(BACKUP_DIR, preName);
      fs.copyFileSync(DB_FILE_PATH, prePath);
    }

    fs.copyFileSync(PENDING_RESTORE_FILE, DB_FILE_PATH);
    fs.unlinkSync(PENDING_RESTORE_FILE);
    if (fs.existsSync(PENDING_RESTORE_META_FILE)) {
      fs.unlinkSync(PENDING_RESTORE_META_FILE);
    }

    return { applied: true };
  } catch (err) {
    return {
      applied: false,
      error: err?.message || String(err),
    };
  }
}

function getRuntime(client) {
  let runtime = runtimeByClient.get(client);
  if (!runtime) {
    runtime = {
      startedAt: Date.now(),
      lastBackup: null,
      autoBackupIntervalMin: 360,
      autoBackupKeep: 24,
      autoBackupTimer: null,
      loopLagMs: 0,
      loopMonitorTimer: null,
      commandCount: 0,
      rateLimitedCount: 0,
    };
    runtimeByClient.set(client, runtime);
  }
  return runtime;
}

function startLoopMonitor(runtime) {
  if (runtime.loopMonitorTimer) return;
  const intervalMs = 10_000;
  let expected = Date.now() + intervalMs;
  runtime.loopMonitorTimer = setInterval(() => {
    const now = Date.now();
    runtime.loopLagMs = Math.max(0, now - expected);
    expected = now + intervalMs;
  }, intervalMs);
  if (typeof runtime.loopMonitorTimer.unref === "function") {
    runtime.loopMonitorTimer.unref();
  }
}

function cleanupRateLimitCache(now = Date.now(), opts = {}) {
  const force = Boolean(opts?.force);
  const shouldPruneBySize = rateLimitCache.size >= MAX_RATE_CACHE_SIZE;
  const shouldPruneByTime = now >= nextRateCacheCleanupAt;

  if (!force && !shouldPruneBySize && !shouldPruneByTime) return 0;

  let removed = 0;
  for (const [key, item] of rateLimitCache.entries()) {
    const expiresAt = Number(item?.expiresAt || 0);
    if (!expiresAt || expiresAt <= now) {
      rateLimitCache.delete(key);
      removed += 1;
    }
  }

  if (rateLimitCache.size > MAX_RATE_CACHE_SIZE) {
    const overflow = rateLimitCache.size - MAX_RATE_CACHE_SIZE;
    const keys = rateLimitCache.keys();
    for (let i = 0; i < overflow; i += 1) {
      const oldestKey = keys.next().value;
      if (!oldestKey) break;
      rateLimitCache.delete(oldestKey);
      removed += 1;
    }
  }

  nextRateCacheCleanupAt = now + RATE_CACHE_PRUNE_INTERVAL_MS;
  return removed;
}

function resetRateLimitCache() {
  rateLimitCache.clear();
  nextRateCacheCleanupAt = 0;
}

function getCommandCooldownMs(commandName) {
  const name = String(commandName || "").trim().toLowerCase();
  const map = {
    servertop: 3000,
    profile: 2000,
    market: 1500,
    muzik: 700,
    help: 1000,
  };
  return Number(map[name] || 1200);
}

function checkCommandRateLimit(interaction, client) {
  if (!interaction?.isChatInputCommand?.() || !interaction?.user?.id) {
    return { limited: false, retryMs: 0 };
  }

  const now = Date.now();
  cleanupRateLimitCache(now);

  const userId = String(interaction.user.id);
  const guildId = String(interaction.guildId || "dm");
  const command = String(interaction.commandName || "").toLowerCase();

  const globalKey = `${guildId}:${userId}:*`;
  const commandKey = `${guildId}:${userId}:${command}`;

  const memberHasManageGuild =
    interaction.memberPermissions?.has?.(0x20n) ||
    interaction.memberPermissions?.has?.(0x8n);
  const globalMs = memberHasManageGuild ? 300 : 600;
  const commandMs = memberHasManageGuild
    ? Math.min(800, getCommandCooldownMs(command))
    : getCommandCooldownMs(command);

  const globalHit = rateLimitCache.get(globalKey);
  if (globalHit && globalHit.expiresAt > now) {
    const runtime = client ? getRuntime(client) : null;
    if (runtime) runtime.rateLimitedCount += 1;
    return {
      limited: true,
      retryMs: globalHit.expiresAt - now,
    };
  }

  const commandHit = rateLimitCache.get(commandKey);
  if (commandHit && commandHit.expiresAt > now) {
    const runtime = client ? getRuntime(client) : null;
    if (runtime) runtime.rateLimitedCount += 1;
    return {
      limited: true,
      retryMs: commandHit.expiresAt - now,
    };
  }

  rateLimitCache.set(globalKey, { expiresAt: now + globalMs });
  rateLimitCache.set(commandKey, { expiresAt: now + commandMs });

  return { limited: false, retryMs: 0 };
}

async function recordCommandAudit(interaction, client, payload = {}) {
  if (!client?.db || !interaction?.isChatInputCommand?.()) return;

  const guildId = String(interaction.guildId || "global");
  const subcommand = interaction.options?.getSubcommand?.(false) || null;
  const row = {
    at: Date.now(),
    guildId,
    channelId: String(interaction.channelId || ""),
    userId: String(interaction.user?.id || ""),
    userTag: String(interaction.user?.tag || interaction.user?.username || ""),
    command: String(interaction.commandName || ""),
    subcommand: subcommand ? String(subcommand) : null,
    ok: payload?.ok !== false,
    durationMs: Number(payload?.durationMs || 0),
    error: payload?.error ? String(payload.error).slice(0, 300) : null,
  };

  const key = CMD_AUDIT_KEY(guildId);
  const oldRows = await client.db.get(key).catch((err) => {
    logSuppressedError(`recordCommandAudit get ${key}`, err);
    return null;
  });
  const rows = Array.isArray(oldRows) ? oldRows : [];
  rows.push(row);
  while (rows.length > MAX_AUDIT_ROWS) rows.shift();
  await client.db.set(key, rows).catch((err) => {
    logSuppressedError(`recordCommandAudit set ${key}`, err);
  });

  const runtime = getRuntime(client);
  runtime.commandCount += 1;
}

async function getRecentCommandAudit(client, guildId, limit = 5) {
  if (!client?.db) return [];
  const key = CMD_AUDIT_KEY(String(guildId || "global"));
  const rows = await client.db.get(key).catch((err) => {
    logSuppressedError(`getRecentCommandAudit get ${key}`, err);
    return null;
  });
  const arr = Array.isArray(rows) ? rows : [];
  const take = Math.max(1, Math.min(20, Number(limit || 5)));
  return arr.slice(-take).reverse();
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let idx = 0;
  let n = value;
  while (n >= 1024 && idx < units.length - 1) {
    n /= 1024;
    idx += 1;
  }
  return `${n.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatDurationMs(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const day = Math.floor(totalSec / 86400);
  const hour = Math.floor((totalSec % 86400) / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;

  const parts = [];
  if (day) parts.push(`${day}g`);
  if (hour || day) parts.push(`${hour}s`);
  if (min || hour || day) parts.push(`${min}d`);
  parts.push(`${sec}sn`);
  return parts.join(" ");
}

async function getStatus(client, guildId) {
  const runtime = getRuntime(client);
  const mem = process.memoryUsage();
  const startedAt = runtime.startedAt || Date.now();

  const dbStart = Date.now();
  await (typeof client?.db?.get === "function"
    ? client.db.get("__status_ping__")
    : Promise.resolve(null)).catch((err) => {
      globalThis.__airWarnSuppressedError?.(err);
      return null;
    });
  const dbLatencyMs = Date.now() - dbStart;

  const backups = listBackups(1);
  const lastBackup = runtime.lastBackup || backups[0] || null;

  return {
    startedAt,
    uptimeMs: Date.now() - startedAt,
    wsPingMs: Number(client?.ws?.ping || 0),
    dbLatencyMs,
    guildCount: Number(client?.guilds?.cache?.size || 0),
    memory: {
      rss: Number(mem.rss || 0),
      heapUsed: Number(mem.heapUsed || 0),
      heapTotal: Number(mem.heapTotal || 0),
    },
    loopLagMs: Number(runtime.loopLagMs || 0),
    commandCount: Number(runtime.commandCount || 0),
    rateLimitedCount: Number(runtime.rateLimitedCount || 0),
    autoBackup: {
      intervalMin: Number(runtime.autoBackupIntervalMin || 0),
      keepCount: Number(runtime.autoBackupKeep || 0),
    },
    lastBackup,
    pendingRestore: getPendingRestoreMeta(),
    auditRecent: await getRecentCommandAudit(client, guildId, 5),
  };
}

function init(client) {
  const runtime = getRuntime(client);
  startLoopMonitor(runtime);

  runtime.autoBackupIntervalMin = Math.max(
    0,
    Math.min(24 * 60, Number(process.env.AUTO_BACKUP_INTERVAL_MIN || 360))
  );
  runtime.autoBackupKeep = Math.max(
    3,
    Math.min(200, Number(process.env.AUTO_BACKUP_KEEP || 24))
  );

  if (runtime.autoBackupTimer) return;
  if (runtime.autoBackupIntervalMin <= 0) return;

  const intervalMs = runtime.autoBackupIntervalMin * 60 * 1000;
  runtime.autoBackupTimer = setInterval(() => {
    createBackup(client, {
      reason: "auto",
      keepCount: runtime.autoBackupKeep,
    }).catch((err) => {
      console.error("Auto backup error:", err?.message || err);
    });
  }, intervalMs);

  if (typeof runtime.autoBackupTimer.unref === "function") {
    runtime.autoBackupTimer.unref();
  }
}

async function onReady(client) {
  const runtime = getRuntime(client);
  const onReadyFlag = String(process.env.AUTO_BACKUP_ON_READY || "1").trim().toLowerCase();
  const shouldBackupNow = ["1", "true", "yes", "on"].includes(onReadyFlag);
  if (!shouldBackupNow) return;

  await createBackup(client, {
    reason: "startup",
    keepCount: runtime.autoBackupKeep,
  }).catch((err) => {
    console.error("Startup backup error:", err?.message || err);
  });
}

module.exports = {
  init,
  onReady,
  createBackup,
  listBackups,
  issueRestoreConfirmation,
  consumeRestoreConfirmation,
  scheduleRestore,
  getPendingRestoreMeta,
  getStatus,
  checkCommandRateLimit,
  recordCommandAudit,
  getRecentCommandAudit,
  applyPendingRestoreIfExists,
  __private: {
    sanitizeReason,
    normalizeBackupFileName,
    normalizeBackupFileKey,
    resolveBackupSourceFile,
    normalizeRestoreConfirmCode,
    formatBytes,
    formatDurationMs,
    stampForFile,
    cleanupRateLimitCache,
    resetRateLimitCache,
    pruneRestoreConfirmations,
    resetRestoreConfirmations,
    reloadRestoreConfirmationsFromDisk,
    rateLimitCache,
    restoreConfirmations,
    RESTORE_CONFIRM_STORE_FILE,
    MAX_RATE_CACHE_SIZE,
    RATE_CACHE_PRUNE_INTERVAL_MS,
    RESTORE_CONFIRM_TTL_MS,
    RESTORE_CONFIRM_CODE_LEN,
  },
};
