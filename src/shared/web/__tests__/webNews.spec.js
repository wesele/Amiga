import { describe, expect, it } from "vitest";
import { fetchNewsThroughProxy, googleNewsSearchProxyUrl } from "../webNews.js";

describe("googleNewsSearchProxyUrl", () => {
  it("returns null for an empty keyword (local feeds mode)", () => {
    expect(googleNewsSearchProxyUrl("es", "")).toBeNull();
    expect(googleNewsSearchProxyUrl("es", "   ")).toBeNull();
    expect(googleNewsSearchProxyUrl("es", undefined)).toBeNull();
  });

  it("builds a fixed-path proxy URL with the target-language locale", () => {
    const url = googleNewsSearchProxyUrl("es", "fútbol");
    expect(url.startsWith("/news/google-search/rss?")).toBe(true);
    // The browser never supplies an upstream host — only query values.
    expect(url).not.toContain("news.google.com");
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("q")).toBe("fútbol");
    expect(params.get("hl")).toBe("es-419");
    expect(params.get("gl")).toBe("ES");
    expect(params.get("ceid")).toBe("ES:es");
  });

  it("caps an overlong keyword like the Tauri backend", () => {
    const url = googleNewsSearchProxyUrl("en", "a".repeat(200));
    expect(new URLSearchParams(url.split("?")[1]).get("q")).toHaveLength(100);
  });
});

describe("fetchNewsThroughProxy keyword mode", () => {
  const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><item><title>AI breakthrough</title><description>Something happened in the world of AI today</description><link>https://example.com/ai</link></item></channel></rss>`;

  it("fetches the single search feed when a keyword is set", async () => {
    const seen = [];
    const fetchImpl = async (url) => {
      seen.push(url);
      return { ok: true, text: async () => rss };
    };
    const articles = await fetchNewsThroughProxy("en", { fetchImpl, keyword: "AI" });
    expect(seen).toHaveLength(1);
    expect(seen[0].startsWith("/news/google-search/rss?")).toBe(true);
    expect(articles).toHaveLength(1);
    expect(articles[0].original_title).toBe("AI breakthrough");
  });

  it("uses the fixed local feeds when the keyword is empty", async () => {
    const seen = [];
    const fetchImpl = async (url) => {
      seen.push(url);
      return { ok: false, status: 404, text: async () => "" };
    };
    await fetchNewsThroughProxy("es", { fetchImpl, keyword: "" });
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.every((url) => url.startsWith("/news/"))).toBe(true);
    expect(seen.some((url) => url.includes("google"))).toBe(false);
  });
});
