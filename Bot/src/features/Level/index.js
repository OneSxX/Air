const USER_KEY = (gid, uid) => `lvl_user_${gid}_${uid}`;
const USERS_KEY = (gid) => `lvl_users_${gid}`;
const CFG_KEY = (gid) => `lvl_cfg_${gid}`;
const VOICE_SESSION_KEY = (gid, uid) => `${gid}:${uid}`;
const LEAVE_RESET_KEY = (gid) => `lvl_leave_reset_${gid}`;

const FIXED_TEXT_XP_MIN = 1;
const FIXED_TEXT_XP_MAX = 5;
const FIXED_TEXT_XP_COOLDOWN_MS = 120_000;

const DEFAULT_CFG = {
  enabled: true,
  minXp: FIXED_TEXT_XP_MIN,
  maxXp: FIXED_TEXT_XP_MAX,
  cooldownMs: FIXED_TEXT_XP_COOLDOWN_MS,
  minMessageLength: 3,
  disabledChannelIds: [],
  textRoleRewards: [],
  voiceRoleRewards: [],
};

const DAY_MS = 86_400_000;
const DAILY_KEEP_DAYS = 45;
const TOP_KEEP_ITEMS = 40;
const GET_ALL_ROWS_BATCH_SIZE = 40;
const VOICE_XP_INTERVAL_SEC = 60;
const VOICE_XP_PER_INTERVAL = 1;
const COIN_DECIMAL_SCALE = 10;
const MESSAGE_COIN_GAIN_DECI = 1; // 0.1 coin
const MESSAGE_COIN_COOLDOWN_MS = 60_000;
const VOICE_COIN_INTERVAL_SEC = 60;
const VOICE_COIN_PER_INTERVAL_DECI = 1; // 0.1 coin / minute
const LEAVE_RESET_DELAY_MS = 7 * 24 * 60 * 60 * 1000;
const LEAVE_RESET_SWEEP_INTERVAL_MS = 10 * 60 * 1000;

const cfgCache = new Map();
const cfgCacheTtlMs = 5_000;
const gainCooldown = new Map();
const messageCoinCooldown = new Map();
const activeVoiceSessions = new Map();
const userLocks = new Map();
const sessionBootstrapClients = new WeakSet();
const leaveResetSweepTimers = new WeakMap();

function randomInt(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function xpForNextLevel(level) {
  const lv = Number(level) || 0;
  return 100 + lv * 50 + lv * lv * 10;
}

function applyLevelProgress(level, xp, gain) {
  let nextLevel = Number.isFinite(Number(level)) ? Math.max(0, Math.floor(Number(level))) : 0;
  let nextXp = Number.isFinite(Number(xp)) ? Math.max(0, Math.floor(Number(xp))) : 0;
  const safeGain = Number.isFinite(Number(gain)) ? Math.max(0, Math.floor(Number(gain))) : 0;

  nextXp += safeGain;
  while (nextXp >= xpForNextLevel(nextLevel)) {
    nextXp -= xpForNextLevel(nextLevel);
    nextLevel += 1;
  }

  return { level: nextLevel, xp: nextXp, gain: safeGain };
}

function dayKeyFromTs(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

function nextUtcDayStartMs(ts) {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

function normalizeDailyMap(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;

  for (const [day, value] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) continue;
    out[day] = Math.floor(n);
  }

  return out;
}

function normalizeCounterMap(raw, valueKey) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;

  for (const [id, value] of Object.entries(raw)) {
    if (!id) continue;

    if (value && typeof value === "object") {
      const amount = Number(value[valueKey]);
      const updatedAt = Number(value.updatedAt);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      out[id] = {
        [valueKey]: Math.floor(amount),
        updatedAt: Number.isFinite(updatedAt) ? Math.floor(updatedAt) : Date.now(),
      };
      continue;
    }

    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    out[id] = {
      [valueKey]: Math.floor(amount),
      updatedAt: Date.now(),
    };
  }

  return out;
}

function pruneDailyMap(map, now = Date.now(), keepDays = DAILY_KEEP_DAYS) {
  if (!map || typeof map !== "object") return {};

  const threshold = now - keepDays * DAY_MS;
  for (const day of Object.keys(map)) {
    const ts = Date.parse(`${day}T00:00:00.000Z`);
    const amount = Number(map[day]);
    if (!Number.isFinite(ts) || ts < threshold || !Number.isFinite(amount) || amount <= 0) {
      delete map[day];
    }
  }
  return map;
}

function pruneCounterMap(map, valueKey, limit = TOP_KEEP_ITEMS) {
  if (!map || typeof map !== "object") return {};

  const rows = Object.entries(map)
    .map(([id, value]) => ({
      id,
      amount: Number(value?.[valueKey] || 0),
      updatedAt: Number(value?.updatedAt || 0),
    }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount;
      return b.updatedAt - a.updatedAt;
    })
    .slice(0, Math.max(0, limit));

  for (const key of Object.keys(map)) delete map[key];
  for (const row of rows) {
    map[row.id] = { [valueKey]: Math.floor(row.amount), updatedAt: row.updatedAt || Date.now() };
  }

  return map;
}

function normalizeStats(raw) {
  const out = raw && typeof raw === "object" ? { ...raw } : {};

  out.dailyMessages = pruneDailyMap(normalizeDailyMap(out.dailyMessages));
  out.dailyVoiceSec = pruneDailyMap(normalizeDailyMap(out.dailyVoiceSec));

  out.channelText = pruneCounterMap(normalizeCounterMap(out.channelText, "count"), "count");
  out.channelVoice = pruneCounterMap(normalizeCounterMap(out.channelVoice, "seconds"), "seconds");
  out.commands = pruneCounterMap(normalizeCounterMap(out.commands, "count"), "count");

  return out;
}

function normalizeUserData(raw) {
  const out = raw && typeof raw === "object" ? { ...raw } : {};

  const legacyLevel = Number.isFinite(Number(out.level)) ? Number(out.level) : 0;
  const legacyXp = Number.isFinite(Number(out.xp)) ? Number(out.xp) : 0;
  const legacyTotalXp = Number.isFinite(Number(out.totalXp)) ? Number(out.totalXp) : 0;

  out.textLevel = Number.isFinite(Number(out.textLevel)) ? Number(out.textLevel) : legacyLevel;
  out.textXp = Number.isFinite(Number(out.textXp)) ? Number(out.textXp) : legacyXp;
  out.textTotalXp = Number.isFinite(Number(out.textTotalXp)) ? Number(out.textTotalXp) : legacyTotalXp;

  out.voiceLevel = Number.isFinite(Number(out.voiceLevel)) ? Number(out.voiceLevel) : 0;
  out.voiceXp = Number.isFinite(Number(out.voiceXp)) ? Number(out.voiceXp) : 0;
  out.voiceTotalXp = Number.isFinite(Number(out.voiceTotalXp)) ? Number(out.voiceTotalXp) : 0;
  const legacyCoins = Number.isFinite(Number(out.coins)) ? Number(out.coins) : 0;
  out.coinDeci = Number.isFinite(Number(out.coinDeci))
    ? Math.max(0, Math.floor(Number(out.coinDeci)))
    : Math.max(0, Math.round(legacyCoins * COIN_DECIMAL_SCALE));
  out.coins = out.coinDeci / COIN_DECIMAL_SCALE;

  // Geriye donuk uyumluluk: eski alanlar yazi seviyesi alanlariyla ayni tutulur.
  out.level = out.textLevel;
  out.xp = out.textXp;
  out.totalXp = out.textTotalXp;
  out.messages = Number.isFinite(Number(out.messages)) ? Number(out.messages) : 0;
  out.updatedAt = Number.isFinite(Number(out.updatedAt)) ? Number(out.updatedAt) : Date.now();
  out.stats = normalizeStats(out.stats);
  return out;
}

function normalizeCfg(raw) {
  const out = raw && typeof raw === "object" ? { ...DEFAULT_CFG, ...raw } : { ...DEFAULT_CFG };
  out.enabled = Boolean(out.enabled);
  out.minXp = FIXED_TEXT_XP_MIN;
  out.maxXp = FIXED_TEXT_XP_MAX;
  out.cooldownMs = FIXED_TEXT_XP_COOLDOWN_MS;
  out.minMessageLength = Number.isFinite(Number(out.minMessageLength))
    ? Math.max(1, Math.floor(Number(out.minMessageLength)))
    : DEFAULT_CFG.minMessageLength;
  const disabledIds = Array.isArray(out.disabledChannelIds) ? out.disabledChannelIds : [];
  out.disabledChannelIds = [...new Set(disabledIds.map((x) => String(x || "").trim()).filter(Boolean))];
  out.textRoleRewards = normalizeRoleRewards(out.textRoleRewards);
  out.voiceRoleRewards = normalizeRoleRewards(out.voiceRoleRewards);
  return out;
}

function normalizeRoleRewards(raw) {
  const input = Array.isArray(raw) ? raw : [];
  const byLevel = new Map();

  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const level = Math.floor(Number(item.level));
    const roleId = String(item.roleId || "").trim();
    if (!Number.isFinite(level) || level < 1 || level > 10_000) continue;
    if (!/^\d{15,25}$/.test(roleId)) continue;
    byLevel.set(level, { level, roleId });
  }

  return [...byLevel.values()]
    .sort((a, b) => a.level - b.level)
    .slice(0, 250);
}

function collectRewardRoleIds(cfg, levelType, oldLevel, newLevel) {
  const list = levelType === "voice" ? cfg?.voiceRoleRewards : cfg?.textRoleRewards;
  if (!Array.isArray(list) || !list.length) return [];

  const oldLv = Math.max(0, Math.floor(Number(oldLevel) || 0));
  const newLv = Math.max(0, Math.floor(Number(newLevel) || 0));
  if (newLv <= oldLv) return [];

  const out = [];
  const seen = new Set();
  for (const row of list) {
    const level = Math.floor(Number(row?.level));
    const roleId = String(row?.roleId || "").trim();
    if (!Number.isFinite(level) || level <= oldLv || level > newLv) continue;
    if (!/^\d{15,25}$/.test(roleId) || seen.has(roleId)) continue;
    seen.add(roleId);
    out.push(roleId);
  }
  return out;
}

async function grantRewardRolesForLevelUp(guild, memberInput, cfg, levelType, oldLevel, newLevel) {
  if (!guild || !cfg) return [];
  const roleIds = collectRewardRoleIds(cfg, levelType, oldLevel, newLevel);
  if (!roleIds.length) return [];

  let member = memberInput || null;
  const memberId = String(memberInput?.id || "").trim();
  if ((!member || !member.roles?.add) && memberId) {
    member = await (guild.members.fetch(memberId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  }
  if (!member?.roles?.add || member.user?.bot) return [];

  const me = guild.members?.me || null;
  if (!me?.roles?.highest) return [];

  const granted = [];
  const reason = `Level role reward (${levelType})`;

  for (const roleId of roleIds) {
    const role = guild.roles?.cache?.get?.(roleId) || await (guild.roles?.fetch?.(roleId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (!role || role.id === guild.id || role.managed) continue;
    if (role.position >= me.roles.highest.position) continue;
    if (member.roles?.cache?.has?.(role.id)) continue;

    await (member.roles.add(role, reason) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    if (member.roles?.cache?.has?.(role.id)) granted.push(role.id);
  }

  return granted;
}

function normalizeLeaveResetMap(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const [uid, row] of Object.entries(source)) {
    const id = String(uid || "").trim();
    if (!/^\d{15,25}$/.test(id)) continue;
    const dueAt = Number(row?.dueAt || 0);
    const leftAt = Number(row?.leftAt || 0);
    if (!Number.isFinite(dueAt) || dueAt <= 0) continue;
    out[id] = {
      dueAt: Math.floor(dueAt),
      leftAt: Number.isFinite(leftAt) && leftAt > 0 ? Math.floor(leftAt) : 0,
    };
  }
  return out;
}

function markLeaveReset(map, uid, now = Date.now()) {
  const out = normalizeLeaveResetMap(map);
  const id = String(uid || "").trim();
  if (!/^\d{15,25}$/.test(id)) return out;
  out[id] = {
    leftAt: Math.floor(now),
    dueAt: Math.floor(now + LEAVE_RESET_DELAY_MS),
  };
  return out;
}

function clearLeaveReset(map, uid) {
  const out = normalizeLeaveResetMap(map);
  const id = String(uid || "").trim();
  if (!id || !out[id]) return out;
  delete out[id];
  return out;
}

function resolveDueLeaveResets(map, now = Date.now()) {
  const out = normalizeLeaveResetMap(map);
  const dueUserIds = [];
  for (const [uid, row] of Object.entries(out)) {
    if (Number(row?.dueAt || 0) <= now) dueUserIds.push(uid);
  }
  return {
    map: out,
    dueUserIds,
  };
}

async function loadLeaveResetMap(db, gid) {
  const raw = await (db.get(LEAVE_RESET_KEY(gid)) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  const normalized = normalizeLeaveResetMap(raw);
  if (!raw || JSON.stringify(raw) !== JSON.stringify(normalized)) {
    await (db.set(LEAVE_RESET_KEY(gid), normalized) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }
  return normalized;
}

async function saveLeaveResetMap(db, gid, map) {
  const normalized = normalizeLeaveResetMap(map);
  await (db.set(LEAVE_RESET_KEY(gid), normalized) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  return normalized;
}

async function resetUserProgress(db, gid, uid) {
  const id = String(uid || "").trim();
  if (!/^\d{15,25}$/.test(id)) return false;

  await (db.delete(USER_KEY(gid, id)) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  const listed = await db.get(USERS_KEY(gid)).catch(() => []);
  const arr = Array.isArray(listed) ? listed.map((x) => String(x || "")) : [];
  const next = arr.filter((x) => x && x !== id);
  if (next.length !== arr.length) {
    await (db.set(USERS_KEY(gid), next) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  gainCooldown.delete(`${gid}:${id}`);
  messageCoinCooldown.delete(`${gid}:${id}`);
  activeVoiceSessions.delete(VOICE_SESSION_KEY(gid, id));
  return true;
}

async function runDueLeaveResetsForGuild(client, guild) {
  if (!client?.db || !guild?.id) return { resetCount: 0, pendingCount: 0 };
  const gid = guild.id;
  const now = Date.now();
  const map = await loadLeaveResetMap(client.db, gid);
  const { dueUserIds } = resolveDueLeaveResets(map, now);
  if (!dueUserIds.length) {
    return { resetCount: 0, pendingCount: Object.keys(map).length };
  }

  let resetCount = 0;
  for (const uid of dueUserIds) {
    const member = await (guild.members.fetch(uid) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (member) {
      // Kullanici geri donmus ama event kacmis olabilir; reset iptal.
      delete map[uid];
      continue;
    }

    const done = await resetUserProgress(client.db, gid, uid);
    if (done) resetCount += 1;
    delete map[uid];
  }

  await saveLeaveResetMap(client.db, gid, map);
  return { resetCount, pendingCount: Object.keys(map).length };
}

async function runDueLeaveResetsForAllGuilds(client) {
  const guilds = [...(client?.guilds?.cache?.values?.() || [])];
  for (const guild of guilds) {
    await (runDueLeaveResetsForGuild(client, guild) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }
}

function startLeaveResetSweeper(client) {
  if (!client || leaveResetSweepTimers.has(client)) return;
  const timer = setInterval(() => {
    runDueLeaveResetsForAllGuilds(client).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }, LEAVE_RESET_SWEEP_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
  leaveResetSweepTimers.set(client, timer);
}

function isLevelDisabledChannel(cfg, channelId) {
  const id = String(channelId || "").trim();
  if (!id) return false;
  return Array.isArray(cfg?.disabledChannelIds) && cfg.disabledChannelIds.includes(id);
}

function isLevelDisabledMessageChannel(cfg, message) {
  if (!message) return false;
  if (isLevelDisabledChannel(cfg, message.channelId)) return true;
  const parentId = message.channel?.parentId;
  if (parentId && isLevelDisabledChannel(cfg, parentId)) return true;
  return false;
}

function withUserLock(gid, uid, task) {
  const key = `${gid}:${uid}`;
  const prev = userLocks.get(key) || Promise.resolve();

  const next = prev
    .catch((err) => { globalThis.__airWarnSuppressedError?.(err); })
    .then(task)
    .finally(() => {
      if (userLocks.get(key) === next) userLocks.delete(key);
    });

  userLocks.set(key, next);
  return next;
}

function incDaily(map, dayKey, amount = 1) {
  const next = (Number(map[dayKey]) || 0) + amount;
  if (next <= 0) {
    delete map[dayKey];
    return;
  }
  map[dayKey] = Math.floor(next);
}

function incCounter(map, key, valueKey, amount = 1, now = Date.now()) {
  if (!key) return;
  const current =
    map[key] && typeof map[key] === "object"
      ? map[key]
      : {
          [valueKey]: 0,
          updatedAt: now,
        };

  const next = (Number(current[valueKey]) || 0) + amount;
  if (next <= 0) {
    delete map[key];
    return;
  }

  current[valueKey] = Math.floor(next);
  current.updatedAt = now;
  map[key] = current;
}

function addCoin(user, deciAmount) {
  const gain = Number.isFinite(Number(deciAmount)) ? Math.max(0, Math.floor(Number(deciAmount))) : 0;
  if (gain <= 0) return 0;
  user.coinDeci = Math.max(0, Math.floor(Number(user.coinDeci || 0))) + gain;
  user.coins = user.coinDeci / COIN_DECIMAL_SCALE;
  return gain;
}

function applyMessageActivity(user, channelId, now = Date.now()) {
  const day = dayKeyFromTs(now);
  user.messages += 1;
  incDaily(user.stats.dailyMessages, day, 1);
  if (channelId) {
    incCounter(user.stats.channelText, channelId, "count", 1, now);
  }

  pruneDailyMap(user.stats.dailyMessages, now);
  pruneCounterMap(user.stats.channelText, "count");
}

function applyCommandActivity(user, commandName, now = Date.now()) {
  if (!commandName) return;
  incCounter(user.stats.commands, commandName, "count", 1, now);
  pruneCounterMap(user.stats.commands, "count");
}

function applyVoiceActivity(user, channelId, startMs, endMs, now = Date.now()) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;

  let cursor = startMs;
  let totalSec = 0;

  while (cursor < endMs) {
    const segmentEnd = Math.min(endMs, nextUtcDayStartMs(cursor));
    const sec = Math.floor((segmentEnd - cursor) / 1000);
    if (sec > 0) {
      incDaily(user.stats.dailyVoiceSec, dayKeyFromTs(cursor), sec);
      totalSec += sec;
    }
    cursor = segmentEnd;
  }

  if (totalSec > 0 && channelId) {
    incCounter(user.stats.channelVoice, channelId, "seconds", totalSec, now);
  }

  pruneDailyMap(user.stats.dailyVoiceSec, now);
  pruneCounterMap(user.stats.channelVoice, "seconds");
  return totalSec;
}

function listRecentDayKeys(days, now = Date.now()) {
  const out = [];
  for (let i = 0; i < days; i += 1) {
    out.push(dayKeyFromTs(now - i * DAY_MS));
  }
  return out;
}

function sumWindow(dailyMap, days, now = Date.now()) {
  const keys = listRecentDayKeys(days, now);
  let sum = 0;
  for (const day of keys) {
    sum += Number(dailyMap?.[day] || 0);
  }
  return sum;
}

function seriesWindow(dailyMap, days, now = Date.now()) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = dayKeyFromTs(now - i * DAY_MS);
    out.push(Number(dailyMap?.[day] || 0));
  }
  return out;
}

function sumAllDaily(dailyMap) {
  return Object.values(dailyMap || {}).reduce((acc, value) => acc + (Number(value) || 0), 0);
}

function getTopEntries(map, valueKey, limit = 3) {
  return Object.entries(map || {})
    .map(([id, value]) => ({
      id,
      value: Number(value?.[valueKey] || 0),
      updatedAt: Number(value?.updatedAt || 0),
    }))
    .filter((x) => x.value > 0)
    .sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      return b.updatedAt - a.updatedAt;
    })
    .slice(0, Math.max(0, limit));
}

function compareTextLevelRows(a, b) {
  if (b.textLevel !== a.textLevel) return b.textLevel - a.textLevel;
  if (b.textTotalXp !== a.textTotalXp) return b.textTotalXp - a.textTotalXp;
  if (b.messages !== a.messages) return b.messages - a.messages;
  return String(a.userId || "").localeCompare(String(b.userId || ""));
}

function compareLevelRows(a, b) {
  return compareTextLevelRows(a, b);
}

function compareVoiceLevelRows(a, b) {
  if (b.voiceLevel !== a.voiceLevel) return b.voiceLevel - a.voiceLevel;
  if (b.voiceTotalXp !== a.voiceTotalXp) return b.voiceTotalXp - a.voiceTotalXp;
  const aVoiceTotalSec = Number(a.voiceTotalSec || 0);
  const bVoiceTotalSec = Number(b.voiceTotalSec || 0);
  if (bVoiceTotalSec !== aVoiceTotalSec) return bVoiceTotalSec - aVoiceTotalSec;
  return compareTextLevelRows(a, b);
}

function compareMessageRows(a, b) {
  if (b.messages !== a.messages) return b.messages - a.messages;
  return compareTextLevelRows(a, b);
}

function compareVoiceRows(a, b) {
  if (b.voiceTotalSec !== a.voiceTotalSec) return b.voiceTotalSec - a.voiceTotalSec;
  return compareMessageRows(a, b);
}

function compareCoinRows(a, b) {
  const aCoin = Number(a.coinDeci || 0);
  const bCoin = Number(b.coinDeci || 0);
  if (bCoin !== aCoin) return bCoin - aCoin;
  return compareTextLevelRows(a, b);
}

function withIncludedUserIds(rows, includeUserIds) {
  const map = new Map();
  for (const row of rows || []) {
    if (!row?.userId) continue;
    map.set(String(row.userId), row);
  }

  for (const uid of includeUserIds || []) {
    const id = String(uid || "").trim();
    if (!id || map.has(id)) continue;
    map.set(id, { userId: id, ...normalizeUserData(null) });
  }

  return [...map.values()];
}

function excludeRowsByUserIds(rows, excludeUserIds) {
  const set = new Set(
    Array.isArray(excludeUserIds)
      ? excludeUserIds.map((x) => String(x || "").trim()).filter(Boolean)
      : []
  );
  if (!set.size) return [...(rows || [])];
  return [...(rows || [])].filter((row) => !set.has(String(row?.userId || "").trim()));
}

async function getConfig(db, gid) {
  const now = Date.now();
  const cached = cfgCache.get(gid);
  if (cached && now - cached.at <= cfgCacheTtlMs) return cached.cfg;

  const raw = await db.get(CFG_KEY(gid));
  const cfg = normalizeCfg(raw);
  cfgCache.set(gid, { at: now, cfg });

  if (!raw) {
    await db.set(CFG_KEY(gid), cfg);
  }
  return cfg;
}

async function setConfig(db, gid, patch) {
  const current = await getConfig(db, gid);
  const next = normalizeCfg({ ...current, ...(patch || {}) });
  await db.set(CFG_KEY(gid), next);
  cfgCache.set(gid, { at: Date.now(), cfg: next });
  return next;
}

async function getUserData(db, gid, uid) {
  const raw = await db.get(USER_KEY(gid, uid));
  if (raw) return normalizeUserData(raw);

  const fresh = normalizeUserData(null);
  await db.set(USER_KEY(gid, uid), fresh);
  return fresh;
}

async function setUserData(db, gid, uid, data) {
  const normalized = normalizeUserData(data);
  normalized.updatedAt = Date.now();
  await db.set(USER_KEY(gid, uid), normalized);
  return normalized;
}

async function ensureListed(db, gid, uid) {
  const ids = (await db.get(USERS_KEY(gid))) || [];
  if (ids.includes(uid)) return ids;
  ids.push(uid);
  await db.set(USERS_KEY(gid), ids);
  return ids;
}

async function getAllRows(db, gid) {
  const listed = (await db.get(USERS_KEY(gid))) || [];
  const ids = Array.isArray(listed) ? listed : [];
  const uniqueIds = [];
  const seen = new Set();

  for (const uid of ids) {
    const id = String(uid || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    uniqueIds.push(id);
  }

  const rows = [];
  for (let i = 0; i < uniqueIds.length; i += GET_ALL_ROWS_BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + GET_ALL_ROWS_BATCH_SIZE);
    const resolved = await Promise.all(
      batch.map(async (uid) => {
        const raw = await db.get(USER_KEY(gid, uid));
        if (!raw) return null;
        return { userId: uid, ...normalizeUserData(raw) };
      })
    );

    for (const row of resolved) {
      if (row) rows.push(row);
    }
  }

  return rows;
}

async function onMessage(message, client) {
  if (!message?.guild || !message?.author || message.author.bot || message.webhookId) return;
  if (message.member?.user?.bot) return;

  const gid = message.guild.id;
  const uid = message.author.id;
  const cfg = await getConfig(client.db, gid);

  const content = String(message.content || "").trim();
  const hasAttachment = Number(message.attachments?.size || 0) > 0;
  if (!content.length && !hasAttachment) return;
  if (isLevelDisabledMessageChannel(cfg, message)) return;

  const now = Date.now();
  let levelUpPayload = null;

  await withUserLock(gid, uid, async () => {
    const user = await getUserData(client.db, gid, uid);
    applyMessageActivity(user, message.channelId, now);

    const canGainMessageCoin = cfg.enabled && content.length > 0;
    if (canGainMessageCoin) {
      const coinCooldownKey = `${gid}:${uid}`;
      const lastCoinAt = messageCoinCooldown.get(coinCooldownKey) || 0;
      if (now - lastCoinAt >= MESSAGE_COIN_COOLDOWN_MS) {
        messageCoinCooldown.set(coinCooldownKey, now);
        addCoin(user, MESSAGE_COIN_GAIN_DECI);
      }
    }

    const canGainXp = cfg.enabled && content.length >= cfg.minMessageLength;
    if (canGainXp) {
      const cooldownKey = `${gid}:${uid}`;
      const last = gainCooldown.get(cooldownKey) || 0;
      if (now - last >= cfg.cooldownMs) {
        gainCooldown.set(cooldownKey, now);

        const gain = randomInt(cfg.minXp, cfg.maxXp);
        const oldLevel = user.textLevel;
        const progressed = applyLevelProgress(user.textLevel, user.textXp, gain);
        user.textLevel = progressed.level;
        user.textXp = progressed.xp;
        user.textTotalXp += progressed.gain;

        if (user.textLevel > oldLevel) {
          levelUpPayload = {
            userId: uid,
            userTag: message.author.tag,
            oldLevel,
            newLevel: user.textLevel,
            gain: progressed.gain,
            totalXp: user.textTotalXp,
            levelType: "text",
          };
        }
      }
    }

    await setUserData(client.db, gid, uid, user);
    await ensureListed(client.db, gid, uid);
  });

  if (levelUpPayload) {
    await grantRewardRolesForLevelUp(
      message.guild,
      message.member || { id: uid },
      cfg,
      "text",
      levelUpPayload.oldLevel,
      levelUpPayload.newLevel
    ).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

    const logs = client.features?.Logs;
    if (logs?.onLevelUp) {
      await logs.onLevelUp(message, client, levelUpPayload);
    }
  }
}

async function onCommand(interaction, client) {
  if (!interaction?.guildId || !interaction?.user || interaction.user.bot) return;
  const commandName = String(interaction.commandName || "").trim().toLowerCase();
  if (!commandName) return;

  const gid = interaction.guildId;
  const uid = interaction.user.id;
  const now = Date.now();

  await withUserLock(gid, uid, async () => {
    const user = await getUserData(client.db, gid, uid);
    applyCommandActivity(user, commandName, now);
    await setUserData(client.db, gid, uid, user);
    await ensureListed(client.db, gid, uid);
  });
}

async function finalizeVoiceSession(client, gid, uid, session, endedAt) {
  if (!session?.startedAt || !session?.channelId) return;

  const startMs = Number(session.startedAt);
  const endMs = Number(endedAt) || Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return;

  let levelUpPayload = null;
  let currentCfg = null;
  await withUserLock(gid, uid, async () => {
    const cfg = await getConfig(client.db, gid);
    currentCfg = cfg;
    if (isLevelDisabledChannel(cfg, session.channelId)) return;

    const user = await getUserData(client.db, gid, uid);
    const totalSec = applyVoiceActivity(user, session.channelId, startMs, endMs, endMs);

    if (cfg.enabled && totalSec >= VOICE_COIN_INTERVAL_SEC) {
      const coinGain = Math.floor(totalSec / VOICE_COIN_INTERVAL_SEC) * VOICE_COIN_PER_INTERVAL_DECI;
      addCoin(user, coinGain);
    }

    if (cfg.enabled && totalSec >= VOICE_XP_INTERVAL_SEC) {
      const gain = Math.floor(totalSec / VOICE_XP_INTERVAL_SEC) * VOICE_XP_PER_INTERVAL;
      if (gain > 0) {
        const oldLevel = user.voiceLevel;
        const progressed = applyLevelProgress(user.voiceLevel, user.voiceXp, gain);
        user.voiceLevel = progressed.level;
        user.voiceXp = progressed.xp;
        user.voiceTotalXp += progressed.gain;

        if (user.voiceLevel > oldLevel) {
          levelUpPayload = {
            userId: uid,
            userTag: uid,
            oldLevel,
            newLevel: user.voiceLevel,
            gain: progressed.gain,
            totalXp: user.voiceTotalXp,
            levelType: "voice",
            channelId: session.channelId,
          };
        }
      }
    }

    await setUserData(client.db, gid, uid, user);
    await ensureListed(client.db, gid, uid);
  });

  if (levelUpPayload) {
    const guild = client.guilds?.cache?.get(gid);
    if (guild) {
      const member =
        guild.members?.cache?.get(uid) ||
        await (guild.members?.fetch?.(uid) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });

      await grantRewardRolesForLevelUp(
        guild,
        member || { id: uid },
        currentCfg,
        "voice",
        levelUpPayload.oldLevel,
        levelUpPayload.newLevel
      ).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

      if (member?.user?.tag) {
        levelUpPayload.userTag = member.user.tag;
      }
      const logs = client.features?.Logs;
      if (logs?.onLevelUp) {
        await (logs.onLevelUp({ guild, channelId: levelUpPayload.channelId }, client, levelUpPayload) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
    }
  }
}

async function onVoiceStateUpdate(oldState, newState, client) {
  const guild = newState?.guild || oldState?.guild;
  const member = newState?.member || oldState?.member;
  if (!guild || !member || member.user?.bot) return;

  const gid = guild.id;
  const uid = member.id;
  const oldChannelId = oldState?.channelId || null;
  const newChannelId = newState?.channelId || null;

  const key = VOICE_SESSION_KEY(gid, uid);
  const now = Date.now();
  const existing = activeVoiceSessions.get(key);

  if (!oldChannelId && newChannelId) {
    activeVoiceSessions.set(key, { startedAt: now, channelId: newChannelId });
    return;
  }

  if (oldChannelId && !newChannelId) {
    if (existing) {
      await finalizeVoiceSession(client, gid, uid, existing, now);
      activeVoiceSessions.delete(key);
    }
    return;
  }

  if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
    if (existing) {
      await finalizeVoiceSession(client, gid, uid, existing, now);
    }
    activeVoiceSessions.set(key, { startedAt: now, channelId: newChannelId });
    return;
  }

  if (newChannelId && !existing) {
    // Recovery path for process restart while member is already connected.
    activeVoiceSessions.set(key, { startedAt: now, channelId: newChannelId });
  }
}

async function getUserProfile(db, gid, uid) {
  const user = await getUserData(db, gid, uid);
  const textNextXp = xpForNextLevel(user.textLevel);
  const voiceNextXp = xpForNextLevel(user.voiceLevel);

  const textProgress = textNextXp > 0 ? Math.max(0, Math.min(1, user.textXp / textNextXp)) : 0;
  const voiceProgress = voiceNextXp > 0 ? Math.max(0, Math.min(1, user.voiceXp / voiceNextXp)) : 0;

  return {
    ...user,
    // Geriye donuk uyumluluk (eski rank/seviye okumalari)
    level: user.textLevel,
    xp: user.textXp,
    totalXp: user.textTotalXp,
    nextXp: textNextXp,
    progress: textProgress,
    text: {
      level: user.textLevel,
      xp: user.textXp,
      totalXp: user.textTotalXp,
      nextXp: textNextXp,
      progress: textProgress,
    },
    voice: {
      level: user.voiceLevel,
      xp: user.voiceXp,
      totalXp: user.voiceTotalXp,
      nextXp: voiceNextXp,
      progress: voiceProgress,
    },
  };
}

function normalizeCoinDeci(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.floor(n));
}

async function getCoinBalance(db, gid, uid) {
  const user = await getUserData(db, gid, uid);
  const coinDeci = normalizeCoinDeci(user.coinDeci);
  return {
    coinDeci,
    coins: coinDeci / COIN_DECIMAL_SCALE,
  };
}

async function spendCoins(db, gid, uid, deciAmount) {
  const cost = normalizeCoinDeci(deciAmount);
  if (cost <= 0) {
    const balance = await getCoinBalance(db, gid, uid);
    return {
      ok: true,
      spentDeci: 0,
      balanceBeforeDeci: balance.coinDeci,
      balanceAfterDeci: balance.coinDeci,
    };
  }

  let out = {
    ok: false,
    spentDeci: cost,
    balanceBeforeDeci: 0,
    balanceAfterDeci: 0,
  };

  await withUserLock(gid, uid, async () => {
    const user = await getUserData(db, gid, uid);
    const before = normalizeCoinDeci(user.coinDeci);

    if (before < cost) {
      out = {
        ok: false,
        spentDeci: cost,
        balanceBeforeDeci: before,
        balanceAfterDeci: before,
      };
      return;
    }

    const after = before - cost;
    user.coinDeci = after;
    user.coins = after / COIN_DECIMAL_SCALE;

    await setUserData(db, gid, uid, user);
    await ensureListed(db, gid, uid);

    out = {
      ok: true,
      spentDeci: cost,
      balanceBeforeDeci: before,
      balanceAfterDeci: after,
    };
  });

  return out;
}

async function grantCoins(db, gid, uid, deciAmount) {
  const gain = normalizeCoinDeci(deciAmount);
  let out = {
    ok: true,
    grantedDeci: 0,
    balanceBeforeDeci: 0,
    balanceAfterDeci: 0,
  };

  if (gain <= 0) {
    const balance = await getCoinBalance(db, gid, uid);
    return {
      ok: true,
      grantedDeci: 0,
      balanceBeforeDeci: balance.coinDeci,
      balanceAfterDeci: balance.coinDeci,
    };
  }

  await withUserLock(gid, uid, async () => {
    const user = await getUserData(db, gid, uid);
    const before = normalizeCoinDeci(user.coinDeci);
    const granted = addCoin(user, gain);

    await setUserData(db, gid, uid, user);
    await ensureListed(db, gid, uid);

    out = {
      ok: true,
      grantedDeci: granted,
      balanceBeforeDeci: before,
      balanceAfterDeci: normalizeCoinDeci(user.coinDeci),
    };
  });

  return out;
}

function sortRowsByType(rows, type) {
  if (type === "voice") {
    return [...rows]
      .map((x) => ({ ...x, voiceTotalSec: sumAllDaily(x.stats?.dailyVoiceSec || {}) }))
      .sort(compareVoiceLevelRows);
  }
  if (type === "coin") {
    return [...rows].sort(compareCoinRows);
  }
  return [...rows].sort(compareTextLevelRows);
}

function filterRowsByType(rows, type, includeInactive = true) {
  const list = [...(rows || [])];
  if (includeInactive) return list;
  if (type === "voice") {
    return list.filter((x) => Number(x.voiceTotalXp || 0) > 0 || sumAllDaily(x.stats?.dailyVoiceSec || {}) > 0);
  }
  if (type === "coin") {
    return list.filter((x) => Number(x.coinDeci || 0) > 0);
  }
  return list.filter((x) => Number(x.textTotalXp || 0) > 0 || Number(x.messages || 0) > 0);
}

async function getTopByType(db, gid, type = "text", limit = 10, opts = {}) {
  const rows = await getAllRows(db, gid);
  const withIncluded = withIncludedUserIds(rows, opts?.includeUserIds);
  const withoutExcluded = excludeRowsByUserIds(withIncluded, opts?.excludeUserIds);
  const filtered = filterRowsByType(withoutExcluded, type, opts?.includeInactive !== false);
  const sorted = sortRowsByType(filtered, type);
  return sorted.slice(0, Math.max(1, limit));
}

async function getTop(db, gid, limit = 10) {
  return getTopByType(db, gid, "text", limit);
}

async function getRankByType(db, gid, uid, type = "text", opts = {}) {
  const rows = await getAllRows(db, gid);
  const withIncluded = withIncludedUserIds(rows, opts?.includeUserIds);
  const withoutExcluded = excludeRowsByUserIds(withIncluded, opts?.excludeUserIds);
  const filtered = filterRowsByType(withoutExcluded, type, opts?.includeInactive !== false);
  const sorted = sortRowsByType(filtered, type);
  const idx = sorted.findIndex((x) => x.userId === uid);
  return idx >= 0 ? idx + 1 : null;
}

async function getRank(db, gid, uid) {
  return getRankByType(db, gid, uid, "text");
}

async function getRankCardData(db, gid, uid, opts = {}) {
  const now = Date.now();
  const cfg = await getConfig(db, gid);
  const disabledChannelIds = new Set(cfg.disabledChannelIds || []);
  const user = await getUserData(db, gid, uid);
  const profile = await getUserProfile(db, gid, uid);

  const messageActivity = {
    d1: sumWindow(user.stats.dailyMessages, 1, now),
    d7: sumWindow(user.stats.dailyMessages, 7, now),
    d14: sumWindow(user.stats.dailyMessages, 14, now),
    trend14: seriesWindow(user.stats.dailyMessages, 14, now),
  };

  const voiceActivity = {
    d1: sumWindow(user.stats.dailyVoiceSec, 1, now),
    d7: sumWindow(user.stats.dailyVoiceSec, 7, now),
    d14: sumWindow(user.stats.dailyVoiceSec, 14, now),
    trend14: seriesWindow(user.stats.dailyVoiceSec, 14, now),
  };

  const topTextChannels = getTopEntries(user.stats.channelText, "count", 25).filter((x) => !disabledChannelIds.has(x.id));
  const topVoiceChannels = getTopEntries(user.stats.channelVoice, "seconds", 25).filter((x) => !disabledChannelIds.has(x.id));
  const topCommands = getTopEntries(user.stats.commands, "count", 3);

  const rowsRaw = withIncludedUserIds(await getAllRows(db, gid), opts?.includeUserIds);
  const rows = excludeRowsByUserIds(rowsRaw, opts?.excludeUserIds);
  if (!rows.some((x) => x.userId === uid)) {
    rows.push({ userId: uid, ...user });
  }

  const textLevelRows = [...rows].sort(compareTextLevelRows);
  const voiceLevelRows = rows
    .map((x) => ({ ...x, voiceTotalSec: sumAllDaily(x.stats?.dailyVoiceSec || {}) }))
    .sort(compareVoiceLevelRows);
  const messageRows = [...rows].sort(compareMessageRows);
  const voiceRows = rows
    .map((x) => ({ ...x, voiceTotalSec: sumAllDaily(x.stats?.dailyVoiceSec || {}) }))
    .sort(compareVoiceRows);
  const coinRows = [...rows].sort(compareCoinRows);

  const textLevelIndex = textLevelRows.findIndex((x) => x.userId === uid);
  const voiceLevelIndex = voiceLevelRows.findIndex((x) => x.userId === uid);
  const messageIndex = messageRows.findIndex((x) => x.userId === uid);
  const voiceIndex = voiceRows.findIndex((x) => x.userId === uid);
  const coinIndex = coinRows.findIndex((x) => x.userId === uid);

  return {
    profile,
    levelRank: textLevelIndex >= 0 ? textLevelIndex + 1 : null,
    textLevelRank: textLevelIndex >= 0 ? textLevelIndex + 1 : null,
    voiceLevelRank: voiceLevelIndex >= 0 ? voiceLevelIndex + 1 : null,
    messageRank: messageIndex >= 0 ? messageIndex + 1 : null,
    voiceRank: voiceIndex >= 0 ? voiceIndex + 1 : null,
    coinRank: coinIndex >= 0 ? coinIndex + 1 : null,
    messageActivity,
    voiceActivity,
    topTextChannels,
    topVoiceChannels,
    topCommands,
  };
}

async function seedActiveVoiceSessions(client) {
  const guilds = [...(client?.guilds?.cache?.values?.() || [])];
  if (!guilds.length) return;

  const now = Date.now();
  for (const guild of guilds) {
    const channels = [...(guild?.channels?.cache?.values?.() || [])];
    for (const channel of channels) {
      if (!channel?.isVoiceBased?.()) continue;
      const members = [...(channel.members?.values?.() || [])];
      for (const member of members) {
        if (!member?.id || member.user?.bot) continue;
        const key = VOICE_SESSION_KEY(guild.id, member.id);
        if (activeVoiceSessions.has(key)) continue;
        activeVoiceSessions.set(key, { startedAt: now, channelId: channel.id });
      }
    }
  }
}

async function onGuildMemberRemove(member, client) {
  if (!member?.guild?.id || member.user?.bot || !client?.db) return;
  const gid = member.guild.id;
  const uid = String(member.id || "").trim();
  if (!/^\d{15,25}$/.test(uid)) return;

  const map = await loadLeaveResetMap(client.db, gid);
  const next = markLeaveReset(map, uid, Date.now());
  await saveLeaveResetMap(client.db, gid, next);
}

async function onGuildMemberAdd(member, client) {
  if (!member?.guild?.id || member.user?.bot || !client?.db) return;
  const gid = member.guild.id;
  const uid = String(member.id || "").trim();
  if (!/^\d{15,25}$/.test(uid)) return;

  const map = await loadLeaveResetMap(client.db, gid);
  if (!map[uid]) return;
  const next = clearLeaveReset(map, uid);
  await saveLeaveResetMap(client.db, gid, next);
}

async function onReady(client) {
  if (!client?.db) return;
  await (runDueLeaveResetsForAllGuilds(client) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  startLeaveResetSweeper(client);
}

function init(client) {
  if (!client || sessionBootstrapClients.has(client)) return;
  sessionBootstrapClients.add(client);

  const run = () => {
    seedActiveVoiceSessions(client).catch((err) => {
      console.error("level seed voice sessions error:", err);
    });
  };

  if (client.isReady?.()) run();
  else client.once("ready", run);
}

module.exports = {
  init,
  getConfig,
  setConfig,
  onMessage,
  onCommand,
  onVoiceStateUpdate,
  onGuildMemberAdd,
  onGuildMemberRemove,
  onReady,
  getUserProfile,
  getTopByType,
  getTop,
  getRankByType,
  getRank,
  getRankCardData,
  getCoinBalance,
  spendCoins,
  grantCoins,
  xpForNextLevel,
  __private: {
    normalizeRoleRewards,
    collectRewardRoleIds,
    grantRewardRolesForLevelUp,
    normalizeLeaveResetMap,
    markLeaveReset,
    clearLeaveReset,
    resolveDueLeaveResets,
    getAllRows,
  },
};
