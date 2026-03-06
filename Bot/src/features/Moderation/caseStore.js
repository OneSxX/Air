const CASE_COUNTER_KEY = (gid) => `mod_case_counter_${gid}`;
const CASES_KEY = (gid) => `mod_cases_${gid}`;
const MAX_CASES = 5000;
const guildLocks = new Map();

function withGuildLock(guildId, task) {
  const key = String(guildId || "").trim();
  const prev = guildLocks.get(key) || Promise.resolve();

  const next = prev
    .catch((err) => { globalThis.__airWarnSuppressedError?.(err); })
    .then(task)
    .finally(() => {
      if (guildLocks.get(key) === next) {
        guildLocks.delete(key);
      }
    });

  guildLocks.set(key, next);
  return next;
}

function normalizeReason(input, fallback = "Belirtilmedi") {
  const text = String(input || "").trim();
  if (!text) return fallback;
  return text.slice(0, 1000);
}

function normalizeCase(raw) {
  if (!raw || typeof raw !== "object") return null;

  const id = Number(raw.id);
  const type = String(raw.type || "").trim().toLowerCase();
  const targetId = String(raw.targetId || "").trim();
  const moderatorId = String(raw.moderatorId || "").trim();

  if (!Number.isFinite(id) || id <= 0) return null;
  if (!type || !targetId || !moderatorId) return null;

  return {
    id: Math.floor(id),
    type,
    targetId,
    moderatorId,
    reason: normalizeReason(raw.reason),
    createdAt: Number(raw.createdAt || Date.now()),
    durationMs: Number(raw.durationMs || 0),
    success: raw.success !== false,
    meta: raw.meta && typeof raw.meta === "object" ? { ...raw.meta } : {},
  };
}

async function getCases(db, guildId) {
  const raw = await db.get(CASES_KEY(guildId));
  const list = Array.isArray(raw) ? raw.map(normalizeCase).filter(Boolean) : [];
  return list.sort((a, b) => a.id - b.id);
}

async function setCases(db, guildId, cases) {
  const list = (Array.isArray(cases) ? cases : []).map(normalizeCase).filter(Boolean);
  list.sort((a, b) => a.id - b.id);

  const trimmed = list.length > MAX_CASES ? list.slice(list.length - MAX_CASES) : list;
  await db.set(CASES_KEY(guildId), trimmed);
  return trimmed;
}

async function nextCaseId(db, guildId) {
  const current = Number((await db.get(CASE_COUNTER_KEY(guildId))) || 0);
  const next = Math.max(0, Math.floor(current)) + 1;
  await db.set(CASE_COUNTER_KEY(guildId), next);
  return next;
}

async function createCase(db, guildId, payload) {
  return withGuildLock(guildId, async () => {
    const id = await nextCaseId(db, guildId);
    const entry = normalizeCase({
      id,
      type: payload?.type,
      targetId: payload?.targetId,
      moderatorId: payload?.moderatorId,
      reason: payload?.reason,
      createdAt: Date.now(),
      durationMs: payload?.durationMs || 0,
      success: payload?.success !== false,
      meta: payload?.meta || {},
    });

    if (!entry) {
      throw new Error("Gecersiz case verisi olusturuldu.");
    }

    const cases = await getCases(db, guildId);
    cases.push(entry);
    await setCases(db, guildId, cases);
    return entry;
  });
}

async function getUserCases(db, guildId, userId) {
  const target = String(userId || "").trim();
  if (!target) return [];

  const cases = await getCases(db, guildId);
  return cases.filter((x) => x.targetId === target).sort((a, b) => b.id - a.id);
}

async function getCaseById(db, guildId, id) {
  const cid = Number(id);
  if (!Number.isFinite(cid) || cid <= 0) return null;

  const cases = await getCases(db, guildId);
  return cases.find((x) => x.id === Math.floor(cid)) || null;
}

async function countUserCasesByType(db, guildId, userId, type) {
  const target = String(userId || "").trim();
  const t = String(type || "").trim().toLowerCase();
  if (!target || !t) return 0;

  const cases = await getCases(db, guildId);
  return cases.filter((x) => x.targetId === target && x.type === t).length;
}

module.exports = {
  createCase,
  getCases,
  getUserCases,
  getCaseById,
  countUserCasesByType,
};
