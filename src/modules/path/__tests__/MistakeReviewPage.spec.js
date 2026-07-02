import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMemoryHistory, createRouter } from "vue-router";
import { flushPromises, mount } from "@vue/test-utils";
import { setLocale } from "@/shared/i18n";
import { recordMistakesMastered } from "../mistakeMasteryStats.js";
import {
  MISTAKE_REVIEW_SESSION_LIMIT,
  saveMistakeQueue,
  upsertMistake,
} from "../mistakeReviewStore.js";

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

describe("MistakeReviewPage choice auto-submit flow", () => {
  it("wires instant choice submit for snappier review flow", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/MistakeReviewPage.vue"), "utf8");
    expect(source).toMatch(/practiceAnswerAutoCheck\.js/);
    expect(source).toMatch(/shouldAutoCheckOnAnswerChange/);
    expect(source).toMatch(/scheduleAutoAdvance/);
    expect(source).toMatch(/checkCurrentAnswer/);
  });
});

describe("MistakeReviewPage contextual hints", () => {
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

  it("wires hint button and reveal flow in the review footer", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/MistakeReviewPage.vue"), "utf8");
    expect(source).toMatch(/getQuestionHint/);
    expect(source).toMatch(/class="hint-btn"/);
    expect(source).toMatch(/class="hint-text"/);
    expect(source).toMatch(/path\.getHint/);
    expect(source).toMatch(/questionHintTimer\.js/);
    expect(source).toMatch(/scheduleAutoHint/);
    expect(source).toMatch(/path\.hintAutoRevealed/);
  });

  it("shows a contextual hint when the learner taps the hint button", async () => {
    const router = makeRouter();
    await router.push({ name: "path-mistake-review" });
    await router.isReady();

    const wrapper = mount(MistakeReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const hintBtn = wrapper.find(".hint-btn");
    expect(hintBtn.exists()).toBe(true);

    await hintBtn.trigger("click");
    await flushPromises();

    const hint = wrapper.find(".hint-text");
    expect(hint.exists()).toBe(true);
    expect(hint.text()).toContain("hello");
    expect(hint.classes()).not.toContain("is-auto");
    expect(hintBtn.attributes("disabled")).toBeDefined();
  });

  it("auto-reveals a hint after the learner idles on a review question", async () => {
    vi.useFakeTimers();

    const router = makeRouter();
    await router.push({ name: "path-mistake-review" });
    await router.isReady();

    const wrapper = mount(MistakeReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".hint-text").exists()).toBe(false);

    vi.advanceTimersByTime(15_000);
    await flushPromises();

    const hint = wrapper.find(".hint-text");
    expect(hint.exists()).toBe(true);
    expect(hint.text()).toContain("卡住太久");
    expect(hint.text()).toContain("hello");
    expect(hint.classes()).toContain("is-auto");
    expect(wrapper.find(".hint-btn").attributes("disabled")).toBeDefined();

    vi.useRealTimers();
  });
});

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

describe("MistakeReviewPage mastery milestones", () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale("zh");
    recordMistakesMastered(PAIR, 9);
    saveMistakeQueue([
      {
        question_id: "q1",
        pair_key: PAIR,
        question: Q1,
        user_answer: "ola",
        wrong_at: 1000,
        level: 3,
        next_review_at: 0,
      },
    ]);
  });

  it("includes milestone celebration markup in the summary template", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/MistakeReviewPage.vue"), "utf8");
    expect(source).toMatch(/class="mistake-milestone-banner"/);
    expect(source).toMatch(/recordMistakesMastered/);
  });

  it("celebrates when cumulative mastered mistakes cross a milestone", async () => {
    const { applyReviewStreak } = await import("@/shared/reviewStreak.js");
    applyReviewStreak.mockResolvedValue(null);

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

    expect(wrapper.find(".mistake-milestone-banner").text()).toContain("10 道错题");
  });
});

describe("MistakeReviewPage SRS progress", () => {
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

  it("wires SRS progress markup and helpers in the review body", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/MistakeReviewPage.vue"), "utf8");
    expect(source).toMatch(/mistakeReviewSrs\.js/);
    expect(source).toMatch(/class="srs-progress"/);
    expect(source).toMatch(/class="srs-schedule"/);
    expect(source).toMatch(/srsStageLabel/);
    expect(source).toMatch(/srsCorrectFeedback/);
  });

  it("shows mastery dots and stage label for the current SRS level", async () => {
    const router = makeRouter();
    await router.push({ name: "path-mistake-review" });
    await router.isReady();

    const wrapper = mount(MistakeReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const progress = wrapper.find(".srs-progress");
    expect(progress.exists()).toBe(true);
    expect(progress.findAll(".srs-dot.is-filled")).toHaveLength(1);
    expect(progress.find(".srs-label").text()).toContain("掌握进度 1/4");
  });

  it("shows the next review schedule after a correct answer", async () => {
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

    const schedule = wrapper.find(".srs-schedule");
    expect(schedule.exists()).toBe(true);
    expect(schedule.text()).toContain("1 天后再次复习");
  });

  it("announces mastery on the final SRS stage", async () => {
    saveMistakeQueue([
      {
        question_id: "q1",
        pair_key: PAIR,
        question: Q1,
        user_answer: "ola",
        wrong_at: 1000,
        level: 3,
        next_review_at: 0,
      },
    ]);

    const router = makeRouter();
    await router.push({ name: "path-mistake-review" });
    await router.isReady();

    const wrapper = mount(MistakeReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".srs-label").text()).toContain("掌握进度 4/4");

    await wrapper.find(".text-input").setValue("hola");
    await wrapper.find(".action-btn.primary").trigger("click");
    await flushPromises();

    expect(wrapper.find(".srs-schedule").text()).toContain("已掌握");
  });
});

const REVIEW_ANSWER = "ok";

function seedDueMistakes(count, pairKey = PAIR) {
  const now = 1000;
  const items = Array.from({ length: count }, (_, i) => ({
    question_id: `q${i + 1}`,
    pair_key: pairKey,
    question: {
      id: `q${i + 1}`,
      type: "T09",
      hint: `word-${i + 1}`,
      answer: REVIEW_ANSWER,
    },
    user_answer: "wrong",
    wrong_at: now + i,
    level: 0,
    next_review_at: 0,
  }));
  saveMistakeQueue(items);
}

async function completeMistakeReviewSession(wrapper) {
  while (!wrapper.find(".summary").exists()) {
    const input = wrapper.find(".text-input");
    if (!input.exists()) break;
    await input.setValue(REVIEW_ANSWER);
    await wrapper.find(".action-btn.primary").trigger("click");
    await flushPromises();
    await wrapper.find(".action-btn.primary").trigger("click");
    await flushPromises();
  }
}

describe("MistakeReviewPage continue reviewing", () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale("zh");
  });

  it("includes continue-review markup in the summary template", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/MistakeReviewPage.vue"), "utf8");
    expect(source).toMatch(/showContinueReview/);
    expect(source).toMatch(/mistakeReviewContinuation\.js/);
    expect(source).toMatch(/path\.mistakeReviewContinueHint/);
  });

  it("offers to continue when more mistakes remain due", async () => {
    seedDueMistakes(MISTAKE_REVIEW_SESSION_LIMIT + 1);

    const router = makeRouter();
    await router.push({ name: "path-mistake-review" });
    await router.isReady();

    const wrapper = mount(MistakeReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await completeMistakeReviewSession(wrapper);

    expect(wrapper.text()).toContain("错题复习完成");
    expect(wrapper.text()).toContain("继续复习（还有 1 道）");
  });

  it("hides continue button when no more mistakes are due", async () => {
    seedDueMistakes(1);

    const router = makeRouter();
    await router.push({ name: "path-mistake-review" });
    await router.isReady();

    const wrapper = mount(MistakeReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await completeMistakeReviewSession(wrapper);

    expect(wrapper.text()).toContain("错题复习完成");
    expect(wrapper.text()).not.toContain("继续复习");
  });
});