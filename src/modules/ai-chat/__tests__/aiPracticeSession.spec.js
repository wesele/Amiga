import { describe, expect, it } from "vitest";
import {
  AI_PRACTICE_SOURCES,
  defaultExitRouteAfterPractice,
  isGuidedAiPractice,
  parsePracticeSource,
  parsePracticeWords,
  shouldShowPracticeWrapUp,
} from "../aiPracticeSession.js";

describe("aiPracticeSession", () => {
  it("detects guided practice from reviewed-words starter with words", () => {
    expect(
      isGuidedAiPractice({
        query: { starterId: "reviewed-words", words: "hola, adiós" },
      }),
    ).toBe(true);
    expect(isGuidedAiPractice({ query: { starterId: "reviewed-words" } })).toBe(false);
    expect(isGuidedAiPractice({ query: { words: "hola" } })).toBe(false);
    expect(isGuidedAiPractice({})).toBe(false);
  });

  it("parses practice words from comma-separated query", () => {
    expect(parsePracticeWords({ query: { words: " alpha , beta,  gamma " } })).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
    expect(parsePracticeWords({ query: {} })).toEqual([]);
  });

  it("parses known practice sources", () => {
    expect(parsePracticeSource({ query: { from: "reading" } })).toBe(
      AI_PRACTICE_SOURCES.READING,
    );
    expect(parsePracticeSource({ query: { from: "vocab" } })).toBe(AI_PRACTICE_SOURCES.VOCAB);
    expect(parsePracticeSource({ query: { from: "mistake" } })).toBe(
      AI_PRACTICE_SOURCES.MISTAKE,
    );
    expect(parsePracticeSource({ query: { from: "chat" } })).toBeNull();
  });

  it("requires interaction before showing wrap-up", () => {
    expect(shouldShowPracticeWrapUp({ userMessageCount: 0, usedStarter: false })).toBe(false);
    expect(shouldShowPracticeWrapUp({ userMessageCount: 1, usedStarter: false })).toBe(true);
    expect(shouldShowPracticeWrapUp({ userMessageCount: 0, usedStarter: true })).toBe(true);
  });

  it("maps exit routes by source and honors returnRoute", () => {
    expect(defaultExitRouteAfterPractice("reading")).toEqual({ name: "news" });
    expect(defaultExitRouteAfterPractice("vocab")).toEqual({ name: "learn" });
    expect(defaultExitRouteAfterPractice("mistake")).toEqual({ name: "path" });
    expect(defaultExitRouteAfterPractice(null)).toEqual({ name: "chat" });
    expect(
      defaultExitRouteAfterPractice("reading", { name: "reader", params: { id: 9 } }),
    ).toEqual({ name: "reader", params: { id: 9 } });
  });
});