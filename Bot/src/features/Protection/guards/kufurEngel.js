const DEFAULT_PROFANITY_LEVEL = "orta";
const LEVELS = new Set(["dini_milli", "az", "orta", "cok"]);

const RELIGIOUS_NATIONAL_TERMS = [
  "allahini sikeyim",
  "allahina sikeyim",
  "allahini kitabini",
  "kitabini sikeyim",
  "dinini sikeyim",
  "imanini sikeyim",
  "peygamberini sikeyim",
  "bayragini sikeyim",
  "vatanini sikeyim",
  "istiklal marsini sikeyim",
  "ataturkune soveyim",
];

const RACIST_TERMS = [
  "kurt pici",
  "kurtleri sikeyim",
  "turk pici",
  "ermeni pici",
  "rum pici",
  "arap pici",
  "suriyeli pici",
  "yahudi pici",
  "zenci pici",
  "cingene pici",
  "irkini sikeyim",
  "soyunu sikeyim",
  "irkini siktigim",
];

const LOW_LEVEL_TERMS = [
  "amk",
  "aq",
  "amina koyim",
  "aminakoyim",
  "amina kodum",
  "aminakodum",
  "siktir",
  "sikeyim",
  "sikik",
  "sikim",
  "sikiyim",
  "orospu",
  "orospu cocugu",
  "orospucocugu",
  "pic",
  "pic kurusu",
  "ibne",
  "gavat",
  "yarrak",
  "yarak",
  "got",
  "gotveren",
  "ananisikeyim",
];

const MEDIUM_LEVEL_EXTRA = [
  "amcik",
  "amcigin",
  "kahpe",
  "kahbenin",
  "pezevenk",
  "pust",
  "sikecem",
  "sikicem",
  "sokuk",
  "sg",
  "siktirgit",
  "yaragim",
];

const HIGH_LEVEL_EXTRA = [
  "amina koyarim",
  "ananin ami",
  "bacini sikeyim",
  "oc",
  "orospu evladi",
  "sulaleni sikeyim",
  "seref yoksunu",
  "haysiyetsiz",
  "kahpe evladi",
];

const STEM_EXCLUDED_TERMS = new Set([
  // "got*" catches neutral words like "goturmek"; keep exact-word match only.
  "got",
]);

const AUTOMOD_EXCLUDED_TERMS = new Set([
  // Avoid broad AutoMod false positives on short/ambiguous roots.
  "got",
]);

const TURKISH_CHAR_MAP = {
  "\u00E7": "c",
  "\u011F": "g",
  "\u0131": "i",
  "\u0130": "i",
  "\u00F6": "o",
  "\u015F": "s",
  "\u00FC": "u",
};

function normalizeLevelToken(value) {
  let text = String(value || "").toLowerCase("tr");
  text = text
    .replace(/\u00E7/g, "c")
    .replace(/\u011F/g, "g")
    .replace(/\u0131/g, "i")
    .replace(/\u00F6/g, "o")
    .replace(/\u015F/g, "s")
    .replace(/\u00FC/g, "u");
  text = text.replace(/[^a-z0-9]+/g, " ").trim();
  return text;
}

function coerceProfanityLevel(raw) {
  const token = normalizeLevelToken(raw);
  if (!token || token === "0") return null;

  if (token === "az" || token === "low") return "az";
  if (token === "orta" || token === "medium") return "orta";
  if (token === "cok" || token === "high") return "cok";

  const compact = token.replace(/\s+/g, "");
  if (
    compact === "dinimilli" ||
    compact === "sadecedinimilli" ||
    compact === "sadecedinivemillikufur" ||
    compact === "sadecedinivemillikufurler" ||
    (token.includes("dini") && token.includes("milli"))
  ) {
    return "dini_milli";
  }

  return null;
}

function normalizeProfanityLevel(raw, fallback = DEFAULT_PROFANITY_LEVEL) {
  return (
    coerceProfanityLevel(raw) ||
    coerceProfanityLevel(fallback) ||
    (LEVELS.has(fallback) ? fallback : DEFAULT_PROFANITY_LEVEL)
  );
}

function normalizeText(value) {
  let text = String(value || "").toLowerCase("tr");
  for (const [tr, en] of Object.entries(TURKISH_CHAR_MAP)) {
    text = text.split(tr).join(en);
  }

  text = text.replace(/[^a-z0-9]+/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function getProfanityTerms(level) {
  const normalizedLevel = normalizeProfanityLevel(level);
  const out = [...RELIGIOUS_NATIONAL_TERMS];

  if (normalizedLevel === "dini_milli") {
    out.push(...RACIST_TERMS);
    const normalizedOnly = out
      .map((term) => normalizeText(term))
      .filter(Boolean);
    return [...new Set(normalizedOnly)];
  }

  out.push(...LOW_LEVEL_TERMS);

  if (normalizedLevel === "orta" || normalizedLevel === "cok") {
    out.push(...MEDIUM_LEVEL_EXTRA);
  }
  if (normalizedLevel === "cok") {
    out.push(...HIGH_LEVEL_EXTRA);
  }

  const normalized = out
    .map((term) => normalizeText(term))
    .filter(Boolean);

  return [...new Set(normalized)];
}

function escapeRegex(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasProfanity(content, level) {
  const normalizedContent = normalizeText(content);
  if (!normalizedContent) return false;

  const haystack = ` ${normalizedContent} `;
  const terms = getProfanityTerms(level);
  for (const term of terms) {
    if (!term) continue;
    if (haystack.includes(` ${term} `)) return true;

    if (term.includes(" ")) {
      const parts = term.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        const head = parts.slice(0, -1).map(escapeRegex).join("\\s+");
        const tail = escapeRegex(parts[parts.length - 1]);
        const phraseStemRe = new RegExp(`\\b${head}\\s+${tail}[a-z0-9]*\\b`, "i");
        if (phraseStemRe.test(normalizedContent)) return true;
      }
      continue;
    }

    if (term.length >= 3 && !STEM_EXCLUDED_TERMS.has(term)) {
      const stemRe = new RegExp(`\\b${escapeRegex(term)}[a-z0-9]*\\b`, "i");
      if (stemRe.test(normalizedContent)) return true;
    }
  }
  return false;
}

function getProfanityAutoModKeywordFilter(level) {
  const terms = getProfanityTerms(level);
  const out = [];

  for (const term of terms) {
    if (!term) continue;

    let keyword = term;
    if (term.includes(" ")) {
      // Keep phrase terms exact to reduce false positives from broad wildcard matching.
      keyword = term;
    } else if (term.length >= 3) {
      if (AUTOMOD_EXCLUDED_TERMS.has(term)) continue;
      // Allow Turkish suffix variations while avoiding "contains anywhere" matching.
      keyword = `${term}*`;
    } else {
      // Very short tokens are too noisy for AutoMod keyword matching.
      continue;
    }

    if (out.includes(keyword)) continue;
    out.push(keyword);
  }

  return out.slice(0, 1000);
}

module.exports = {
  DEFAULT_PROFANITY_LEVEL,
  normalizeProfanityLevel,
  getProfanityTerms,
  getProfanityAutoModKeywordFilter,
  hasProfanity,
};
