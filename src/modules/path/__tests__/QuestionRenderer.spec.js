import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const QuestionRenderer = (await import("@/modules/path/components/QuestionRenderer.vue")).default;

describe("QuestionRenderer", () => {
  it("resets internal answer state when switching questions without ids", async () => {
    const firstQuestion = {
      type: "T03",
      pairs: [
        { left: "hola", right: "hello" },
        { left: "adiós", right: "goodbye" },
      ],
    };
    const secondQuestion = {
      type: "T03",
      pairs: [
        { left: "gracias", right: "thanks" },
        { left: "hasta luego", right: "see you" },
      ],
    };
    const wrapper = mount(QuestionRenderer, {
      props: { question: firstQuestion, answer: [] },
    });

    await wrapper.findAll(".match-item")[0].trigger("click");
    await wrapper.findAll(".match-item")[2].trigger("click");
    expect(wrapper.findAll(".match-item.matched")).toHaveLength(2);

    await wrapper.setProps({ question: secondQuestion, answer: [] });

    expect(wrapper.findAll(".match-item.matched")).toHaveLength(0);
    expect(wrapper.findAll(".match-item")).toHaveLength(4);
  });

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

  it("allows generated SVG with harmless leading whitespace", () => {
    const source = readFileSync(
      resolve(ROOT, "modules/path/components/QuestionImage.vue"),
      "utf8",
    );
    expect(source).toContain('(props.imageSvg || "").trim()');
  });

  it("plays the current question's audio text instead of background content", () => {
    const source = readFileSync(
      resolve(ROOT, "modules/path/components/QuestionRenderer.vue"),
      "utf8",
    );
    expect(source).toContain("const text = props.question.audioText;");
    expect(source).not.toMatch(/speechSynthesis\.speak\([^)]*background/);
  });
});
