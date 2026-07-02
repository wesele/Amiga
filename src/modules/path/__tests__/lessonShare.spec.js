import { describe, expect, it, vi } from "vitest";
import {
  buildLessonShareHighlights,
  buildLessonShareText,
  shareLessonResult,
  shouldShowLessonShare,
} from "../lessonShare.js";

const t = (key, params = {}) => {
  const templates = {
    "path.shareLessonIntro": '🎉 Just passed "{title}" on Amiga!',
    "path.shareLessonDefaultTitle": "a lesson",
    "path.shareLessonScore": "⭐ {correct}/{total} correct · {stars} stars",
    "path.shareLessonStreak": "🔥 {n}-day streak!",
    "path.perfectLesson": "✨ Perfect lesson!",
    "path.perfectLessonStreak3": "✨ 3 perfect lessons in a row!",
    "path.perfectLessonStreakActive": "✨ {n} perfect lessons in a row",
    "path.streakMilestone7": "🏆 One week streak!",
    "path.dailyGoalMetCelebration": "🎯 Daily goal: {done}/{total}",
    "path.weeklyGoalMetCelebration": "📅 Weekly goal: {done}/{total}",
    "path.lessonMilestoneReached": "🏆 {n} lessons complete!",
    "path.levelUp": "🎓 Level up to {level}!",
    "profile.shareProgressFooter": "Join me — Amiga",
    "path.shareLessonTitle": "My Amiga lesson",
    "profile.shareCopied": "Copied",
    "profile.shareFail": "Failed",
  };
  let out = templates[key] || key;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return out;
};

describe("shouldShowLessonShare", () => {
  it("shows share only when the lesson passed", () => {
    expect(shouldShowLessonShare({ passed: true })).toBe(true);
    expect(shouldShowLessonShare({ passed: false })).toBe(false);
    expect(shouldShowLessonShare(null)).toBe(false);
  });
});

describe("buildLessonShareHighlights", () => {
  it("includes streak and perfect lesson highlights", () => {
    const highlights = buildLessonShareHighlights({
      result: {
        passed: true,
        streak_extended: true,
        streak_current: 5,
        perfect_lesson_streak: 2,
      },
      perfectLesson: true,
      t,
    });
    expect(highlights).toContain("✨ Perfect lesson!");
    expect(highlights).toContain("✨ 2 perfect lessons in a row");
    expect(highlights).toContain("🔥 5-day streak!");
  });

  it("prefers streak milestone copy over generic streak line", () => {
    const highlights = buildLessonShareHighlights({
      result: {
        passed: true,
        streak_extended: true,
        streak_current: 7,
      },
      perfectLesson: false,
      t,
    });
    expect(highlights).toContain("🏆 One week streak!");
    expect(highlights).not.toContain("🔥 7-day streak!");
  });

  it("includes goal and milestone highlights when present", () => {
    const highlights = buildLessonShareHighlights({
      result: {
        passed: true,
        daily_goal_just_met: true,
        daily_goal_lessons_today: 2,
        daily_goal_target: 2,
        lesson_milestone_reached: 10,
        level_upgraded: true,
        new_cefr_level: "A2",
      },
      perfectLesson: false,
      t,
    });
    expect(highlights).toContain("🎯 Daily goal: 2/2");
    expect(highlights).toContain("🏆 10 lessons complete!");
    expect(highlights).toContain("🎓 Level up to A2!");
  });
});

describe("buildLessonShareText", () => {
  it("builds a multi-line share message with score and footer", () => {
    const text = buildLessonShareText({
      sectionTitle: "闯关练习",
      correct: 4,
      total: 4,
      stars: 3,
      result: { passed: true, streak_extended: true, streak_current: 3 },
      perfectLesson: true,
      t,
    });
    expect(text).toContain('Just passed "闯关练习"');
    expect(text).toContain("4/4 correct · 3 stars");
    expect(text).toContain("Perfect lesson!");
    expect(text).toContain("3-day streak!");
    expect(text).toContain("Join me — Amiga");
  });

  it("falls back to default title when section title is empty", () => {
    const text = buildLessonShareText({
      sectionTitle: "",
      correct: 3,
      total: 4,
      stars: 2,
      result: { passed: true },
      perfectLesson: false,
      t,
    });
    expect(text).toContain('Just passed "a lesson"');
  });
});

describe("shareLessonResult", () => {
  it("uses native share when available", async () => {
    const nativeShareText = vi.fn().mockResolvedValue(undefined);
    const showShareStatus = vi.fn();
    await shareLessonResult({
      sectionTitle: "Practice",
      correct: 4,
      total: 4,
      stars: 3,
      result: { passed: true },
      perfectLesson: false,
      t,
      nativeShareText,
      showShareStatus,
    });
    expect(nativeShareText).toHaveBeenCalledOnce();
    expect(showShareStatus).not.toHaveBeenCalled();
  });

  it("falls back to clipboard copy", async () => {
    const showShareStatus = vi.fn();
    const copy = vi.fn().mockResolvedValue(true);
    await shareLessonResult({
      sectionTitle: "Practice",
      correct: 4,
      total: 4,
      stars: 3,
      result: { passed: true },
      perfectLesson: false,
      t,
      nativeShareText: vi.fn().mockRejectedValue(new Error("no native")),
      showShareStatus,
      navigatorRef: {},
      copy,
    });
    expect(copy).toHaveBeenCalledOnce();
    expect(showShareStatus).toHaveBeenCalledWith("Copied");
  });
});