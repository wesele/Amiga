import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";
import LearnHubPage from "@/modules/learn/LearnHubPage.vue";
import { buildNextSuggestion, loadStudyPace, saveStudyPace } from "../learnDesk.js";

vi.mock("@tauri-apps/plugin-shell", () => ({}));

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn", name: "learn", component: LearnHubPage },
      { path: "/learn/path", name: "path", component: { template: "<div/>" } },
      { path: "/learn/assessment", name: "assessment", component: { template: "<div/>" } },
      { path: "/learn/review", name: "review", component: { template: "<div/>" } },
      { path: "/learn/expression", name: "expression", component: { template: "<div/>" } },
      { path: "/vocab", name: "vocab", component: { template: "<div/>" } },
      { path: "/news", name: "news", component: { template: "<div/>" } },
      {
        path: "/learn/translator/:sessionId",
        name: "learn-translator",
        component: { template: "<div/>" },
      },
    ],
  });
}

describe("LearnHubPage", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    api.__setInvoke(vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_setting_cmd") return Promise.resolve(null);
      if (cmd === "save_setting_cmd") return Promise.resolve(null);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_learning_profile_cmd") {
        return Promise.resolve({
          user_id: "u1",
          cefr_level: "A1",
          articles_read: 0,
          vocab_seen: 2,
          vocab_mastered: 0,
          weak_skills: ["词汇"],
          interests: [],
        });
      }
      if (cmd === "get_review_summary_cmd") return Promise.resolve({ due_count: 2 });
      if (cmd === "should_prompt_assessment_cmd") return Promise.resolve(false);
      if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
      if (cmd === "create_chat_session_cmd") return Promise.resolve("translator-sess");
      return Promise.resolve(null);
    }));
  });

  it("renders today's learning desk entries", async () => {
    const router = makeRouter();
    const wrapper = mount(LearnHubPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain("今日学习桌");
    expect(wrapper.text()).toContain("继续路径");
    expect(wrapper.text()).toContain("能力评测");
    expect(wrapper.text()).toContain("真实阅读");
    expect(wrapper.text()).toContain("2 项到期");
  });

  it("navigates to assessment from the desk", async () => {
    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(LearnHubPage, { global: { plugins: [router] } });
    await flushPromises();

    const assessment = wrapper.findAll(".entry-row")
      .find((button) => button.text().includes("能力评测"));
    await assessment.trigger("click");

    expect(pushSpy).toHaveBeenCalledWith({ name: "assessment" });
  });

  it("navigates to review basket from the desk", async () => {
    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(LearnHubPage, { global: { plugins: [router] } });
    await flushPromises();

    const review = wrapper.findAll(".entry-row")
      .find((button) => button.text().includes("温习篮"));
    await review.trigger("click");

    expect(pushSpy).toHaveBeenCalledWith({ name: "review" });
  });

  it("persists pace with local fallback", async () => {
    const storage = window.localStorage;
    await saveStudyPace("challenge", { saveSetting: vi.fn().mockRejectedValue(new Error("x")), storage });
    await expect(loadStudyPace({ getSetting: vi.fn().mockRejectedValue(new Error("x")), storage }))
      .resolves.toBe("challenge");
  });

  it("builds a non-empty linked suggestion", () => {
    const suggestion = buildNextSuggestion({
      profile: { vocab_seen: 1, articles_read: 0 },
      pace: "slow",
    });
    expect(suggestion.title).toBeTruthy();
    expect(suggestion.route).toEqual({ name: "vocab" });
  });
});
