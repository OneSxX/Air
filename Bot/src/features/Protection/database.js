const CFG = (gid) => `prot_cfg_${gid}`;
const PANEL = (gid) => `prot_panel_${gid}`; // { channelId, messageId }
const CURRENT_SCHEMA_VERSION = 1;
const cfgLocks = new Map();

function withGuildLock(guildId, task) {
  const key = String(guildId || "").trim();
  const prev = cfgLocks.get(key) || Promise.resolve();

  const next = prev
    .catch((err) => { globalThis.__airWarnSuppressedError?.(err); })
    .then(task)
    .finally(() => {
      if (cfgLocks.get(key) === next) {
        cfgLocks.delete(key);
      }
    });

  cfgLocks.set(key, next);
  return next;
}

function defaultConfig() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    category: "chat",

    logChannelId: null,
    bypassRoleIds: [],      // bu rollere sahip olanlar guardlardan muaf
    panelAdminRoleIds: [],  // paneli kim yönetebilir (boşsa ManageGuild/Admin)

    toggles: {
      caps: true,
      links: true,
      invite: false,
      profanity: false,
      mentions: true,
      flood: true,
      spam: true,
      emoji: false,
      everyone: false,

      bot: true,
      rolegive: true,
      vanity: true,

      chDel: true,
      chCreate: true,
      roleDel: true,
      roleCreate: true,
      ban: true,
      kick: true,

      antiRaid: true,
      webhook: true,
      snapshot: true,
    },

    raid: { windowMs: 15_000, maxJoins: 6, action: "kick", lockdownMs: 300_000 },

    flood: {
      windowMs: 7000,
      maxMessages: 5,
      exemptRoleIds: [],
      exemptChannelIds: [],
    },
    spam: {
      maxMessages: 5,
      perSeconds: 10,
      exemptRoleIds: [],
      exemptChannelIds: [],
    },
    links: {
      maxMessages: 5,
      perSeconds: 10,
      allowedLinks: [],
      exemptRoleIds: [],
      exemptChannelIds: [],
      autoModRuleId: null,
    },
    invite: {
      autoModRuleId: null,
    },
    profanity: {
      level: "orta",
      exemptRoleIds: [],
      exemptChannelIds: [],
      autoModRuleId: null,
    },
    emoji: {
      maxCount: 6,
      perSeconds: 5,
      exemptRoleIds: [],
      exemptChannelIds: [],
    },
    mentions: {
      maxCount: 5,
      perSeconds: 5,
      exemptRoleIds: [],
      exemptChannelIds: [],
      autoModRuleId: null,
    },
    everyone: {
      maxCount: 0,
      perSeconds: 5,
      exemptRoleIds: [],
      exemptChannelIds: [],
    },
    timeouts: {
      caps: 0,
      links: 0,
      invite: 0,
      profanity: 0,
      emoji: 0,
      mentions: 0,
      flood: 0,
      spam: 0,
      everyone: 0,
    },
    muteOnViolation: {
      caps: 0,
      links: 0,
      invite: 0,
      profanity: 0,
      emoji: 0,
      mentions: 0,
      flood: 0,
      spam: 0,
      everyone: 0,
    },
    muteDurations: {
      caps: 0,
      links: 0,
      invite: 0,
      profanity: 0,
      emoji: 0,
      mentions: 0,
      flood: 0,
      spam: 0,
      everyone: 0,
    },
    configured: {
      caps: false,
      links: false,
      invite: false,
      profanity: false,
      emoji: false,
      mentions: false,
      flood: false,
      spam: false,
      everyone: false,
      raid: false,
      limits: {},
    },

    presets: {
      slot1: null,
      slot2: null,
      slot3: null,
    },

    whitelist: { users: [], roles: [] },
    snapshots: { roles: {}, channels: {} },

    undo: null, // { toggles, spam, logChannelId, bypassRoleIds, panelAdminRoleIds, category }

    meta: {
      updatedAt: null,
      updatedBy: null,
    },
  };
}

function normalizeConfig(raw) {
  if (!raw || typeof raw !== "object") return defaultConfig();
  const merged = deepMerge(defaultConfig(), raw);
  merged.schemaVersion = CURRENT_SCHEMA_VERSION;
  merged.meta ||= { updatedAt: null, updatedBy: null };
  if (!Number.isFinite(Number(merged.meta.updatedAt))) merged.meta.updatedAt = null;
  if (merged.meta.updatedBy != null && typeof merged.meta.updatedBy !== "string") {
    merged.meta.updatedBy = String(merged.meta.updatedBy || "").trim() || null;
  }
  return merged;
}

async function getConfig(db, gid) {
  const current = await db.get(CFG(gid));
  if (current) {
    const normalized = normalizeConfig(current);
    if (JSON.stringify(normalized) !== JSON.stringify(current)) {
      await db.set(CFG(gid), normalized);
    }
    return normalized;
  }
  const fresh = defaultConfig();
  await db.set(CFG(gid), fresh);
  return fresh;
}

function deepMerge(target, patch) {
  const out = Array.isArray(target) ? [...target] : { ...target };
  for (const [k, v] of Object.entries(patch || {})) {
    if (
      v && typeof v === "object" && !Array.isArray(v) &&
      typeof out[k] === "object" && out[k] !== null && !Array.isArray(out[k])
    ) out[k] = deepMerge(out[k], v);
    else out[k] = v;
  }
  return out;
}

async function setConfig(db, gid, patch, opts = {}) {
  return withGuildLock(gid, async () => {
    const cfg = await getConfig(db, gid);
    const merged = normalizeConfig(deepMerge(cfg, patch));
    const updatedBy = String(opts?.updatedBy || "").trim();
    merged.meta ||= { updatedAt: null, updatedBy: null };
    merged.meta.updatedAt = Date.now();
    if (updatedBy) merged.meta.updatedBy = updatedBy;
    await db.set(CFG(gid), merged);
    return merged;
  });
}

async function setCategory(db, gid, category, opts = {}) {
  return setConfig(db, gid, { category }, opts);
}

async function getPanelRef(db, gid) {
  return (await db.get(PANEL(gid))) || null;
}

async function setPanelRef(db, gid, ref) {
  await db.set(PANEL(gid), ref);
}

function snapshotForUndo(cfg) {
  return {
    category: cfg.category,
    toggles: { ...cfg.toggles },
    spam: { ...cfg.spam },
    links: { ...(cfg.links || {}) },
    invite: { ...(cfg.invite || {}) },
    profanity: { ...(cfg.profanity || {}) },
    emoji: { ...(cfg.emoji || {}) },
    mentions: { ...(cfg.mentions || {}) },
    everyone: { ...(cfg.everyone || {}) },
    timeouts: { ...(cfg.timeouts || {}) },
    muteOnViolation: { ...(cfg.muteOnViolation || {}) },
    muteDurations: { ...(cfg.muteDurations || {}) },
    logChannelId: cfg.logChannelId,
    bypassRoleIds: [...(cfg.bypassRoleIds || [])],
    panelAdminRoleIds: [...(cfg.panelAdminRoleIds || [])],
  };
}

module.exports = {
  getConfig,
  setConfig,
  setCategory,
  getPanelRef,
  setPanelRef,
  snapshotForUndo,
};
