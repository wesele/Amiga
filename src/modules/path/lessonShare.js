import { copyToClipboard } from "../news/share.js";
import { perfectLessonMilestoneKey } from "./perfectLessonStreak.js";
import { getStreakMilestone, streakMilestoneKey } from "./streakMilestone.js";

/**
 * Collects celebration lines worth sharing after a passed lesson.
 */
export function buildLessonShareHighlights({ result, perfectLesson, t }) {
  if (!result || typeof t !== "function") return [];

  const highlights = [];

  if (perfectLesson) {
    highlights.push(t("path.perfectLesson"));
  }

  if (result.perfect_lesson_milestone_reached) {
    highlights.push(
      t(perfectLessonMilestoneKey(result.perfect_lesson_milestone_reached), {
        n: result.perfect_lesson_milestone_reached,
      }),
    );
  } else if (result.passed && result.perfect_lesson_streak > 1 && perfectLesson) {
    highlights.push(
      t("path.perfectLessonStreakActive", { n: result.perfect_lesson_streak }),
    );
  }

  const streakMilestone = getStreakMilestone(
    result.streak_current,
    result.streak_extended,
  );
  if (streakMilestone) {
    highlights.push(t(streakMilestoneKey(streakMilestone), { n: streakMilestone }));
  } else if (result.streak_extended && result.streak_current > 0) {
    highlights.push(t("path.shareLessonStreak", { n: result.streak_current }));
  }

  if (result.daily_goal_just_met) {
    highlights.push(
      t("path.dailyGoalMetCelebration", {
        done: result.daily_goal_lessons_today,
        total: result.daily_goal_target,
      }),
    );
  }

  if (result.weekly_goal_just_met) {
    highlights.push(
      t("path.weeklyGoalMetCelebration", {
        done: result.weekly_goal_active_days,
        total: result.weekly_goal_target_days,
      }),
    );
  }

  if (result.lesson_milestone_reached) {
    highlights.push(
      t("path.lessonMilestoneReached", { n: result.lesson_milestone_reached }),
    );
  }

  if (result.level_upgraded && result.new_cefr_level) {
    highlights.push(t("path.levelUp", { level: result.new_cefr_level }));
  }

  return highlights;
}

/**
 * Compose shareable text for a completed lesson.
 */
export function buildLessonShareText({
  sectionTitle,
  correct,
  total,
  stars,
  result,
  perfectLesson,
  t,
}) {
  if (!t) return "";

  const title = String(sectionTitle ?? "").trim() || t("path.shareLessonDefaultTitle");
  const lines = [
    t("path.shareLessonIntro", { title }),
    t("path.shareLessonScore", { correct, total, stars }),
    ...buildLessonShareHighlights({ result, perfectLesson, t }),
    t("profile.shareProgressFooter"),
  ];

  return lines.join("\n");
}

export function shouldShowLessonShare(result) {
  return Boolean(result?.passed);
}

export async function shareLessonResult({
  sectionTitle,
  correct,
  total,
  stars,
  result,
  perfectLesson,
  t,
  nativeShareText,
  showShareStatus,
  navigatorRef = typeof navigator === "undefined" ? null : navigator,
  windowRef = typeof window === "undefined" ? null : window,
  documentRef = typeof document === "undefined" ? null : document,
  copy = copyToClipboard,
}) {
  const text = buildLessonShareText({
    sectionTitle,
    correct,
    total,
    stars,
    result,
    perfectLesson,
    t,
  });

  if (!text.trim()) {
    showShareStatus?.(t("profile.shareFail"));
    return false;
  }

  try {
    try {
      await nativeShareText(text);
      return true;
    } catch (_) {
      // Fall through to compatibility/web fallbacks.
    }

    if (windowRef?.__amigaShare && typeof windowRef.__amigaShare.shareText === "function") {
      windowRef.__amigaShare.shareText(text);
      return true;
    }

    if (typeof navigatorRef?.share === "function") {
      try {
        await navigatorRef.share({
          title: t("path.shareLessonTitle"),
          text,
        });
        return true;
      } catch (error) {
        if (error && error.name === "AbortError") return true;
      }
    }

    if (await copy(text, { navigatorRef, documentRef })) {
      showShareStatus(t("profile.shareCopied"));
    } else {
      showShareStatus(t("profile.shareFail"));
    }
  } catch (error) {
    console.error("Share lesson failed:", error);
    showShareStatus(t("profile.shareFail"));
  }
  return true;
}