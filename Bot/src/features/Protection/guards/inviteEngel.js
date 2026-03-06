const INVITE_LINK_RE = /\b(?:https?:\/\/)?(?:www\.)?discord(?:app)?\.(?:com\/invite|gg)\/[a-z0-9-]{2,32}\b/gi;

function extractInviteLinks(content) {
  if (!content) return [];
  const text = String(content).toLowerCase();
  const matches = text.match(INVITE_LINK_RE) || [];
  return [...new Set(matches.map((x) => String(x || "").trim()).filter(Boolean))];
}

function hasInviteLink(content) {
  return extractInviteLinks(content).length > 0;
}

module.exports = {
  extractInviteLinks,
  hasInviteLink,
};

