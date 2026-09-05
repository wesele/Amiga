import { filterSimilarNewsTopics } from "@/shared/newsTopicFilter.js";

const FEEDS = {
  es: ["/news/rtve/rss.xml", "/news/elmundo/rss.xml", "/news/abc/rss.xml"],
  en: ["/news/npr/rss.xml", "/news/nyt/rss.xml"],
  zh: ["/news/chinadaily/rss.xml", "/news/cgtn/rss.xml"],
};

/** Fixed-path proxy for Google News keyword search (host allowlist stays server-side). */
const SEARCH_PROXY_PATH = "/news/google-search/rss";

const SEARCH_LOCALES = {
  es: { hl: "es-419", gl: "ES", ceid: "ES:es" },
  en: { hl: "en-US", gl: "US", ceid: "US:en" },
  zh: { hl: "zh-CN", gl: "CN", ceid: "CN:zh" },
};

/**
 * Build the fixed proxy URL for a global keyword search in the target language.
 * Returns null when the keyword is empty (caller falls back to local feeds).
 */
export function googleNewsSearchProxyUrl(targetLang, keyword) {
  const trimmed = String(keyword || "").trim().slice(0, 100);
  if (!trimmed) return null;
  const locale = SEARCH_LOCALES[targetLang] || SEARCH_LOCALES.es;
  const params = new URLSearchParams({
    q: trimmed,
    hl: locale.hl,
    gl: locale.gl,
    ceid: locale.ceid,
  });
  return `${SEARCH_PROXY_PATH}?${params.toString()}`;
}

/** Max raw items kept before topic diversity filter (then typically sliced by caller limit). */
const CANDIDATE_LIMIT = 30;

function plainText(value) {
  const text = String(value || "");
  if (typeof DOMParser !== "function") return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const document = new DOMParser().parseFromString(`<body>${text}</body>`, "text/html");
  return (document.body.textContent || "").replace(/\s+/g, " ").trim();
}

function nodeText(node, selectors) {
  for (const selector of selectors) {
    const value = node.querySelector(selector)?.textContent?.trim();
    if (value) return value;
  }
  return "";
}

function parseFeed(xmlText, sourceUrl) {
  if (typeof DOMParser !== "function") return [];
  const document = new DOMParser().parseFromString(xmlText, "application/xml");
  if (document.querySelector("parsererror")) return [];
  const entries = [...document.querySelectorAll("item, entry")];
  return entries.slice(0, 12).map((entry, index) => {
    try {
      const title = nodeText(entry, ["title"]);
      const body = nodeText(entry, ["description", "summary", "content", "content\\:encoded"]);
      const source = nodeText(entry, ["link"]) || entry.querySelector("link")?.getAttribute("href") || sourceUrl;
      let image = null;
      try {
        image = entry.querySelector("enclosure[type^='image'], media\\:content")?.getAttribute("url") || null;
      } catch { image = null; }
      return {
        id: null,
        original_title: plainText(title),
        original_body: plainText(body),
        rewritten_body: null,
        rewrite_level: null,
        source,
        image_url: image,
        region: "world",
        hot_rank: index + 1,
        new_words: null,
        fetched_at: new Date().toISOString(),
      };
    } catch {
      // A single malformed entry must not drop the whole feed.
      return null;
    }
  }).filter((article) => article && article.original_title && article.original_body);
}

export async function fetchNewsThroughProxy(targetLang, { fetchImpl = globalThis.fetch, keyword = "" } = {}) {
  if (typeof fetchImpl !== "function") return [];
  // Keyword mode: single global search feed; otherwise the fixed local feeds.
  const searchUrl = googleNewsSearchProxyUrl(targetLang, keyword);
  const feeds = searchUrl ? [searchUrl] : (FEEDS[targetLang] || FEEDS.es);
  const settled = await Promise.allSettled(feeds.map(async (url) => {
    const response = await fetchImpl(url, { headers: { Accept: "application/rss+xml, application/xml, text/xml" } });
    if (!response.ok) throw new Error(`News proxy returned HTTP ${response.status}`);
    return parseFeed(await response.text(), url);
  }));
  const candidates = settled
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .slice(0, CANDIDATE_LIMIT);

  return filterSimilarNewsTopics(candidates)
    .map((article, index) => ({ ...article, hot_rank: index + 1 }));
}
