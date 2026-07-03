/**
 * Visual snapshot for issue #58 listen-first audio panel.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/path/__tests__/screenshotListenFirst.spec.js
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setLocale } from "@/shared/i18n";
import QuestionRenderer from "../components/QuestionRenderer.vue";

const takeScreenshot = process.env.SCREENSHOT === "1";
const ROOT = resolveRoot();

function resolveRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), "../../..");
}

function captureHtml(wrapper, filename) {
  if (!takeScreenshot) return;
  const outDir = join(ROOT, "..", "screenshots");
  mkdirSync(outDir, { recursive: true });
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { margin: 0; width: 480px; font-family: system-ui, sans-serif; background: #f7f7f7; }
    :root {
      --bg: #f7f7f7; --white: #fff; --border: #e5e5e5; --blue: #1cb0f6;
      --blue-bg: #ddf4ff; --blue-hover: #1899d6; --green: #58cc02; --green-bg: #e5f8d8;
      --red: #ea2b2b; --red-bg: #ffe5e5; --text: #3c3c3c; --text-light: #777;
      --radius-sm: 8px; --radius-md: 12px; --transition: 0.15s ease;
    }
  </style></head><body>${wrapper.html()}</body></html>`;
  writeFileSync(join(outDir, filename), html, "utf8");
}

describe("screenshotListenFirst", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setLocale("zh");
    class MockUtterance {
      constructor(text) {
        this.text = text;
        this.lang = "";
        this.rate = 1;
        this.onend = null;
        this.onerror = null;
      }
    }
    globalThis.SpeechSynthesisUtterance = MockUtterance;
    globalThis.speechSynthesis = {
      cancel: vi.fn(),
      speak: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.SpeechSynthesisUtterance;
    delete globalThis.speechSynthesis;
  });

  const t02Question = {
    id: "t02-1",
    type: "T02",
    language: "es",
    audioText: "el perro",
    imageOptions: [
      { desc: "狗", imageSvg: "<svg></svg>" },
      { desc: "猫", imageSvg: "<svg></svg>" },
    ],
    answerIdx: 0,
  };

  it("captures T02 listen-first layout", async () => {
    const wrapper = mount(QuestionRenderer, {
      props: { question: t02Question, answer: null, showResult: false, isCorrect: false },
    });
    captureHtml(wrapper, "listen-first-t02.png");
    expect(wrapper.find(".listen-first").exists()).toBe(true);
    expect(wrapper.find(".audio-panel").exists()).toBe(true);
  });

  it("captures playing state", async () => {
    const wrapper = mount(QuestionRenderer, {
      props: { question: t02Question, answer: null, showResult: false, isCorrect: false },
    });
    const playPromise = wrapper.find(".audio-panel-main").trigger("click");
    await flushPromises();
    captureHtml(wrapper, "listen-first-playing.png");
    globalThis.speechSynthesis.speak.mock.calls[0][0].onend?.();
    await playPromise;
    expect(wrapper.find(".audio-panel.is-playing").exists()).toBe(true);
  });
});