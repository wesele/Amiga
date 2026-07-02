import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mount, flushPromises } from "@vue/test-utils";
import QuestionRenderer from "../components/QuestionRenderer.vue";
import { QUESTION_AUDIO_AUTO_PLAY_MS } from "../questionAudio.js";

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

  describe("auto-play audio", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      class MockUtterance {
        constructor(text) {
          this.text = text;
          this.lang = "";
          this.onend = null;
          this.onerror = null;
        }
      }
      globalThis.SpeechSynthesisUtterance = MockUtterance;
      globalThis.speechSynthesis = {
        cancel: vi.fn(),
        speak: vi.fn((utter) => {
          utter.onend?.();
        }),
      };
    });

    afterEach(() => {
      vi.useRealTimers();
      delete globalThis.SpeechSynthesisUtterance;
      delete globalThis.speechSynthesis;
    });

    it("schedules audio for listening questions after a short delay", async () => {
      const question = {
        id: "listen-1",
        type: "T08",
        language: "es",
        audioText: "Buenos días",
        options: ["A", "B"],
        answerIdx: 0,
      };
      mount(QuestionRenderer, {
        props: { question, answer: null, showResult: false, isCorrect: false },
      });

      expect(globalThis.speechSynthesis.speak).not.toHaveBeenCalled();
      vi.advanceTimersByTime(QUESTION_AUDIO_AUTO_PLAY_MS);
      await flushPromises();
      expect(globalThis.speechSynthesis.speak).toHaveBeenCalledOnce();
    });

    it("does not auto-play while answer feedback is visible", async () => {
      const question = {
        id: "listen-1",
        type: "T08",
        language: "es",
        audioText: "Buenos días",
        options: ["A", "B"],
        answerIdx: 0,
      };
      mount(QuestionRenderer, {
        props: { question, answer: 1, showResult: true, isCorrect: false },
      });

      vi.advanceTimersByTime(QUESTION_AUDIO_AUTO_PLAY_MS + 100);
      await flushPromises();
      expect(globalThis.speechSynthesis.speak).not.toHaveBeenCalled();
    });
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