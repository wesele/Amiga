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

  it("avoids duplicate kind labels and draws a single curved connector between nodes", () => {
    const source = readVue("src/modules/path/PathMapPage.vue");
    expect(source).toMatch(/showKindLabel\(section\)/);
    expect(source).toMatch(/connectorPath\(idx, idx \+ 1\)/);
    expect(source).toMatch(/idx < unit\.sections\.length - 1/);
    expect(source).toMatch(/\.path-connector\s*\{[\s\S]*height:\s*40px/);
    expect(source).toMatch(/\.connector-line\s*\{[\s\S]*stroke:\s*var\(--green\)/);
    expect(source).not.toMatch(/connector-shadow/);
    expect(source).not.toMatch(/\.path-lane::before/);
    expect(source).toMatch(/class="step-body"/);
  });

  it("offsets nodes left, center, and right with captions below the node", () => {
    const source = readVue("src/modules/path/PathMapPage.vue");
    expect(source).toMatch(/\.path-step\.lane-left \.step-body\s*\{[\s\S]*align-self:\s*flex-start/);
    expect(source).toMatch(/\.path-step\.lane-center \.step-body\s*\{[\s\S]*align-self:\s*center/);
    expect(source).toMatch(/\.path-step\.lane-right \.step-body\s*\{[\s\S]*align-self:\s*flex-end/);
    expect(source).toMatch(/\.step-body\s*\{[\s\S]*flex-direction:\s*column/);
    expect(source).toMatch(/\.node-caption\s*\{[\s\S]*text-align:\s*center/);
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

  it("places connectors in the gap below captions", () => {
    const source = readVue("src/modules/path/PathMapPage.vue");
    expect(source).toMatch(/class="step-body"[\s\S]*class="path-connector"/);
    expect(source).toMatch(/\.path-connector\s*\{[\s\S]*margin:\s*2px 0 8px/);
    expect(source).toMatch(/\.step-body\s*\{[\s\S]*gap:\s*6px/);
  });
});