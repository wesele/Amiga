const FEEDS = {
  es: ["/news/rtve/rss.xml", "/news/elmundo/rss.xml", "/news/abc/rss.xml"],
  en: ["/news/npr/rss.xml", "/news/nyt/rss.xml"],
  zh: ["/news/chinadaily/rss.xml", "/news/cgtn/rss.xml"],
};

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
    const title = nodeText(entry, ["title"]);
    const body = nodeText(entry, ["description", "summary", "content", "content\\:encoded"]);
    const source = nodeText(entry, ["link"]) || entry.querySelector("link")?.getAttribute("href") || sourceUrl;
    const image = entry.querySelector("enclosure[type^='image'], media\\:content")?.getAttribute("url") || null;
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
  }).filter((article) => article.original_title && article.original_body);
}

export async function fetchNewsThroughProxy(targetLang, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") return [];
  const feeds = FEEDS[targetLang] || FEEDS.es;
  const settled = await Promise.allSettled(feeds.map(async (url) => {
    const response = await fetchImpl(url, { headers: { Accept: "application/rss+xml, application/xml, text/xml" } });
    if (!response.ok) throw new Error(`News proxy returned HTTP ${response.status}`);
    return parseFeed(await response.text(), url);
  }));
  return settled
    .flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .slice(0, 30)
    .map((article, index) => ({ ...article, hot_rank: index + 1 }));
}
