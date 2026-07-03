import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import { flushPromises, mount } from "@vue/test-utils";
import { setLocale } from "@/shared/i18n";
import * as api from "@/shared/api.js";

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
    streak: { extended: true, current: 3 },
    daily_goal_just_met: false,
    daily_goal: {
      goal_met: false,
      effective_lessons_today: 1,
      target_lessons: 2,
    },
  }),
  reviewStreakCelebration: vi.fn(() => ""),
}));

vi.mock("@/shared/lessonFeedback.js", () => ({
  playAnswerFeedback: vi.fn(),
}));

vi.mock("@/modules/ai-chat/openAiContact.js", () => ({
  openAiContact: vi.fn().mockResolvedValue(true),
}));

const FocusPracticePage = (await import("@/modules/path/FocusPracticePage.vue")).default;

const MOCK_QUESTION = {
  id: "q-focus-1",
  type: "T09",
  hint: "hello",
  answer: "hola",
};

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn", name: "learn", component: { template: "<div/>" } },
      {
        path: "/learn/path/practice/:typeId",
        name: "path-focus-practice",
        component: FocusPracticePage,
      },
    ],
  });
}

function postFocusInvoke(cmd) {
  if (cmd === "get_focus_practice_cmd") {
    return Promise.resolve({
      question_type: "T09",
      questions: [MOCK_QUESTION],
    });
  }
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

describe("FocusPracticePage post-focus plan", () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale("zh", { persist: false });
    api.__setInvoke(vi.fn().mockImplementation(postFocusInvoke));
  });

  it("shows continue focus as primary when the round was imperfect", async () => {
    const router = makeRouter();
    await router.push({ name: "path-focus-practice", params: { typeId: "T09" } });
    await router.isReady();

    const wrapper = mount({ template: "<router-view />" }, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find("input").setValue("wrong");
    await wrapper.find(".review-footer .action-btn.primary").trigger("click");
    await flushPromises();
    await wrapper.find(".review-footer .action-btn.primary").trigger("click");
    await flushPromises();

    expect(wrapper.find(".next-steps-panel").exists()).toBe(true);
    expect(wrapper.text()).toContain("再练一轮");
    expect(wrapper.text()).toContain("继续下一课");
    expect(wrapper.text()).toContain("稍后再说");
  });
});