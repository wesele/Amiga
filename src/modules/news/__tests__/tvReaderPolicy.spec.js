import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  shouldBlockUiOnRewrite,
  shouldShowL1Nav,
  shouldShowOriginalWhileRewriting,
} from "@/shared/tvPolicy.js";

const ROOT = resolve(__dirname, "../../..");

describe("TV news reader policy (shipped)", () => {
  it("does not block the UI on rewrite in TV mode", () => {
    expect(shouldBlockUiOnRewrite(true)).toBe(false);
    expect(shouldShowOriginalWhileRewriting(true)).toBe(true);
  });

  it("keeps L1 nav on the reader route in TV mode", () => {
    expect(shouldShowL1Nav("reader", true)).toBe(true);
  });

  it("NewsReader.vue wires non-blocking rewrite + cancel for TV", () => {
    const source = readFileSync(resolve(ROOT, "modules/news/NewsReader.vue"), "utf8");
    expect(source).toMatch(/shouldBlockUiOnRewrite/);
    expect(source).toMatch(/cancelRewrite/);
    expect(source).toMatch(/rewritingBackground/);
    expect(source).toMatch(/blocksOnRewrite/);
    // Background rewrite (void), not only await-blocking path.
    expect(source).toMatch(/void doRewrite\(\)/);
    // Phone still has blocking path.
    expect(source).toMatch(/await doRewrite\(\)/);
  });

  it("NewsReader words are TV-focusable and Enter triggers onWordTap (translate)", () => {
    const source = readFileSync(resolve(ROOT, "modules/news/NewsReader.vue"), "utf8");
    expect(source).toMatch(/:tabindex="isTvLayoutMode \? 0 : undefined"/);
    expect(source).toMatch(/@keydown\.enter\.prevent="onWordTap\(token\)"/);
    expect(source).toMatch(/\.word:focus-visible/);
    // Paragraph-aware body (not a flat token stream).
    expect(source).toMatch(/bodyParagraphs/);
    expect(source).toMatch(/class="para"/);
  });

  it("NewsReader bilingual translation paragraphs are TV-focusable", () => {
    const source = readFileSync(resolve(ROOT, "modules/news/NewsReader.vue"), "utf8");
    expect(source).toMatch(/class="para-translation"/);
    expect(source).toMatch(/para-translation[\s\S]*:tabindex="isTvLayoutMode \? 0 : undefined"/);
    expect(source).toMatch(/\.para-translation:focus-visible/);
  });

  it("ReadingReader matches news paragraph + word focus wiring", () => {
    const source = readFileSync(resolve(ROOT, "modules/reading/ReadingReader.vue"), "utf8");
    expect(source).toMatch(/:tabindex="isTvLayoutMode \? 0 : undefined"/);
    expect(source).toMatch(/@keydown\.enter\.prevent="onWordTap\(token\)"/);
    expect(source).toMatch(/bodyParagraphs/);
    expect(source).toMatch(/class="para"/);
    expect(source).toMatch(/\.word:focus-visible/);
    expect(source).toMatch(/html\[data-app-mode="tv"\] \.article-text/);
    expect(source).toMatch(/para-translation[\s\S]*:tabindex="isTvLayoutMode \? 0 : undefined"/);
  });

  it("News and Reading TV body uses modest gutters and full-pane text width", () => {
    for (const rel of [
      "modules/news/NewsReader.vue",
      "modules/reading/ReadingReader.vue",
    ]) {
      const source = readFileSync(resolve(ROOT, rel), "utf8");
      expect(source).toMatch(/html\[data-app-mode="tv"\] \.article-body\s*\{[^}]*padding:\s*14px\s+16px/s);
      expect(source).toMatch(/html\[data-app-mode="tv"\] \.article-text\s*\{[^}]*max-width:\s*none/s);
      expect(source).toMatch(/html\[data-app-mode="tv"\] \.article-text\s*\{[^}]*margin-inline:\s*0/s);
    }
  });

  it("SoulMateStory letter body matches news word-focus wiring", () => {
    const source = readFileSync(resolve(ROOT, "modules/soulmate/SoulMateStory.vue"), "utf8");
    expect(source).toMatch(/:tabindex="isTvLayoutMode \? 0 : undefined"/);
    expect(source).toMatch(/@keydown\.enter\.prevent="onWordTap\(token\)"/);
    expect(source).toMatch(/@keydown\.space\.prevent="onWordTap\(token\)"/);
    expect(source).toMatch(/bodyParagraphs/);
    expect(source).toMatch(/class="para"/);
    expect(source).toMatch(/\.word:focus-visible/);
    expect(source).toMatch(/pushInPageBackHandler/);
  });

  it("AppShell uses shouldShowL1Nav so TV reader keeps the rail", () => {
    const source = readFileSync(resolve(ROOT, "modules/shell/AppShell.vue"), "utf8");
    expect(source).toMatch(/shouldShowL1Nav\(route\.name,\s*isTvLayoutMode\)/);
    expect(source).toMatch(/justify-content:\s*flex-start/);
  });

  it("custom reader back buttons are non-focusable on TV", () => {
    for (const rel of [
      "modules/news/NewsReader.vue",
      "modules/reading/ReadingReader.vue",
      "modules/reading/ReadingTest.vue",
    ]) {
      const source = readFileSync(resolve(ROOT, rel), "utf8");
      expect(source).toMatch(/class="back-btn"[^>]*:tabindex="isTvLayoutMode \? -1 : undefined"/);
    }
  });
});
