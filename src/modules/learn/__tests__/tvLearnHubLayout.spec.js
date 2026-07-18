import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(__dirname, "../LearnHubPage.vue"),
  "utf8",
);

describe("TV Learn hub first viewport", () => {
  it("keeps a compact path card so News/Reading tiles fit on first screen", () => {
    expect(source).toMatch(/\.tv-learn-hub \.path-progress-card[\s\S]*?max-height:\s*132px/);
    expect(source).toMatch(/\.tv-learn-hub \.module-tile[\s\S]*?min-height:\s*100px/);
    expect(source).toMatch(/tvExcludedModules/);
    // News and reading remain available on TV (speaking/translator/soulmate excluded).
    expect(source).toMatch(/id:\s*"news"/);
    expect(source).toMatch(/id:\s*"reading"/);
    expect(source).toMatch(/tvExcludedModules = new Set\(\["speaking", "translator", "soulmate"\]\)/);
  });
});
