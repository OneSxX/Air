const {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  PermissionFlagsBits,
} = require("discord.js");

const INVITE_AUTOMOD_RULE_NAME = "AIR | Discord Invite Engel";
const INVITE_REGEX_PATTERN = String.raw`(?:https?:\/\/)?(?:www\.)?discord(?:app)?\.(?:com\/invite|gg)\/[a-zA-Z0-9-]{2,32}`;
const INVITE_ALLOW_LIST = [".com", ".discordapp.com", ".gif", "attachments", "cdn"];
const MAX_AUTOMOD_EXEMPT = 50;
const MAX_AUTOMOD_TIMEOUT_SECONDS = 28 * 24 * 60 * 60;
const MIN_AUTOMOD_TIMEOUT_SECONDS = 60;

function normalizeSnowflakeList(raw, max = MAX_AUTOMOD_EXEMPT) {
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const item of src) {
    const id = String(item || "").trim();
    if (!/^\d{15,25}$/.test(id)) continue;
    if (out.includes(id)) continue;
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeTimeoutSeconds(rawMs) {
  const ms = Number(rawMs);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  const clampedMs = Math.min(ms, MAX_AUTOMOD_TIMEOUT_SECONDS * 1000);
  return Math.max(MIN_AUTOMOD_TIMEOUT_SECONDS, Math.round(clampedMs / 1000));
}

async function resolveBotPermissionState(guild) {
  let botMember = guild?.members?.me || null;
  if (!botMember && guild?.members?.fetchMe) {
    botMember = await (guild.members.fetchMe() || Promise.resolve(null)).catch((err) => {
      globalThis.__airWarnSuppressedError?.(err);
      return null;
    });
  }

  const perms = botMember?.permissions || null;
  return {
    hasManageGuild: !!perms?.has?.(PermissionFlagsBits.ManageGuild),
    hasModerateMembers: !!perms?.has?.(PermissionFlagsBits.ModerateMembers),
  };
}

async function resolveExistingRule(guild, savedRuleId) {
  if (!guild?.autoModerationRules) return null;

  const ruleId = String(savedRuleId || "").trim();
  if (ruleId) {
    const fromCache = guild.autoModerationRules.cache?.get?.(ruleId);
    if (fromCache) return fromCache;

    const fetched = await (guild.autoModerationRules.fetch(ruleId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (fetched) return fetched;
  }

  const rules = await (guild.autoModerationRules.fetch() || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!rules) return null;

  return rules.find(
    (rule) =>
      rule?.triggerType === AutoModerationRuleTriggerType.Keyword &&
      rule?.name === INVITE_AUTOMOD_RULE_NAME
  ) || null;
}

async function syncInviteAutoModRule(guild, cfg, opts = {}) {
  if (!guild?.autoModerationRules) {
    return { ok: false, reason: "AUTOMOD_UNAVAILABLE" };
  }

  const { hasManageGuild, hasModerateMembers } = await resolveBotPermissionState(guild);
  if (!hasManageGuild) {
    return { ok: false, reason: "MISSING_MANAGE_GUILD" };
  }

  try {
    const inviteCfg = cfg?.invite || {};
    const enabled = !!cfg?.toggles?.invite;
    const timeoutSeconds = normalizeTimeoutSeconds(cfg?.timeouts?.invite);
    const savedRuleId = String(inviteCfg.autoModRuleId || "").trim();
    const exemptRoles = normalizeSnowflakeList(inviteCfg.exemptRoleIds);
    const exemptChannels = normalizeSnowflakeList(inviteCfg.exemptChannelIds);
    const rule = await resolveExistingRule(guild, savedRuleId);

    const actions = [{ type: AutoModerationActionType.BlockMessage }];
    const timeoutRequested = timeoutSeconds > 0;
    let timeoutApplied = false;
    let timeoutSkippedReason = null;
    if (timeoutRequested && hasModerateMembers) {
      actions.push({
        type: AutoModerationActionType.Timeout,
        metadata: { durationSeconds: timeoutSeconds },
      });
      timeoutApplied = true;
    } else if (timeoutRequested) {
      timeoutSkippedReason = "MISSING_MODERATE_MEMBERS";
    }

    const patch = {
      name: INVITE_AUTOMOD_RULE_NAME,
      enabled,
      triggerMetadata: {
        regexPatterns: [INVITE_REGEX_PATTERN],
        allowList: INVITE_ALLOW_LIST,
      },
      actions,
      exemptRoles,
      exemptChannels,
      reason: "Protection: Invite engel ayarlarini AutoMod ile senkronla",
    };

    if (rule) {
      const updated = await rule.edit(patch);
      return {
        ok: true,
        ruleId: updated?.id || rule.id || null,
        created: false,
        enabled,
        timeoutRequested,
        timeoutApplied,
        timeoutSeconds,
        timeoutSkippedReason,
      };
    }

    if (!enabled && opts.createIfMissingWhenDisabled !== true) {
      return { ok: true, ruleId: null, created: false, enabled: false, skipped: true };
    }

    const created = await guild.autoModerationRules.create({
      ...patch,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Keyword,
    });

    return {
      ok: true,
      ruleId: created?.id || null,
      created: true,
      enabled,
      timeoutRequested,
      timeoutApplied,
      timeoutSeconds,
      timeoutSkippedReason,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "AUTOMOD_SYNC_FAILED",
      error: error?.rawError?.message || error?.message || String(error),
      code: error?.code || error?.rawError?.code || null,
      status: error?.status || null,
    };
  }
}

module.exports = {
  INVITE_AUTOMOD_RULE_NAME,
  syncInviteAutoModRule,
};
