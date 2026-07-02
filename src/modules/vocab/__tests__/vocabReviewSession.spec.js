import { describe, expect, it } from "vitest";
import {
  REVIEW_SESSION_LIMIT,
  countNewWords,
  countReinforcementWords,
  isSessionComplete,
  sessionProgress,
  sessionProgressPct,
  vocabDefinition,
} from "../vocabReviewSession.js";

describe("vocabReviewSession", () => {
  const words = [
    { id: 1, word: "hola", mastery: 1, definition_zh: "你好", definition_es: "saludo" },
    { id: 2, word: "casa", mastery: null, definition_zh: "房子", definition_es: "vivienda" },
    { id: 3, word: "perro", mastery: 1, definition_zh: "狗" },
  ];

  it("exports session limit aligned with learn hub card", () => {
    expect(REVIEW_SESSION_LIMIT).toBe(5);
  });

  it("vocabDefinition prefers native-language field with fallback", () => {
    expect(vocabDefinition(words[0], "zh")).toBe("你好");
    expect(vocabDefinition(words[0], "es")).toBe("saludo");
    expect(vocabDefinition(words[2], "es")).toBe("狗");
    expect(vocabDefinition(null, "zh")).toBe("");
  });

  it("sessionProgress reports 1-based current index", () => {
    expect(sessionProgress(0, 5)).toEqual({ current: 1, total: 5 });
    expect(sessionProgress(4, 5)).toEqual({ current: 5, total: 5 });
  });

  it("sessionProgressPct tracks completion percentage", () => {
    expect(sessionProgressPct(0, 4)).toBe(25);
    expect(sessionProgressPct(3, 4)).toBe(100);
    expect(sessionProgressPct(0, 0)).toBe(0);
  });

  it("isSessionComplete is true only after the last card", () => {
    expect(isSessionComplete(4, 5)).toBe(false);
    expect(isSessionComplete(5, 5)).toBe(true);
    expect(isSessionComplete(0, 0)).toBe(false);
  });

  it("countReinforcementWords and countNewWords split the queue", () => {
    expect(countReinforcementWords(words)).toBe(2);
    expect(countNewWords(words)).toBe(1);
    expect(countReinforcementWords([])).toBe(0);
  });
});