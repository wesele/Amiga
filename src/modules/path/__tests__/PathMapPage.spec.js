import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
function readVue(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

describe("PathMapPage unit guide layout", () => {
  it("lets guide-text shrink in the flex row so subtitles are not truncated", () => {
    const source = readVue("src/modules/path/PathMapPage.vue");
    const guideText = source.match(/\.guide-text\s*\{[\s\S]*?\}/);
    expect(guideText, ".guide-text rule not found").toBeTruthy();
    expect(guideText[0]).toMatch(/flex:\s*1/);
    expect(guideText[0]).toMatch(/min-width:\s*0/);
  });

  it("wraps or clamps the unit subtitle instead of clipping horizontally", () => {
    const source = readVue("src/modules/path/PathMapPage.vue");
    const guideSub = source.match(/\.guide-sub\s*\{[\s\S]*?\}/);
    expect(guideSub, ".guide-sub rule not found").toBeTruthy();
    expect(guideSub[0]).toMatch(/overflow-wrap:\s*break-word/);
    expect(guideSub[0]).toMatch(/-webkit-line-clamp:\s*2/);
    expect(guideSub[0]).toMatch(/-webkit-box-orient:\s*vertical/);
  });

  it("avoids duplicate kind labels and keeps captions out of the connector grid cell", () => {
    const source = readVue("src/modules/path/PathMapPage.vue");
    expect(source).toMatch(/showKindLabel\(section\)/);
    expect(source).toMatch(/\.connector\s*\{[\s\S]*position:\s*absolute/);
    expect(source).toMatch(/\.path-step\.lane-left \.node-caption\s*\{[\s\S]*grid-row:\s*1/);
  });

  it("shows current level in one button and opens a picker sheet", () => {
    const source = readVue("src/modules/path/PathMapPage.vue");
    expect(source).toMatch(/class="level-btn"/);
    expect(source).toMatch(/showLevelPicker/);
    expect(source).toMatch(/level-sheet-option/);
    expect(source).not.toMatch(/class="level-pill"/);
  });

  it("keeps the level button compact so header text has more room", () => {
    const source = readVue("src/modules/path/PathMapPage.vue");
    const levelBtn = source.match(/\.level-btn\s*\{[\s\S]*?\}/);
    expect(levelBtn, ".level-btn rule not found").toBeTruthy();
    expect(levelBtn[0]).toMatch(/min-width:\s*0/);
    expect(levelBtn[0]).toMatch(/padding:\s*6px\s+10px/);
    expect(levelBtn[0]).not.toMatch(/min-width:\s*56px/);
  });

  it("keeps path nodes and captions spaced apart", () => {
    const source = readVue("src/modules/path/PathMapPage.vue");
    const pathStep = source.match(/\.path-step\s*\{[\s\S]*?\}/);
    expect(pathStep, ".path-step rule not found").toBeTruthy();
    expect(pathStep[0]).toMatch(/min-height:\s*124px/);
    expect(pathStep[0]).toMatch(/padding:\s*16px\s+0/);
    expect(source).toMatch(/padding-right:\s*22px/);
    expect(source).toMatch(/padding-left:\s*22px/);
  });
});