const CHANNEL_EXTRA_BOT_KEY_MAP = {
  kanalOlusturma: "kanalOlusturmaBot",
  kanalSilme: "kanalSilmeBot",
  kanalIsimDuzenleme: "kanalIsimDuzenlemeBot",
  kanalIzinDegistirme: "kanalIzinDegistirmeBot",
  kanalAyarDegistirme: "kanalAyarDegistirmeBot",
};

function normalizeActorType(value) {
  const x = String(value || "").trim().toLowerCase();
  if (x === "bot") return "bot";
  if (x === "human" || x === "member" || x === "user" || x === "yetkili") return "human";
  return "unknown";
}

function routeChannelExtraKey(extraKey, actorType) {
  const normalizedType = normalizeActorType(actorType);
  if (normalizedType === "bot") {
    return CHANNEL_EXTRA_BOT_KEY_MAP[extraKey] || extraKey;
  }
  return extraKey;
}

function resolveChannelRouting(extraKey, actorType, opts = {}) {
  const normalizedType = normalizeActorType(actorType);
  const strict = opts?.strict === true;

  if (strict && normalizedType === "unknown") {
    return {
      actorType: normalizedType,
      routedExtraKey: null,
      blocked: true,
    };
  }

  return {
    actorType: normalizedType,
    routedExtraKey: routeChannelExtraKey(extraKey, normalizedType),
    blocked: false,
  };
}

module.exports = {
  CHANNEL_EXTRA_BOT_KEY_MAP,
  normalizeActorType,
  routeChannelExtraKey,
  resolveChannelRouting,
};
