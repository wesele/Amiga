import { copyToClipboard } from "../news/share.js";

/**
 * Compose shareable text summarizing the learner's progress.
 * Used by ProfilePage and covered by unit tests.
 */
export function buildProgressShareText({
  nickname,
  targetLangLabel,
  level,
  streakCurrent = 0,
  streakLongest = 0,
  wordsKnown = 0,
  articlesRead = 0,
  t,
}) {
  if (!t) return "";

  const lines = [];

  if (targetLangLabel && level) {
    lines.push(
      t("profile.shareProgressIntro", {
        name: nickname,
        lang: targetLangLabel,
        level,
        streak: streakCurrent,
      }),
    );
  } else {
    lines.push(
      t("profile.shareProgressIntroNoGoal", {
        name: nickname,
        streak: streakCurrent,
      }),
    );
  }

  lines.push(
    t("profile.shareProgressStats", {
      words: wordsKnown,
      articles: articlesRead,
    }),
  );

  if (streakLongest > streakCurrent) {
    lines.push(t("profile.shareProgressLongest", { n: streakLongest }));
  }

  lines.push(t("profile.shareProgressFooter"));
  return lines.join("\n");
}

export async function shareLearningProgress({
  nickname,
  targetLangLabel,
  level,
  streakCurrent,
  streakLongest,
  wordsKnown,
  articlesRead,
  t,
  nativeShareText,
  showShareStatus,
  navigatorRef = typeof navigator === "undefined" ? null : navigator,
  windowRef = typeof window === "undefined" ? null : window,
  documentRef = typeof document === "undefined" ? null : document,
  copy = copyToClipboard,
}) {
  const text = buildProgressShareText({
    nickname,
    targetLangLabel,
    level,
    streakCurrent,
    streakLongest,
    wordsKnown,
    articlesRead,
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
          title: t("profile.shareProgressTitle"),
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
    console.error("Share progress failed:", error);
    showShareStatus(t("profile.shareFail"));
  }
  return true;
}