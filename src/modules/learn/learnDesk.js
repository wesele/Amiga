export const PACE_OPTIONS = [
  {
    id: "slow",
    label: "慢一点",
    shortLabel: "轻量",
    dailyItems: 2,
    assessmentLevel: "gentle",
  },
  {
    id: "normal",
    label: "正常",
    shortLabel: "标准",
    dailyItems: 4,
    assessmentLevel: "normal",
  },
  {
    id: "challenge",
    label: "多挑战一点",
    shortLabel: "挑战",
    dailyItems: 6,
    assessmentLevel: "challenge",
  },
];

export const DEFAULT_PACE = "normal";
export const PACE_SETTING_KEY = "learn.study_pace";

export function normalizePace(value) {
  return PACE_OPTIONS.some((option) => option.id === value) ? value : DEFAULT_PACE;
}

export function paceMeta(value) {
  return PACE_OPTIONS.find((option) => option.id === normalizePace(value));
}

export async function loadStudyPace({ getSetting, storage = window?.localStorage } = {}) {
  try {
    const remote = await getSetting?.(PACE_SETTING_KEY);
    if (remote) {
      storage?.setItem(PACE_SETTING_KEY, remote);
      return normalizePace(remote);
    }
  } catch {
    // Browser dev and first-run Tauri can both fall back to local storage.
  }
  return normalizePace(storage?.getItem(PACE_SETTING_KEY));
}

export async function saveStudyPace(
  value,
  { saveSetting, storage = window?.localStorage } = {},
) {
  const normalized = normalizePace(value);
  storage?.setItem(PACE_SETTING_KEY, normalized);
  try {
    await saveSetting?.(PACE_SETTING_KEY, normalized);
  } catch {
    // Keep the local preference even if the shell API is unavailable.
  }
  return normalized;
}

export function buildNextSuggestion({ profile, pace = DEFAULT_PACE, hasRecentLesson = false } = {}) {
  const meta = paceMeta(pace);
  if (!profile) {
    return {
      title: "从晋级之路开始",
      detail: `${meta.shortLabel}节奏：先完成 1 个当前节点。`,
      actionLabel: "继续路径",
      route: { name: "path" },
    };
  }

  if ((profile.vocab_seen || 0) < 10) {
    return {
      title: "先补一点核心词",
      detail: `${meta.shortLabel}节奏：今天看 ${Math.min(meta.dailyItems, 3)} 组词，再读一小段真实材料。`,
      actionLabel: "去词汇",
      route: { name: "vocab" },
    };
  }

  if ((profile.articles_read || 0) === 0) {
    return {
      title: "用真实阅读热身",
      detail: "选一篇短新闻，遇到生词再收藏。",
      actionLabel: "真实阅读",
      route: { name: "news" },
    };
  }

  return {
    title: hasRecentLesson ? "接着当前路径走" : "完成一个当前节点",
    detail: `${meta.shortLabel}节奏：建议完成 ${meta.dailyItems <= 2 ? "1 个" : "1-2 个"}小任务。`,
    actionLabel: "继续路径",
    route: { name: "path" },
  };
}

export function dailyEntries({ pace = DEFAULT_PACE, reviewCount = 0 } = {}) {
  const meta = paceMeta(pace);
  const reviewLabel = reviewCount > 0
    ? `${reviewCount} 项到期`
    : (meta.dailyItems <= 2 ? "温习 3 分钟" : `温习 ${meta.dailyItems} 组`);
  return [
    {
      id: "path",
      title: "继续路径",
      desc: "回到当前 CEFR 节点",
      route: { name: "path" },
      primary: true,
    },
    {
      id: "review",
      title: "温习篮",
      desc: reviewLabel,
      route: { name: "review" },
    },
    {
      id: "assessment",
      title: "能力评测",
      desc: meta.assessmentLevel === "challenge" ? "12 题挑战" : "5 分钟轻测",
      route: { name: "assessment" },
    },
    {
      id: "amiga",
      title: "问 Amiga",
      desc: "带着问题练表达",
      action: "translator",
    },
    {
      id: "reading",
      title: "真实阅读",
      desc: "用新闻积累语感",
      route: { name: "news" },
    },
  ];
}
