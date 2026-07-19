import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(__dirname, "../LearnHubPage.vue"),
  "utf8",
);
const globalCss = readFileSync(
  resolve(__dirname, "../../../style.css"),
  "utf8",
);

describe("TV Learn hub first viewport", () => {
  it("opts into the shared full-pane shell instead of a nested card", () => {
    expect(source).toMatch(/tv-content-pane/);
    expect(source).toMatch(/tv-learn-hub/);
    expect(globalCss).toMatch(/\.tv-content-pane\s*\{/);
    expect(globalCss).toMatch(/position:\s*absolute/);
    expect(globalCss).toMatch(/inset:\s*0/);
  });

  it("keeps a full-width path card and one row of three modules on first screen", () => {
    expect(source).toMatch(/\.tv-learn-hub \.path-progress-card[\s\S]*?max-height:\s*140px/);
    expect(source).toMatch(/\.tv-learn-hub \.module-tile[\s\S]*?min-height:\s*140px/);
    expect(source).toMatch(/\.tv-learn-hub \.module-grid[\s\S]*?grid-template-columns:\s*repeat\(3/);
    expect(source).toMatch(/tvExcludedModules/);
    // News, reading, and soulmate remain available on TV (speaking/translator excluded).
    expect(source).toMatch(/id:\s*"news"/);
    expect(source).toMatch(/id:\s*"reading"/);
    expect(source).toMatch(/id:\s*"soulmate"/);
    expect(source).toMatch(/tvExcludedModules = new Set\(\["speaking", "translator"\]\)/);
  });

  it("uses inset focus rings on module tiles so TV focus is not clipped", () => {
    expect(source).toMatch(/\.tv-learn-hub \.module-tile:focus-visible/);
    expect(source).toMatch(/outline-offset:\s*-4px/);
    expect(source).toMatch(/transform:\s*none/);
  });
});
