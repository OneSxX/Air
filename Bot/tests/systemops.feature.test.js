const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const systemOps = require("../src/features/SystemOps");

const BACKUP_DIR = path.resolve(__dirname, "../backups/db");

function createBackupFixture(fileName) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const fullPath = path.join(BACKUP_DIR, fileName);
  fs.writeFileSync(fullPath, "fixture", "utf8");
  return fullPath;
}

function buildInteraction({
  userId = "100",
  guildId = "200",
  commandName = "help",
  manageGuild = false,
} = {}) {
  return {
    user: { id: String(userId) },
    guildId: String(guildId),
    commandName: String(commandName),
    isChatInputCommand: () => true,
    memberPermissions: {
      has: (perm) =>
        Boolean(manageGuild) &&
        (perm === 0x20n || perm === 0x8n || perm === 0x20 || perm === 0x8),
    },
  };
}

test("normalizeBackupFileName accepts valid db backup names", () => {
  const { normalizeBackupFileName } = systemOps.__private;
  assert.equal(
    normalizeBackupFileName("db-20260101-120000-manual.sqlite"),
    "db-20260101-120000-manual.sqlite"
  );
  assert.equal(normalizeBackupFileName("../db-20260101.sqlite"), "db-20260101.sqlite");
  assert.equal(normalizeBackupFileName("bad.txt"), null);
});

test("formatBytes and formatDurationMs render readable text", () => {
  const { formatBytes, formatDurationMs } = systemOps.__private;
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1024), "1.0 KB");
  assert.equal(formatDurationMs(65_000), "1d 5sn");
});

test("checkCommandRateLimit enforces cooldown and resets after expiry", () => {
  const { resetRateLimitCache } = systemOps.__private;
  const originalNow = Date.now;
  let now = 10_000;
  Date.now = () => now;
  resetRateLimitCache();

  try {
    const interaction = buildInteraction({ commandName: "help" });

    const first = systemOps.checkCommandRateLimit(interaction, null);
    assert.equal(first.limited, false);

    const second = systemOps.checkCommandRateLimit(interaction, null);
    assert.equal(second.limited, true);
    assert.ok(Number(second.retryMs || 0) > 0);

    now += 1_500;
    const third = systemOps.checkCommandRateLimit(interaction, null);
    assert.equal(third.limited, false);
  } finally {
    Date.now = originalNow;
    resetRateLimitCache();
  }
});

test("cleanupRateLimitCache prunes expired entries before cache hits max size", () => {
  const {
    resetRateLimitCache,
    cleanupRateLimitCache,
    rateLimitCache,
    RATE_CACHE_PRUNE_INTERVAL_MS,
  } = systemOps.__private;
  const originalNow = Date.now;
  let now = 50_000;
  Date.now = () => now;
  resetRateLimitCache();

  try {
    const interaction = buildInteraction({ commandName: "help" });
    systemOps.checkCommandRateLimit(interaction, null);
    assert.ok(rateLimitCache.size >= 2);

    for (const item of rateLimitCache.values()) {
      item.expiresAt = now - 1;
    }

    now += RATE_CACHE_PRUNE_INTERVAL_MS + 1;
    const removed = cleanupRateLimitCache(now);
    assert.ok(removed >= 2);
    assert.equal(rateLimitCache.size, 0);
  } finally {
    Date.now = originalNow;
    resetRateLimitCache();
  }
});

test("restore confirmation code is one-time and bound to file+user", () => {
  const {
    resetRestoreConfirmations,
    RESTORE_CONFIRM_CODE_LEN,
  } = systemOps.__private;
  const fileName = "db-20990101-010101-manual.sqlite";
  const fullPath = createBackupFixture(fileName);

  try {
    resetRestoreConfirmations();
    const issued = systemOps.issueRestoreConfirmation(fileName, "100000000000000001", 1_000);

    assert.equal(issued.fileName, fileName);
    assert.equal(String(issued.code || "").length, RESTORE_CONFIRM_CODE_LEN);

    const consumed = systemOps.consumeRestoreConfirmation(
      fileName,
      "100000000000000001",
      issued.code,
      1_500
    );
    assert.equal(consumed.ok, true);

    const secondAttempt = systemOps.consumeRestoreConfirmation(
      fileName,
      "100000000000000001",
      issued.code,
      1_600
    );
    assert.equal(secondAttempt.ok, false);
    assert.equal(secondAttempt.reason, "not_found");
  } finally {
    resetRestoreConfirmations();
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }
});

test("restore confirmation expires after TTL", () => {
  const {
    resetRestoreConfirmations,
    RESTORE_CONFIRM_TTL_MS,
  } = systemOps.__private;
  const fileName = "db-20990101-010201-manual.sqlite";
  const fullPath = createBackupFixture(fileName);

  try {
    resetRestoreConfirmations();
    const issued = systemOps.issueRestoreConfirmation(fileName, "100000000000000002", 5_000);
    const result = systemOps.consumeRestoreConfirmation(
      fileName,
      "100000000000000002",
      issued.code,
      5_000 + RESTORE_CONFIRM_TTL_MS + 1
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, "expired");
  } finally {
    resetRestoreConfirmations();
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }
});

test("restore confirmation accepts mixed-case backup filename input", () => {
  const { resetRestoreConfirmations } = systemOps.__private;
  const fileName = "db-20990101-010301-manual.sqlite";
  const fullPath = createBackupFixture(fileName);

  try {
    resetRestoreConfirmations();
    const issued = systemOps.issueRestoreConfirmation(fileName.toUpperCase(), "100000000000000003", 10_000);
    const consumed = systemOps.consumeRestoreConfirmation(
      fileName.toLowerCase(),
      "100000000000000003",
      issued.code,
      10_500
    );

    assert.equal(consumed.ok, true);
    assert.equal(consumed.fileName, fileName);
  } finally {
    resetRestoreConfirmations();
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }
});

test("restore confirmations survive process-level reload via disk store", () => {
  const {
    resetRestoreConfirmations,
    reloadRestoreConfirmationsFromDisk,
    restoreConfirmations,
    RESTORE_CONFIRM_STORE_FILE,
  } = systemOps.__private;
  const fileName = "db-20990101-010401-manual.sqlite";
  const fullPath = createBackupFixture(fileName);

  try {
    resetRestoreConfirmations();
    const issued = systemOps.issueRestoreConfirmation(fileName, "100000000000000004", 20_000);
    assert.equal(fs.existsSync(RESTORE_CONFIRM_STORE_FILE), true);

    restoreConfirmations.clear();
    assert.equal(restoreConfirmations.size, 0);
    const loadedCount = reloadRestoreConfirmationsFromDisk(20_500);
    assert.equal(loadedCount >= 1, true);

    const consumed = systemOps.consumeRestoreConfirmation(
      fileName,
      "100000000000000004",
      issued.code,
      20_600
    );
    assert.equal(consumed.ok, true);
  } finally {
    resetRestoreConfirmations();
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    if (fs.existsSync(RESTORE_CONFIRM_STORE_FILE)) fs.unlinkSync(RESTORE_CONFIRM_STORE_FILE);
  }
});
