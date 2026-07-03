import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import { flushPromises, mount } from "@vue/test-utils";
import { setLocale } from "@/shared/i18n";
import * as api from "@/shared/api.js";
import { applyReviewStreak } from "@/shared/reviewStreak.js";
import {
  MISTAKE_REVIEW_SESSION_LIMIT,
  saveMistakeQueue,
} from "../mistakeReviewStore.js";

vi.mock("@tauri-apps/plugin-shell", () => ({}));

vi.mock("@/shared/learningContext.js", () => ({
  loadLearningContext: vi.fn().mockResolvedValue({
    user: { id: "u1" },
    nativeLang: "zh",
    targetLang: "es",
    cefr: "A1",
  }),
}));

vi.mock("@/shared/reviewStreak.js", () => ({
  applyReviewStreak: vi.fn().mockResolvedValue({
    streak: { extended: true, current: 4 },
    daily_goal_just_met: false,
    daily_goal: {
      goal_met: false,
      review_sessions_today: 1,
      effective_lessons_today: 1,
      target_lessons: 2,
    },
  }),
  reviewStreakCelebration: vi.fn(() => ""),
  reviewDailyGoalCelebration: vi.fn(() => ""),
  reviewDailyGoalNudge: vi.fn(() => ""),
  reviewDailyGoalContributed: vi.fn(() => ""),
}));

vi.mock("@/shared/lessonFeedback.js", () => ({
  playAnswerFeedback: vi.fn(),
}));

vi.mock("@/modules/ai-chat/openAiContact.js", () => ({
  openAiContact: vi.fn().mockResolvedValue(true),
}));

const MistakeReviewPage = (await import("@/modules/path/MistakeReviewPage.vue")).default;

const REVIEW_ANSWER = "ok";
const PAIR = "zh-es";

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

function postReviewInvoke(cmd) {
  if (cmd === "get_path_curriculum_cmd") {
    return Promise.resolve({
      status: "active",
      units: [
        {
          sections: [
            {
              id: "zh-es/U01-GRAMMAR",
              kind: "grammar",
              title_native: "基础语法",
              current: true,
              locked: false,
            },
          ],
        },
      ],
    });
  }
  if (cmd === "get_unknown_words_cmd") return Promise.resolve([]);
  if (cmd === "get_articles_cmd") return Promise.resolve([]);
  if (cmd === "get_articles_reading_status_cmd") return Promise.resolve([]);
  return Promise.resolve(null);
}

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
    await new Promise((resolve) => setTimeout(resolve, 750));
    await flushPromises();
  }
}

describe("MistakeReviewPage post-review plan", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
    localStorage.clear();
    setLocale("zh", { persist: false });
    api.__setInvoke(vi.fn().mockImplementation(postReviewInvoke));
    vi.mocked(applyReviewStreak).mockClear();
  });

  it("shows continue review as primary when backlog exceeds the session", async () => {
    seedDueMistakes(MISTAKE_REVIEW_SESSION_LIMIT * 2);

    const router = makeRouter();
    await router.push({ name: "path-mistake-review" });
    await router.isReady();

    const wrapper = mount(MistakeReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await completeMistakeReviewSession(wrapper);
    await flushPromises();

    expect(applyReviewStreak).toHaveBeenCalled();
    expect(wrapper.text()).toContain("错题复习完成");
    expect(wrapper.find(".next-steps-panel").exists()).toBe(true);
    expect(wrapper.text()).toContain("继续复习（还有 5 道）");
    expect(wrapper.text()).toContain("稍后再说");
  });

  it("lists continue review in the queue when a smaller backlog remains", async () => {
    seedDueMistakes(MISTAKE_REVIEW_SESSION_LIMIT + 1);

    const router = makeRouter();
    await router.push({ name: "path-mistake-review" });
    await router.isReady();

    const wrapper = mount(MistakeReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await completeMistakeReviewSession(wrapper);
    await flushPromises();

    expect(wrapper.find(".next-steps-panel").exists()).toBe(true);
    expect(wrapper.text()).toContain("继续复习（还有 1 道）");
    expect(wrapper.text()).toContain("继续下一课");
  });

  it("hides continue review when no more mistakes are due", async () => {
    seedDueMistakes(1);

    const router = makeRouter();
    await router.push({ name: "path-mistake-review" });
    await router.isReady();

    const wrapper = mount(MistakeReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await completeMistakeReviewSession(wrapper);
    await flushPromises();

    expect(wrapper.find(".next-steps-panel").exists()).toBe(true);
    expect(wrapper.text()).not.toContain("继续复习");
    expect(wrapper.text()).toContain("继续下一课");
  });
});