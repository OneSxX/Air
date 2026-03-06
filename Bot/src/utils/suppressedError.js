function parseEnvFlag(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
}

const SUPPRESSED_FLAG_CACHE_TTL_MS = Math.max(
  250,
  Math.min(30_000, parseInt(process.env.SUPPRESSED_ERROR_CACHE_TTL_MS || "2000", 10) || 2000)
);
let cachedFlagRaw = null;
let cachedFlagEnabled = false;
let cachedFlagAt = 0;

function isSuppressedWarnEnabled(now = Date.now()) {
  const raw = String(process.env.SUPPRESSED_ERROR_WARN ?? "");
  if (cachedFlagRaw !== raw || now - cachedFlagAt > SUPPRESSED_FLAG_CACHE_TTL_MS) {
    cachedFlagRaw = raw;
    cachedFlagEnabled = parseEnvFlag(raw);
    cachedFlagAt = now;
  }
  return cachedFlagEnabled;
}

function emitSuppressedPromiseError(err, context = "") {
  if (!isSuppressedWarnEnabled()) return;
  const message = err?.message || err;
  if (context) {
    console.warn(`[suppressed] ${context}:`, message);
    return;
  }
  console.warn("Suppressed promise error:", message);
}

function installSuppressedErrorReporter(target = globalThis) {
  if (!target || (typeof target !== "object" && typeof target !== "function")) return;
  target.__airWarnSuppressedError = (err, context) => {
    emitSuppressedPromiseError(err, context);
  };
}

module.exports = {
  parseEnvFlag,
  isSuppressedWarnEnabled,
  emitSuppressedPromiseError,
  installSuppressedErrorReporter,
};
