/**
 * Filter news articles so near-duplicate topics do not crowd the list.
 * Uses title token Jaccard + shared distinctive tokens (names/entities).
 */

const STOPWORDS = new Set([
  // English
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "from",
  "by", "with", "as", "is", "are", "was", "were", "be", "been", "being", "it", "its",
  "this", "that", "these", "those", "after", "before", "over", "under", "into", "about",
  "says", "said", "new", "news", "report", "reports", "how", "why", "what", "when", "who",
  // Spanish
  "el", "la", "los", "las", "un", "una", "unos", "unas", "y", "o", "de", "del", "al",
  "en", "con", "por", "para", "que", "se", "su", "sus", "es", "son", "fue", "ser",
  "tras", "entre", "sobre", "sin", "más", "mas", "como", "cuando", "donde", "qué",
  "los", "las", "una", "este", "esta", "estos", "estas", "hay", "han", "ha",
  // Chinese function words (single char)
  "的", "了", "在", "是", "和", "与", "及", "或", "被", "对", "将", "就", "也", "都",
  "而", "并", "等", "中", "为",
]);

const JACCARD_THRESHOLD = 0.45;
const DISTINCTIVE_TOKEN_MIN_LEN = 6;

function hasCjk(text) {
  return /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(text);
}

/**
 * Extract content tokens from a news title for similarity comparison.
 * @param {string} title
 * @returns {Set<string>}
 */
export function titleContentTokens(title) {
  const raw = String(title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  const tokens = new Set();

  if (hasCjk(raw)) {
    const cjk = raw.replace(/[^\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g, "");
    for (let i = 0; i < cjk.length - 1; i += 1) {
      const bigram = cjk.slice(i, i + 2);
      if (![...bigram].every((ch) => STOPWORDS.has(ch))) {
        tokens.add(bigram);
      }
    }
  }

  const words = raw
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  for (const word of words) {
    if (word.length < 4) continue;
    if (STOPWORDS.has(word)) continue;
    // Skip pure digits
    if (/^\d+$/.test(word)) continue;
    tokens.add(word);
  }

  return tokens;
}

/**
 * @param {Set<string>} a
 * @param {Set<string>} b
 */
export function tokenSetsSimilar(a, b) {
  if (!a.size || !b.size) return false;

  let inter = 0;
  let distinctiveShared = false;
  for (const t of a) {
    if (b.has(t)) {
      inter += 1;
      if (t.length >= DISTINCTIVE_TOKEN_MIN_LEN) distinctiveShared = true;
    }
  }
  if (inter === 0) return false;

  const union = a.size + b.size - inter;
  const jaccard = inter / union;
  if (jaccard >= JACCARD_THRESHOLD) return true;
  if (distinctiveShared) return true;
  return false;
}

export function titlesAreSimilarTopic(titleA, titleB) {
  return tokenSetsSimilar(titleContentTokens(titleA), titleContentTokens(titleB));
}

/**
 * Keep first article of each topic cluster; preserve input order.
 * @template T
 * @param {T[]} articles
 * @param {(item: T) => string} getTitle
 * @returns {T[]}
 */
export function filterSimilarNewsTopics(articles, getTitle = (a) => a?.original_title || a?.title || "") {
  if (!Array.isArray(articles) || articles.length === 0) return [];

  const kept = [];
  const keptTokens = [];

  for (const article of articles) {
    const title = getTitle(article);
    const tokens = titleContentTokens(title);
    const similar = keptTokens.some((prev) => tokenSetsSimilar(prev, tokens));
    if (similar) continue;
    kept.push(article);
    keptTokens.push(tokens);
  }

  return kept;
}
