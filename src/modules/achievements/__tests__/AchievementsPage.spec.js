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
import { achievementTracksForMode } from "@/shared/tvPolicy.js";

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

  it("includes appOpen track in achievement heat maps", () => {
    expect(achievementTracksForMode(true)).toEqual(["readingAm", "news", "readingPm", "appOpen"]);
    expect(achievementTracksForMode(false)).toContain("appOpen");
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
    expect(wrapper.findAll(".achievement-badge.unlocked")).toHaveLength(4);
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
    expect(source).toMatch(/class="achievements-body"/);
    expect(source).not.toMatch(/\.matrix-scroll\s*\{/);
  });

  it("uses a 50/50 left-right TV layout with matrix and badges side by side", () => {
    const source = readFileSync(
      resolve(__dirname, "../AchievementsPage.vue"),
      "utf8",
    );
    const globalCss = readFileSync(
      resolve(__dirname, "../../../style.css"),
      "utf8",
    );
    expect(source).toMatch(/tv-content-pane/);
    expect(source).toMatch(/tv-achievements/);
    expect(source).toMatch(
      /\.tv-achievements\s+\.achievements-body\s*\{[^}]*grid-template-columns:\s*1fr\s+1fr/s,
    );
    expect(globalCss).toMatch(/html\[data-app-mode="tv"\] \.tv-content-pane[\s\S]*?position:\s*absolute/);
    expect(source).toMatch(/\.tv-achievements\s+\.day-cell[\s\S]*?aspect-ratio:\s*auto/);
    expect(source).not.toMatch(/DEBUG/);
  });

  it("TV learning trajectory uses one week per row (7 days across)", () => {
    const source = readFileSync(
      resolve(__dirname, "../AchievementsPage.vue"),
      "utf8",
    );
    expect(source).toMatch(/tv-week-rows/);
    expect(source).toMatch(/class="week-row"/);
    expect(source).toMatch(/class="weekday-header-row"/);
    expect(source).toMatch(
      /\.tv-achievements \.weeks-rows\s*\{[^}]*grid-template-rows:\s*repeat\(12/s,
    );
    expect(source).toMatch(
      /\.tv-achievements \.week-row\s*\{[^}]*grid-template-columns:\s*repeat\(7/s,
    );
  });

  it("opens day detail modal when clicking a day cell", async () => {
    api.__setInvoke(vi.fn((command) => {
      if (command === "get_current_user") return Promise.resolve({ id: "u1" });
      if (command === "record_app_open_cmd") return Promise.resolve(true);
      if (command === "get_achievement_days_cmd") {
        return Promise.resolve([{
          date: "2026-07-21",
          reading_am: 2,
          reading_pm: 1,
          news_count: 3,
          speaking_count: 1,
        }]);
      }
      if (command === "get_achievement_progress_cmd") {
        return Promise.resolve({
          check_in_current: 7,
          check_in_best: 7,
          full_learning_current: 7,
          full_learning_best: 7,
          learning_total: 7,
        });
      }
      return Promise.resolve(null);
    }));

    const wrapper = mount(AchievementsPage, { attachTo: document.body });
    await flushPromises();

    // Verify 7 total learning days unlocks the 7-day milestone badge (1 week)
    const groups = wrapper.findAll(".achievement-group");
    const totalLearningGroup = groups[2];
    expect(totalLearningGroup.text()).toContain("累计一周");
    expect(totalLearningGroup.findAll(".achievement-badge.unlocked")).toHaveLength(1);

    // Click the first day cell
    const dayCell = wrapper.find(".day-cell");
    await dayCell.trigger("click");
    await flushPromises();

    const modal = document.querySelector(".day-detail-modal");
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain("学习内容");
    expect(modal.textContent).toContain("上午阅读");
    expect(modal.textContent).toContain("下午阅读");
    expect(modal.textContent).toContain("新闻阅读");

    // Click close button
    const closeBtn = modal.querySelector(".btn-dialog-close");
    closeBtn.click();
    await flushPromises();
    expect(document.querySelector(".day-detail-modal")).toBeNull();
    wrapper.unmount();
  });
});
