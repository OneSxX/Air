/**
 * Link tespiti:
 * - http/https URL
 * - www. ile baslayan adres
 * - Discord davet baglantisi
 * - Bilinen TLD'li yalın domain/path
 *
 * Not: Email adreslerini ve #kanal gibi patternleri link saymaz.
 */
const KNOWN_TLDS = [
  "com", "net", "org", "gg", "io", "co", "me", "app", "dev", "tv",
  "info", "biz", "xyz", "club", "online", "store", "site", "pro",
  "tr", "edu", "gov",
];

const SCHEME_URL_RE = /\bhttps?:\/\/[^\s<>()]+/i;
const WWW_RE = /\bwww\.[^\s<>()]+\.[a-z]{2,}(?:\/[^\s<>()]*)?/i;
const INVITE_RE = /\bdiscord(?:app)?\.(?:com\/invite|gg)\/[a-z0-9-]+\b/i;
const BARE_DOMAIN_RE = new RegExp(
  `\\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:${KNOWN_TLDS.join("|")})\\b(?:\\/[^\\s<>()]*)?`,
  "ig"
);
const SCHEME_URL_RE_G = /\bhttps?:\/\/[^\s<>()]+/ig;
const WWW_RE_G = /\bwww\.[^\s<>()]+\.[a-z]{2,}(?:\/[^\s<>()]*)?/ig;
const INVITE_RE_G = /\bdiscord(?:app)?\.(?:com\/invite|gg)\/[a-z0-9-]+\b/ig;

function hasBareDomain(text) {
  BARE_DOMAIN_RE.lastIndex = 0;
  let match = null;
  while ((match = BARE_DOMAIN_RE.exec(text)) !== null) {
    const start = Number(match.index || 0);
    const prev = start > 0 ? text[start - 1] : " ";
    if (prev === "@" || prev === "#") continue;
    return true;
  }
  return false;
}

function hasLink(content) {
  if (!content) return false;

  const text = String(content).toLowerCase();
  if (SCHEME_URL_RE.test(text)) return true;
  if (WWW_RE.test(text)) return true;
  if (INVITE_RE.test(text)) return true;
  if (hasBareDomain(text)) return true;
  return false;
}

function extractLinks(content) {
  if (!content) return [];
  const text = String(content).toLowerCase();
  const out = [];

  const push = (regex) => {
    regex.lastIndex = 0;
    let match = null;
    while ((match = regex.exec(text)) !== null) {
      const value = String(match[0] || "").trim();
      if (!value) continue;
      out.push(value);
    }
  };

  push(SCHEME_URL_RE_G);
  push(WWW_RE_G);
  push(INVITE_RE_G);

  BARE_DOMAIN_RE.lastIndex = 0;
  let match = null;
  while ((match = BARE_DOMAIN_RE.exec(text)) !== null) {
    const value = String(match[0] || "").trim();
    if (!value) continue;
    const start = Number(match.index || 0);
    const prev = start > 0 ? text[start - 1] : " ";
    if (prev === "@" || prev === "#") continue;
    out.push(value);
  }

  return [...new Set(out)];
}

function normalizeAllowedLinks(raw) {
  const list = Array.isArray(raw)
    ? raw
    : String(raw || "")
      .split(/[\n,;]+/g);

  const out = [];
  for (const item of list) {
    let value = String(item || "").trim().toLowerCase();
    if (!value || value === "0") continue;

    value = value.replace(/^https?:\/\//, "");
    value = value.replace(/^www\./, "");
    value = value.replace(/^\.+/, "");
    value = value.replace(/\/+$/, "");
    value = value.replace(/\s+/g, "");

    if (!value) continue;
    out.push(value.slice(0, 120));
  }

  return [...new Set(out)].slice(0, 50);
}

function normalizeLinkForCompare(link) {
  let value = String(link || "").trim().toLowerCase();
  if (!value) return "";

  value = value.replace(/^https?:\/\//, "");
  value = value.replace(/^www\./, "");
  value = value.replace(/\/+$/, "");
  return value;
}

function getLinkHost(link) {
  const value = normalizeLinkForCompare(link);
  if (!value) return "";
  return value.split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/\.+$/, "");
}

function isLinkAllowed(link, allowedLinks) {
  const allow = normalizeAllowedLinks(allowedLinks);
  if (!allow.length) return false;

  const normalizedLink = normalizeLinkForCompare(link);
  const host = getLinkHost(link);
  if (!normalizedLink || !host) return false;

  for (const pattern of allow) {
    if (!pattern) continue;

    if (pattern.includes("/")) {
      if (normalizedLink.startsWith(pattern)) return true;
      continue;
    }

    if (host === pattern) return true;
    if (host.endsWith(`.${pattern}`)) return true;
  }

  return false;
}

function hasDisallowedLinks(links, allowedLinks) {
  const list = Array.isArray(links) ? links : [];
  if (!list.length) return false;

  for (const link of list) {
    if (!isLinkAllowed(link, allowedLinks)) return true;
  }

  return false;
}

module.exports = {
  hasLink,
  extractLinks,
  normalizeAllowedLinks,
  isLinkAllowed,
  hasDisallowedLinks,
};
