import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushPromises, mount } from "@vue/test-utils";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";
import AchievementsPage from "@/modules/achievements/AchievementsPage.vue";
import {
  createAchievementMatrix,
  newsLevel,
  readingLevel,
  speakingLevel,
} from "@/modules/achievements/achievementMatrix.js";

describe("achievement matrix", () => {
  it("builds 12 Monday-to-Sunday columns ending with the current week", () => {
    const matrix = createAchievementMatrix([], new Date(2026, 6, 10, 12));
    expect(matrix.weeks).toHaveLength(12);
    expect(matrix.weeks.every((week) => week.days.length === 7)).toBe(true);
    expect(matrix.weeks.at(-1).start).toBe("2026-07-06");
    expect(matrix.weeks.at(-1).days.at(-1).date).toBe("2026-07-12");
  });

  it("uses the requested thresholds for each activity", () => {
    expect([0, 1, 2].map(readingLevel)).toEqual(["empty", "active", "complete"]);
    expect([0, 1, 2, 3].map(newsLevel)).toEqual(["empty", "active", "active", "complete"]);
    expect([0, 1, 2].map(speakingLevel)).toEqual(["empty", "active", "complete"]);
  });
});

describe("AchievementsPage", () => {
  beforeEach(() => {
    setLocale("zh", { persist: false });
  });

  it("renders 84 day cells without explanatory legends", async () => {
    api.__setInvoke(vi.fn((command) => {
      if (command === "get_current_user") return Promise.resolve({ id: "u1" });
      if (command === "record_app_open_cmd") return Promise.resolve(true);
      if (command === "get_achievement_days_cmd") {
        return Promise.resolve([{
          date: new Date().toLocaleDateString("en-CA"),
          reading_am: 1,
          reading_pm: 2,
          news_count: 3,
          speaking_count: 1,
        }]);
      }
      if (command === "get_achievement_progress_cmd") {
        return Promise.resolve({
          check_in_current: 8,
          check_in_best: 8,
          full_learning_current: 3,
          full_learning_best: 3,
          learning_total: 31,
        });
      }
      return Promise.resolve(null);
    }));

    const wrapper = mount(AchievementsPage);
    await flushPromises();
    expect(wrapper.findAll(".week-column")).toHaveLength(12);
    expect(wrapper.findAll(".day-cell")).toHaveLength(84);
    expect(wrapper.findAll(".mini-cell")).toHaveLength(336);
    expect(wrapper.find(".position-legend").exists()).toBe(false);
    expect(wrapper.find(".color-legend").exists()).toBe(false);
    expect(wrapper.findAll(".achievement-group")).toHaveLength(3);
    expect(wrapper.findAll(".achievement-badge")).toHaveLength(12);
    expect(wrapper.findAll(".achievement-badge.unlocked")).toHaveLength(3);
  });

  it("uses a fixed-height single-screen layout with 12 compact columns", () => {
    const source = readFileSync(
      resolve(__dirname, "../AchievementsPage.vue"),
      "utf8",
    );
    expect(source).toMatch(/grid-template-columns:\s*repeat\(12,\s*minmax\(0,\s*1fr\)\)/);
    expect(source).toMatch(/\.matrix-layout\s*\{[^}]*width:\s*100%/s);
    expect(source).toMatch(/\.achievements-page\s*\{[^}]*height:\s*100%[^}]*overflow:\s*hidden/s);
    expect(source).toMatch(/\.achievement-groups\s*\{[^}]*grid-template-rows:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
    expect(source).toMatch(/\.achievement-groups\s*\{[^}]*gap:\s*14px[^}]*padding:\s*14px\s+14px\s+20px/s);
    expect(source).toMatch(/\.day-cell\s*\{[^}]*width:\s*100%[^}]*aspect-ratio:\s*1\.12\s*\/\s*1/s);
    expect(source).not.toMatch(/\.matrix-scroll\s*\{/);
  });
});
