/**
 * @vitest-environment happy-dom
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { setLocale } from "@/shared/i18n";
import { markUnseenUnlocks } from "@/modules/achievements/achievementUnlockDetect.js";
import { syncRecentUnlocks } from "@/modules/achievements/achievementRecent.js";
import { buildAchievements } from "@/modules/achievements/achievements.js";
import { computeNavBadges } from "@/modules/shell/navAttention.js";

const ROOT = resolve(__dirname, "../../../..");

function captureScreenshot(html, styles, filename, width = 480, height = 900) {
  const outDir = resolve(ROOT, "screenshots");
  const htmlPath = resolve(outDir, `${filename}.html`);
  const pngPath = resolve(outDir, `${filename}.png`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    htmlPath,
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    :root {
      --bg: #f5f5f5;
      --white: #fff;
      --surface: #fff;
      --surface-variant: #f0f0f0;
      --green-bg: #e8f7ef;
      --green: #2e9e6a;
      --text: #1a1a1a;
      --text-light: #666;
      --text-lighter: #999;
      --radius-md: 12px;
      --radius-sm: 8px;
      --transition: 0.2s ease;
      --safe-bottom: 0px;
      --border: #e5e5e5;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); font-family: system-ui, sans-serif; }
    .frame { width: ${width}px; margin: 0 auto; padding: 16px; }
    ${styles}
    </style></head><body><div class="frame">${html}</div></body></html>`,
  );
  execSync(
    `google-chrome --headless=new --disable-gpu --window-size=${width},${height} --screenshot=${pngPath} file://${htmlPath}`,
    { stdio: "inherit" },
  );
  rmSync(htmlPath);
  return pngPath;
}

function readScopedStyles(relPath) {
  return readFileSync(resolve(ROOT, relPath), "utf8")
    .match(/<style scoped>([\s\S]*?)<\/style>/)?.[1] ?? "";
}

function unlockBannerPreviewHtml() {
  return `
    <div class="achievement-unlock-banner">
      <span class="unlock-icon" aria-hidden="true">🏆</span>
      <div class="unlock-copy">
        <p class="unlock-title">成就解锁：10 节课</p>
        <button type="button" class="unlock-action">查看成就</button>
      </div>
    </div>
  `;
}

function recentStripPreviewHtml() {
  syncRecentUnlocks(["lessons-10"]);
  const achievements = buildAchievements({ lessonProgress: { completed: 10 } });
  const badge = achievements.items.find((item) => item.id === "lessons-10");
  return `
    <section class="recent-strip">
      <p class="recent-title">最近获得</p>
      <div class="recent-scroll" role="list">
        <button type="button" class="recent-chip" role="listitem">
          <span class="recent-icon" aria-hidden="true">${badge.icon}</span>
          <span class="recent-label">10 节课</span>
        </button>
      </div>
    </section>
  `;
}

function navBadgePreviewHtml() {
  markUnseenUnlocks(["lessons-10"]);
  const badge = computeNavBadges({}, { activeTab: "learn" }).achievements;
  const count = badge.dotOnly ? "" : badge.count;
  return `
    <nav class="bottom-nav">
      <button class="nav-item">
        <div class="nav-icon-wrap"><div class="nav-icon"></div></div>
        <span class="nav-label">学习</span>
      </button>
      <button class="nav-item">
        <div class="nav-icon-wrap">
          <div class="nav-icon"></div>
          <span class="nav-badge ${badge.dotOnly ? "is-dot" : ""}">${count}</span>
        </div>
        <span class="nav-label">成就</span>
      </button>
    </nav>
  `;
}

describe("achievements unlock screenshot", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
  });

  it(
    "captures settlement unlock banner, nav badge, and recent strip",
    () => {
      const combinedHtml = `
        <section class="shot-block">${unlockBannerPreviewHtml()}</section>
        <section class="shot-block">${navBadgePreviewHtml()}</section>
        <section class="shot-block">${recentStripPreviewHtml()}</section>
      `;
      const combinedStyles = [
        readScopedStyles("src/modules/achievements/AchievementUnlockBanner.vue"),
        readScopedStyles("src/modules/shell/AppShell.vue"),
        readScopedStyles("src/modules/achievements/AchievementsPage.vue"),
        ".shot-block { margin-bottom: 16px; }",
      ].join("\n");

      const pngPath = captureScreenshot(
        combinedHtml,
        combinedStyles,
        "achievement-unlock-flow",
        480,
        520,
      );
      expect(pngPath).toContain("achievement-unlock-flow.png");
      expect(computeNavBadges({}, { activeTab: "learn" }).achievements.show).toBe(true);
    },
    15_000,
  );
});