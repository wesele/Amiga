import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(resolve(__dirname, "../VocabPage.vue"), "utf8");
const popupSource = readFileSync(
  resolve(__dirname, "../../../shared/components/WordPopup.vue"),
  "utf8",
);

describe("Vocab study page layout", () => {
  it("marks the study stage and uses a study heading instead of repeating the word", () => {
    expect(pageSource).toMatch(/vocab-page--study/);
    expect(pageSource).toMatch(/study-heading/);
    expect(pageSource).toMatch(/t\(['"]vocab\.study['"]\)/);
  });

  it("centers the page study card with a constrained width", () => {
    expect(popupSource).toMatch(/\.word-popup-root\.layout-page[\s\S]*?align-items:\s*center/);
    expect(popupSource).toMatch(/\.word-popup-root\.layout-page[\s\S]*?justify-content:\s*center/);
    expect(popupSource).toMatch(/\.word-popup-page[\s\S]*?max-width:\s*640px/);
    expect(popupSource).toMatch(/\.popup-body--page[\s\S]*?text-align:\s*center/);
    expect(popupSource).toMatch(/page-study-footer/);
  });

  it("enlarges TV study typography and action targets", () => {
    expect(popupSource).toMatch(/html\[data-app-mode="tv"\] \.word-popup-page[\s\S]*?max-width:\s*760px/);
    expect(popupSource).toMatch(/html\[data-app-mode="tv"\] \.word-popup-page \.popup-word/);
    expect(popupSource).toMatch(/html\[data-app-mode="tv"\] \.word-popup-page \.act-known[\s\S]*?min-height:\s*56px/);
  });
});
