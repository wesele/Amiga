import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mount } from "@vue/test-utils";
import QuestionRenderer from "../components/QuestionRenderer.vue";

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

  it("shakes the wrong choice and pulses the correct option after an incorrect answer", () => {
    const source = readFileSync(
      resolve(ROOT, "modules/path/components/QuestionRenderer.vue"),
      "utf8",
    );
    expect(source).toMatch(/reveal-incorrect/);
    expect(source).toMatch(/option-shake/);
    expect(source).toMatch(/correct-reveal-pulse/);
    expect(source).toMatch(/prefers-reduced-motion/);
  });

  it("applies result classes to text inputs after check", async () => {
    const question = { id: "q1", type: "T09", hint: "hola", answer: "hola" };
    const wrapper = mount(QuestionRenderer, {
      props: {
        question,
        answer: "adios",
        showResult: true,
        isCorrect: false,
      },
    });

    expect(wrapper.find(".text-input.is-wrong").exists()).toBe(true);
    expect(wrapper.find(".options.reveal-incorrect").exists()).toBe(false);

    await wrapper.setProps({ isCorrect: true });
    expect(wrapper.find(".text-input.is-correct").exists()).toBe(true);
    expect(wrapper.find(".text-input.is-wrong").exists()).toBe(false);
  });

  it("marks choice options and container when a multiple-choice answer is wrong", () => {
    const question = {
      id: "q1",
      type: "T05",
      sentence: "Hola ____.",
      options: ["Ana", "casa", "perro", "libro"],
      answerIdx: 0,
    };
    const wrapper = mount(QuestionRenderer, {
      props: {
        question,
        answer: 1,
        showResult: true,
        isCorrect: false,
      },
    });

    const buttons = wrapper.findAll(".option-btn");
    expect(wrapper.find(".options.reveal-incorrect").exists()).toBe(true);
    expect(buttons[0].classes()).toContain("correct");
    expect(buttons[1].classes()).toContain("wrong");
  });
});