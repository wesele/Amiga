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

  it("AppShell uses shouldShowL1Nav so TV reader keeps the rail", () => {
    const source = readFileSync(resolve(ROOT, "modules/shell/AppShell.vue"), "utf8");
    expect(source).toMatch(/shouldShowL1Nav\(route\.name,\s*isTvMode\)/);
    expect(source).toMatch(/justify-content:\s*flex-start/);
  });
});
