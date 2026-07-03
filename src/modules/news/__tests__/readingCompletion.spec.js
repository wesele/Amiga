import { describe, expect, it } from "vitest";
import {
  formatReadingTime,
  isValidReading,
  MIN_READING_SEC,
  shouldShowCheckpointSummary,
} from "../readingCompletion.js";

describe("readingCompletion", () => {
  it("requires at least 30 seconds, word interaction, or lookups", () => {
    expect(MIN_READING_SEC).toBe(30);
    expect(isValidReading({ elapsedSec: 29 })).toBe(false);
    expect(isValidReading({ elapsedSec: 30 })).toBe(true);
    expect(isValidReading({ unknownCount: 1 })).toBe(true);
    expect(isValidReading({ knownCount: 1 })).toBe(true);
    expect(isValidReading({ lookedUpCount: 1 })).toBe(true);
    expect(isValidReading({})).toBe(false);
  });

  it("shows checkpoint only for meaningful partial sessions", () => {
    expect(shouldShowCheckpointSummary(40, { elapsedSec: 30 })).toBe(true);
    expect(shouldShowCheckpointSummary(40, { unknownCount: 2 })).toBe(true);
    expect(shouldShowCheckpointSummary(95, { elapsedSec: 60 })).toBe(false);
    expect(shouldShowCheckpointSummary(40, { elapsedSec: 10 })).toBe(false);
    expect(shouldShowCheckpointSummary(95, { elapsedSec: 60 }, true)).toBe(false);
  });

  it("formats reading time as mm:ss", () => {
    expect(formatReadingTime(0)).toBe("0:00");
    expect(formatReadingTime(65)).toBe("1:05");
    expect(formatReadingTime(125.4)).toBe("2:05");
  });
});