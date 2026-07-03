import { shouldShowPendingPracticeHero } from "@/modules/ai-chat/pendingAiPractice.js";
import { dailyGoalRemainingLessons } from "@/modules/learn/dailyGoalDisplay.js";
import { canResumeSection } from "@/modules/learn/pathResume.js";
import { isStreakAtRisk } from "@/modules/learn/streakAtRisk.js";
import { shouldShowPendingVocabBanner } from "@/modules/news/pendingReadingVocab.js";
import { isContinueReadingCandidate } from "@/modules/news/readingProgress.js";

export const NAV_BADGE_MAX = 9;

/** @typedef {import('@/modules/ai-chat/pendingAiPractice.js').PendingAiPractice} PendingAiPractice */

/**
 * @typedef {object} NavAttentionContext
 * @property {object | null} [dailyGoal]
 * @property {{ section: object } | null} [resumeTarget]
 * @property {number} [dueMistakes]
 * @property {number} [dueVocabCount]
 * @property {number} [newsUnreadCount]
 * @property {object | null} [continueReadingArticle]
 * @property {object | null} [pendingVocab]
 * @property {PendingAiPractice | null} [pendingAiPractice]
 * @property {number} [localHour]
 */

export function formatBadgeCount(count, max = NAV_BADGE_MAX) {
  if (count <= 0) return "";
  if (count > max) return `${max}+`;
  return String(count);
}

function learnAttentionItems(ctx) {
  const {
    dailyGoal = null,
    dueMistakes = 0,
    dueVocabCount = 0,
    pendingVocab = null,
    continueReadingArticle = null,
    localHour = new Date().getHours(),
  } = ctx;
  const items = [];

  if (
    isStreakAtRisk({
      streakCurrent: dailyGoal?.streak_current,
      practicedToday: dailyGoal?.practiced_today,
      localHour,
    })
  ) {
    items.push({ priority: 0, kind: "streakAtRisk", urgent: true });
  }

  if (dailyGoalRemainingLessons(dailyGoal) > 0) {
    items.push({ priority: 1, kind: "dailyGoal" });
  }

  if (dueMistakes > 0) {
    items.push({ priority: 2, kind: "mistakes" });
  }

  if (dueVocabCount > 0) {
    items.push({ priority: 3, kind: "vocab" });
  }

  if (shouldShowPendingVocabBanner(pendingVocab)) {
    items.push({ priority: 4, kind: "pendingVocab" });
  }

  if (isContinueReadingCandidate(continueReadingArticle)) {
    items.push({ priority: 5, kind: "continueReading" });
  }

  return items;
}

/** @param {NavAttentionContext} ctx */
export function computeLearnNavBadge(ctx) {
  const items = learnAttentionItems(ctx);
  if (!items.length) {
    return { show: false, count: 0, urgent: false, kind: null };
  }

  const sorted = [...items].sort((a, b) => a.priority - b.priority);
  return {
    show: true,
    count: items.length,
    urgent: sorted.some((item) => item.urgent),
    kind: sorted[0].kind,
  };
}

/**
 * @param {NavAttentionContext} ctx
 * @param {{ activeTab?: string | null }} [options]
 */
export function computeNavBadges(ctx, { activeTab = null } = {}) {
  const learn = computeLearnNavBadge(ctx);
  const chatShow = shouldShowPendingPracticeHero(ctx.pendingAiPractice);

  return {
    learn: activeTab === "learn" ? { ...learn, show: false } : learn,
    chat: {
      show: activeTab === "chat" ? false : chatShow,
      count: 0,
      dotOnly: true,
    },
    achievements: { show: false, count: 0 },
    profile: { show: false, count: 0 },
  };
}

/** @param {NavAttentionContext} ctx */
export function computeModuleBadges(ctx) {
  const {
    dailyGoal = null,
    resumeTarget = null,
    dueVocabCount = 0,
    pendingVocab = null,
    newsUnreadCount = 0,
  } = ctx;

  let path = { show: false, count: 0, labelKey: "", labelParams: {} };
  const canResume = resumeTarget && canResumeSection(resumeTarget.section);
  const remaining = dailyGoalRemainingLessons(dailyGoal);

  if (canResume) {
    path = {
      show: true,
      count: 0,
      labelKey: "learn.pathResumeBadge",
      labelParams: {},
    };
  } else if (remaining > 0) {
    path = {
      show: true,
      count: remaining,
      labelKey: "learn.pathTodoBadge",
      labelParams: { n: remaining },
    };
  }

  let vocab = { show: false, count: 0, labelKey: "", labelParams: {} };
  if (dueVocabCount > 0) {
    vocab = {
      show: true,
      count: dueVocabCount,
      labelKey: "learn.vocabDueBadge",
      labelParams: { n: dueVocabCount },
    };
  } else if (shouldShowPendingVocabBanner(pendingVocab)) {
    const n = pendingVocab.entries?.length ?? 0;
    vocab = {
      show: true,
      count: n,
      labelKey: "learn.vocabDueBadge",
      labelParams: { n },
    };
  }

  const news = {
    show: newsUnreadCount > 0,
    count: newsUnreadCount,
    labelKey: "learn.newsUnreadBadge",
    labelParams: { n: newsUnreadCount },
  };

  return { path, news, vocab };
}