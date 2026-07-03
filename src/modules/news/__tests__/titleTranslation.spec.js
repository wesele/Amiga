import { describe, expect, it } from "vitest";
import { buildTitleTranslationMap, titlePreviewState } from "../titleTranslation.js";

describe("titleTranslation", () => {
  it("buildTitleTranslationMap merges API rows", () => {
    const map = buildTitleTranslationMap([
      { article_id: 1, title_translation: "政府宣布新措施" },
      { article_id: 2, title_translation: "央行加息" },
      { article_id: 3, title_translation: "" },
    ]);
    expect(map.size).toBe(2);
    expect(map.get(1)).toBe("政府宣布新措施");
    expect(map.get(2)).toBe("央行加息");
  });

  it("titlePreviewState prefers cached translation", () => {
    const article = { id: 5, original_title: "Titulo" };
    const map = new Map([[5, "标题预览"]]);
    expect(titlePreviewState(article, map)).toEqual({
      show: true,
      text: "标题预览",
      loading: false,
      failed: false,
    });
  });

  it("titlePreviewState shows loading skeleton when missing translation", () => {
    const article = { id: 6, original_title: "Otro titulo" };
    expect(
      titlePreviewState(article, new Map(), { loading: true, failed: false }),
    ).toEqual({
      show: false,
      text: "",
      loading: true,
      failed: false,
    });
  });

  it("titlePreviewState marks failed when translation unavailable", () => {
    const article = { id: 7, original_title: "Fallo" };
    expect(
      titlePreviewState(article, new Map(), { loading: false, failed: true }),
    ).toEqual({
      show: false,
      text: "",
      loading: false,
      failed: true,
    });
  });
});