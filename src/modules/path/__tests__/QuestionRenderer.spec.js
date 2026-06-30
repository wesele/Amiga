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
});