import { describe, it, expect, vi } from "vitest";
import { buildProgressShareText, shareLearningProgress } from "../shareProgress.js";

const t = (key, params = {}) => {
  const templates = {
    "profile.shareProgressIntro":
      "🔥 {name} is on a {streak}-day streak learning {lang} ({level}) on Amiga!",
    "profile.shareProgressIntroNoGoal":
      "🔥 {name} is on a {streak}-day streak on Amiga!",
    "profile.shareProgressStats": "📚 {words} words mastered · {articles} articles read",
    "profile.shareProgressAccuracy": "🎯 {pct}% practice accuracy",
    "profile.shareProgressLongest": "🏆 Longest streak: {n} days",
    "profile.shareProgressFooter": "Join me — Amiga, learn languages, connect worlds",
    "profile.shareProgressTitle": "My Amiga progress",
    "profile.shareCopied": "Copied to clipboard",
    "profile.shareFail": "Share failed",
  };
  let out = templates[key] || key;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return out;
};

describe("buildProgressShareText", () => {
  it("includes language, level, streak, and stats", () => {
    const text = buildProgressShareText({
      nickname: "Hao",
      targetLangLabel: "Spanish",
      level: "A1",
      streakCurrent: 5,
      streakLongest: 7,
      wordsKnown: 42,
      articlesRead: 3,
      t,
    });
    expect(text).toContain("Hao");
    expect(text).toContain("Spanish");
    expect(text).toContain("A1");
    expect(text).toContain("5-day streak");
    expect(text).toContain("42 words");
    expect(text).toContain("3 articles");
    expect(text).toContain("Longest streak: 7");
    expect(text).toContain("Join me");
  });

  it("omits longest streak line when not greater than current", () => {
    const text = buildProgressShareText({
      nickname: "Hao",
      targetLangLabel: "Spanish",
      level: "A1",
      streakCurrent: 5,
      streakLongest: 5,
      wordsKnown: 0,
      articlesRead: 0,
      t,
    });
    expect(text).not.toContain("Longest streak");
  });

  it("includes practice accuracy when enough lesson data exists", () => {
    const text = buildProgressShareText({
      nickname: "Hao",
      targetLangLabel: "Spanish",
      level: "A1",
      streakCurrent: 5,
      streakLongest: 5,
      wordsKnown: 42,
      articlesRead: 3,
      practiceAccuracyPct: 82,
      t,
    });
    expect(text).toContain("82% practice accuracy");
  });

  it("omits practice accuracy when not available", () => {
    const text = buildProgressShareText({
      nickname: "Hao",
      targetLangLabel: "Spanish",
      level: "A1",
      streakCurrent: 5,
      streakLongest: 5,
      wordsKnown: 42,
      articlesRead: 3,
      t,
    });
    expect(text).not.toContain("practice accuracy");
  });

  it("uses no-goal intro when language is missing", () => {
    const text = buildProgressShareText({
      nickname: "Hao",
      targetLangLabel: "",
      level: "",
      streakCurrent: 2,
      streakLongest: 2,
      wordsKnown: 10,
      articlesRead: 1,
      t,
    });
    expect(text).toContain("2-day streak on Amiga");
    expect(text).not.toContain("Spanish");
  });
});

describe("shareLearningProgress", () => {
  it("uses native share when available", async () => {
    const nativeShareText = vi.fn().mockResolvedValue(undefined);
    const showShareStatus = vi.fn();
    await shareLearningProgress({
      nickname: "Hao",
      targetLangLabel: "Spanish",
      level: "A1",
      streakCurrent: 3,
      streakLongest: 3,
      wordsKnown: 5,
      articlesRead: 1,
      t,
      nativeShareText,
      showShareStatus,
    });
    expect(nativeShareText).toHaveBeenCalledOnce();
    expect(showShareStatus).not.toHaveBeenCalled();
  });

  it("falls back to clipboard copy", async () => {
    const nativeShareText = vi.fn().mockRejectedValue(new Error("no native"));
    const showShareStatus = vi.fn();
    const copy = vi.fn().mockResolvedValue(true);
    await shareLearningProgress({
      nickname: "Hao",
      targetLangLabel: "Spanish",
      level: "A1",
      streakCurrent: 3,
      streakLongest: 3,
      wordsKnown: 5,
      articlesRead: 1,
      t,
      nativeShareText,
      showShareStatus,
      navigatorRef: {},
      copy,
    });
    expect(copy).toHaveBeenCalledOnce();
    expect(showShareStatus).toHaveBeenCalledWith("Copied to clipboard");
  });

  it("shows failure toast when clipboard copy fails", async () => {
    const showShareStatus = vi.fn();
    await shareLearningProgress({
      nickname: "Hao",
      targetLangLabel: "Spanish",
      level: "A1",
      streakCurrent: 0,
      streakLongest: 0,
      wordsKnown: 0,
      articlesRead: 0,
      t,
      nativeShareText: vi.fn().mockRejectedValue(new Error("no native")),
      showShareStatus,
      navigatorRef: {},
      copy: vi.fn().mockResolvedValue(false),
    });
    expect(showShareStatus).toHaveBeenCalledWith("Share failed");
  });
});