import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("QuestionRenderer", () => {
  it("uses learner-facing prompt for T01, not imageDesc metadata", () => {
    const source = readFileSync(
      resolve(ROOT, "modules/path/components/QuestionRenderer.vue"),
      "utf8",
    );
    expect(source).toContain('if (q.type === "T01") return t("path.chooseByImage")');
    expect(source).not.toMatch(/if \(q\.type === "T01"\) return q\.imageDesc/);
  });

  it("does not render imageDesc as visible learner text in QuestionImage", () => {
    const source = readFileSync(
      resolve(ROOT, "modules/path/components/QuestionImage.vue"),
      "utf8",
    );
    expect(source).not.toContain('class="image-desc"');
    expect(source).toContain("imageAlt");
  });

  it("submits text answers on Enter and focuses the input for T09/T10", () => {
    const source = readFileSync(
      resolve(ROOT, "modules/path/components/QuestionRenderer.vue"),
      "utf8",
    );
    expect(source).toMatch(/textInputSubmit\.js/);
    expect(source).toMatch(/shouldSubmitOnEnter/);
    expect(source).toMatch(/@keydown\.enter\.prevent="onEnterKey"/);
    expect(source).toMatch(/emit\("submit"\)/);
    expect(source).toMatch(/enterkeyhint="go"/);
    expect(source).toMatch(/focusTextInput/);
  });
});