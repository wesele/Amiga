import { describe, expect, it } from "vitest";
import {
  VOCAB_MILESTONES,
  VOCAB_MILESTONE_CELEBRATION_KEY,
  shouldShowVocabMilestone,
  vocabMilestoneProgress,
  vocabMilestoneReached,
  vocabMilestoneRingOffset,
} from "../vocabMilestones.js";

describe("vocabMilestones", () => {
  it("exposes the milestone ladder", () => {
    expect(VOCAB_MILESTONES).toEqual([100, 500, 1000]);
  });

  it("computes progress toward the next milestone", () => {
    expect(vocabMilestoneProgress(0)).toEqual({
      known: 0,
      next_milestone: 100,
      progress_pct: 0,
    });
    expect(vocabMilestoneProgress(50)).toEqual({
      known: 50,
      next_milestone: 100,
      progress_pct: 50,
    });
    expect(vocabMilestoneProgress(100)).toEqual({
      known: 100,
      next_milestone: 500,
      progress_pct: 0,
    });
    expect(vocabMilestoneProgress(1000)).toEqual({
      known: 1000,
      next_milestone: null,
      progress_pct: 100,
    });
  });

  it("shows the card only while a next milestone exists", () => {
    expect(shouldShowVocabMilestone({ known: 80, next_milestone: 100 })).toBe(true);
    expect(shouldShowVocabMilestone({ known: 1000, next_milestone: null })).toBe(false);
    expect(shouldShowVocabMilestone(null)).toBe(false);
  });

  it("detects when a milestone was just crossed", () => {
    expect(vocabMilestoneReached(95, 100)).toBe(100);
    expect(vocabMilestoneReached(100, 105)).toBe(null);
    expect(vocabMilestoneReached(490, 502)).toBe(500);
    expect(vocabMilestoneReached(502, 502)).toBe(null);
  });

  it("maps ring offset from progress_pct", () => {
    expect(vocabMilestoneRingOffset({ progress_pct: 0 })).toBeCloseTo(113.1);
    expect(vocabMilestoneRingOffset({ progress_pct: 50 })).toBeCloseTo(56.55, 1);
    expect(vocabMilestoneRingOffset({ progress_pct: 100 })).toBeCloseTo(0);
  });

  it("uses a single celebration i18n key", () => {
    expect(VOCAB_MILESTONE_CELEBRATION_KEY).toBe("vocab.vocabMilestoneReached");
  });
});