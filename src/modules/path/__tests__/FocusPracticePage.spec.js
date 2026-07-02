import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMemoryHistory, createRouter } from "vue-router";
import { flushPromises, mount } from "@vue/test-utils";
import { setLocale } from "@/shared/i18n";
import * as api from "@/shared/api.js";

const ROOT = resolve(__dirname, "../../../..");

const MOCK_QUESTION = {
  id: "q-focus-1",
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
    cefr: "A1",
  }),
}));

vi.mock("@/shared/reviewStreak.js", () => ({
  applyReviewStreak: vi.fn().mockResolvedValue({ extended: true, current: 3 }),
  reviewStreakCelebration: vi.fn((update, t) =>
    update?.extended ? t("path.streakExtended", { n: update.current }) : "",
  ),
}));

vi.mock("@/shared/lessonFeedback.js", () => ({
  playAnswerFeedback: vi.fn(),
}));

const FocusPracticePage = (await import("@/modules/path/FocusPracticePage.vue")).default;

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

describe("FocusPracticePage", () => {
  let mockInvoke;

  beforeEach(() => {
    localStorage.clear();
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_focus_practice_cmd") {
        return Promise.resolve({
          question_type: "T09",
          questions: [MOCK_QUESTION],
        });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("wires instant choice submit for snappier practice flow", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/FocusPracticePage.vue"), "utf8");
    expect(source).toMatch(/choiceAutoSubmit\.js/);
    expect(source).toMatch(/shouldAutoSubmitOnChoice/);
    expect(source).toMatch(/scheduleAutoAdvance/);
    expect(source).toMatch(/checkCurrentAnswer/);
  });

  it("wires hint flow and records answers during practice", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/FocusPracticePage.vue"), "utf8");
    expect(source).toMatch(/getFocusPractice/);
    expect(source).toMatch(/recordAnswer/);
    expect(source).toMatch(/class="hint-btn"/);
    expect(source).toMatch(/path\.focusPracticeBadge/);
    expect(source).toMatch(/sessionAccuracy/);
    expect(source).toMatch(/focusPracticeContinuation\.js/);
    expect(source).toMatch(/FOCUS_CONTINUE_LABEL_KEY/);
    expect(source).toMatch(/continuePractice/);
  });

  it("offers another round when the session was not perfect", async () => {
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

    expect(wrapper.text()).toContain("专项练习完成");
    expect(wrapper.text()).toContain("再练一轮");
    expect(wrapper.text()).toContain("趁热打铁");
  });

  it("hides continue button after a perfect focus practice round", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_focus_practice_cmd") {
        return Promise.resolve({
          question_type: "T09",
          questions: [{ ...MOCK_QUESTION, answer: "hola" }],
        });
      }
      return Promise.resolve(null);
    });

    const router = makeRouter();
    await router.push({ name: "path-focus-practice", params: { typeId: "T09" } });
    await router.isReady();

    const wrapper = mount({ template: "<router-view />" }, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".hint-btn").trigger("click");
    await flushPromises();
    const answerInput = wrapper.find("input");
    await answerInput.setValue("hola");
    await wrapper.find(".review-footer .action-btn.primary").trigger("click");
    await flushPromises();
    await wrapper.find(".review-footer .action-btn.primary").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("专项练习完成");
    expect(wrapper.text()).not.toContain("再练一轮");
  });

  it("reloads another round when learner taps continue practicing", async () => {
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

    const continueBtn = wrapper
      .findAll(".summary-actions .action-btn.primary")
      .find((btn) => btn.text().includes("再练一轮"));
    expect(continueBtn).toBeTruthy();
    await continueBtn.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("专项练习 · 薄弱环节强化");
    expect(
      mockInvoke.mock.calls.filter(([cmd]) => cmd === "get_focus_practice_cmd").length,
    ).toBe(2);
  });

  it("shows an error for unsupported question types", async () => {
    const router = makeRouter();
    await router.push({ name: "path-focus-practice", params: { typeId: "T99" } });
    await router.isReady();

    const wrapper = mount({ template: "<router-view />" }, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".center-state").exists()).toBe(true);
    expect(wrapper.text()).not.toContain("专项练习 · 薄弱环节强化");
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});