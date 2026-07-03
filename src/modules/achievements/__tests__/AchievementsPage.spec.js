import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import * as api from "@/shared/api.js";

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));

const AchievementsPage = (await import("@/modules/achievements/AchievementsPage.vue")).default;

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/achievements", name: "achievements", component: AchievementsPage },
      { path: "/path", name: "path", component: { template: "<div>path</div>" } },
      { path: "/vocab-review", name: "vocab-review", component: { template: "<div>vocab</div>" } },
      {
        path: "/path-mistake-review",
        name: "path-mistake-review",
        component: { template: "<div>mistakes</div>" },
      },
    ],
  });
}

describe("AchievementsPage", () => {
  let mockInvoke;
  let router;

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
    router = createTestRouter();
  });

  function mockApis() {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ id: 1, target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_user_vocab_stats_cmd") {
        return Promise.resolve({ total_known: 0, total_learning: 0, total: 0 });
      }
      if (cmd === "get_learning_streak_cmd") {
        return Promise.resolve({ current: 14, longest: 14, practiced_today: true });
      }
      if (cmd === "get_lesson_milestone_progress_cmd") {
        return Promise.resolve({ completed: 25, next_milestone: 50, progress_pct: 50 });
      }
      if (cmd === "get_perfect_lesson_streak_cmd") {
        return Promise.resolve({ current: 3, best: 5 });
      }
      return Promise.resolve(null);
    });
  }

  async function mountPage() {
    await router.push("/achievements");
    await router.isReady();
    const wrapper = mount(AchievementsPage, {
      global: { plugins: [router] },
    });
    await flushPromises();
    return wrapper;
  }

  it("shows grouped badges and next-badge hero card", async () => {
    mockApis();
    const wrapper = await mountPage();

    expect(wrapper.text()).toContain("成就");
    expect(wrapper.text()).toContain("已解锁 6/29");
    expect(wrapper.text()).toContain("下一枚徽章");
    expect(wrapper.text()).toContain("课时徽章");
    expect(wrapper.text()).toContain("已解锁 2/6");
    const unlocked = wrapper.findAll(".achievement-badge.unlocked");
    expect(unlocked.length).toBe(6);
  });

  it("opens locked badge sheet with action CTA", async () => {
    mockApis();
    const wrapper = await mountPage();
    const locked = wrapper.find(".achievement-badge:not(.unlocked)");
    await locked.trigger("click");
    await flushPromises();

    expect(document.body.textContent).toContain("如何解锁");
    expect(document.body.textContent).toContain("继续学习");
  });

  it("navigates from hero CTA to path", async () => {
    mockApis();
    const wrapper = await mountPage();
    const pushSpy = vi.spyOn(router, "push");
    await wrapper.find(".focus-action").trigger("click");
    expect(pushSpy).toHaveBeenCalledWith({ name: "path" });
  });
});