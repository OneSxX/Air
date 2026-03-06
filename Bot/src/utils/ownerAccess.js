function normalizeUserId(input) {
  const value = String(input || "").trim();
  return /^\d{15,25}$/.test(value) ? value : "";
}

function resolveBotOwnerId(client) {
  const candidates = [
    client?.config?.ownerId,
    process.env.BOT_OWNER_ID,
    process.env.DISCORD_OWNER_ID,
    client?.application?.owner?.id,
    client?.application?.owner?.ownerId,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeUserId(candidate);
    if (normalized) return normalized;
  }

  return "";
}

function isBotOwner(userId, client) {
  const uid = normalizeUserId(userId);
  const ownerId = resolveBotOwnerId(client);
  return Boolean(uid && ownerId && uid === ownerId);
}

module.exports = {
  normalizeUserId,
  resolveBotOwnerId,
  isBotOwner,
};
