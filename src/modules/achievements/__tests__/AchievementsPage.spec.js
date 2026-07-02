import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));

const AchievementsPage = (await import("@/modules/achievements/AchievementsPage.vue")).default;

describe("AchievementsPage", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
  });

  it("shows unlocked and locked achievement badges", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([
        { id: 1, target_language: "es", cefr_level: "A1" },
      ]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_user_vocab_stats_cmd") return Promise.resolve({ total_known: 0, total_learning: 0, total: 0 });
      if (cmd === "get_learning_streak_cmd") return Promise.resolve({ current: 14, longest: 14, practiced_today: true });
      if (cmd === "get_lesson_milestone_progress_cmd") {
        return Promise.resolve({ completed: 25, next_milestone: 50, progress_pct: 50 });
      }
      if (cmd === "get_perfect_lesson_streak_cmd") {
        return Promise.resolve({ current: 3, best: 5 });
      }
      return Promise.resolve(null);
    });

    const wrapper = mount(AchievementsPage);
    await flushPromises();

    expect(wrapper.text()).toContain("成就");
    expect(wrapper.text()).toContain("已解锁 6/29");
    const unlocked = wrapper.findAll(".achievement-badge.unlocked");
    expect(unlocked.length).toBe(6);
    expect(unlocked.some((badge) => badge.text().includes("10 节课"))).toBe(true);
    expect(unlocked.some((badge) => badge.text().includes("14 天连胜"))).toBe(true);
  });
});