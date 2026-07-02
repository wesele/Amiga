import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMemoryHistory, createRouter } from "vue-router";
import { flushPromises, mount } from "@vue/test-utils";
import { setLocale } from "@/shared/i18n";
import { saveMistakeQueue, upsertMistake } from "../mistakeReviewStore.js";

const ROOT = resolve(__dirname, "../../../..");
const PAIR = "zh-es";
const Q1 = {
  id: "q1",
  type: "T09",
  hint: "hello",
  answer: "hola",
};

vi.mock("@tauri-apps/plugin-shell", () => ({}));

vi.mock("@/shared/learningContext.js", () => ({
  loadLearningContext: vi.fn().mockResolvedValue({
    nativeLang: "zh",
    targetLang: "es",
  }),
}));

vi.mock("@/shared/lessonFeedback.js", () => ({
  playAnswerFeedback: vi.fn(),
}));

const MistakeReviewPage = (await import("@/modules/path/MistakeReviewPage.vue")).default;

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn", name: "learn", component: { template: "<div/>" } },
      {
        path: "/learn/path/mistake-review",
        name: "path-mistake-review",
        component: MistakeReviewPage,
      },
    ],
  });
}

describe("MistakeReviewPage previous wrong answer", () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale("zh");
    saveMistakeQueue(
      upsertMistake([], {
        question: Q1,
        userAnswer: "ola",
        pairKey: PAIR,
        now: 1000,
      }),
    );
  });

  it("includes previous wrong answer markup in the template", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/MistakeReviewPage.vue"), "utf8");
    expect(source).toMatch(/class="previous-wrong"/);
    expect(source).toMatch(/path\.mistakeReviewPreviousAnswer/);
    expect(source).toMatch(/formatUserAnswer/);
  });

  it("shows the stored wrong answer before the question", async () => {
    const router = makeRouter();
    await router.push({ name: "path-mistake-review" });
    await router.isReady();

    const wrapper = mount(MistakeReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const banner = wrapper.find(".previous-wrong");
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain("上次答错：ola");
  });
});