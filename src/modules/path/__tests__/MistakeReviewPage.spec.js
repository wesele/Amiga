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
    user: { id: "u1" },
    nativeLang: "zh",
    targetLang: "es",
  }),
}));

vi.mock("@/shared/reviewStreak.js", () => ({
  applyReviewStreak: vi.fn().mockResolvedValue({ extended: true, current: 4 }),
  reviewStreakCelebration: vi.fn((update, t) =>
    update?.extended ? t("path.streakExtended", { n: update.current }) : "",
  ),
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

describe("MistakeReviewPage review streak", () => {
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

  it("includes streak celebration markup in the summary template", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/MistakeReviewPage.vue"), "utf8");
    expect(source).toMatch(/class="streak-banner"/);
    expect(source).toMatch(/applyReviewStreak/);
  });

  it("shows streak banner after completing the review session", async () => {
    const { applyReviewStreak } = await import("@/shared/reviewStreak.js");
    applyReviewStreak.mockResolvedValue({ extended: true, current: 4 });

    const router = makeRouter();
    await router.push({ name: "path-mistake-review" });
    await router.isReady();

    const wrapper = mount(MistakeReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".text-input").setValue("hola");
    await wrapper.find(".action-btn.primary").trigger("click");
    await flushPromises();
    await wrapper.find(".action-btn.primary").trigger("click");
    await flushPromises();

    expect(applyReviewStreak).toHaveBeenCalledWith("u1", 1);
    expect(wrapper.find(".streak-banner").text()).toContain("4 天连胜");
  });
});