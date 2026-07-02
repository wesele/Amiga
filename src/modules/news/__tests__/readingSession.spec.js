import { describe, it, expect, beforeEach } from "vitest";
import {
  saveReadingSessionSummary,
  peekReadingSessionSummary,
  consumeReadingSessionSummary,
} from "../readingSession.js";

describe("readingSession", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("stores and consumes unknown word count", () => {
    saveReadingSessionSummary({ unknownCount: 3 });
    expect(peekReadingSessionSummary()).toEqual(
      expect.objectContaining({ unknownCount: 3 }),
    );
    const consumed = consumeReadingSessionSummary();
    expect(consumed?.unknownCount).toBe(3);
    expect(peekReadingSessionSummary()).toBeNull();
  });

  it("ignores zero counts", () => {
    saveReadingSessionSummary({ unknownCount: 0 });
    expect(peekReadingSessionSummary()).toBeNull();
  });
});