import { describe, it, expect } from "vitest";
import {
  highlightWordInContext,
  isFromReadingSession,
  pickReviewContext,
} from "../vocabReviewContext.js";

describe("vocabReviewContext", () => {
  it("detects reading-session review route", () => {
    expect(isFromReadingSession({ query: { from: "reading" } })).toBe(true);
    expect(isFromReadingSession({ query: {} })).toBe(false);
  });

  it("prefers session context over stored example", () => {
    const map = new Map([["frontera", "La frontera norte es disputada."]]);
    expect(
      pickReviewContext(
        { word: "frontera", example: "Ejemplo del banco" },
        map,
      ),
    ).toBe("La frontera norte es disputada.");
  });

  it("falls back to example when session context is missing", () => {
    expect(
      pickReviewContext({ word: "asilo", example: "Pidió asilo político." }, new Map()),
    ).toBe("Pidió asilo político.");
  });

  it("highlights the target word case-insensitively", () => {
    const parts = highlightWordInContext(
      "La inmigración cambió la frontera.",
      "inmigración",
    );
    expect(parts).toEqual([
      { text: "La ", highlight: false },
      { text: "inmigración", highlight: true },
      { text: " cambió la frontera.", highlight: false },
    ]);
  });
});