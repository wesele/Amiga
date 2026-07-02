import { describe, expect, it } from "vitest";
import {
  LESSON_MILESTONES,
  LESSON_MILESTONE_CELEBRATION_KEY,
  lessonMilestoneRingOffset,
  shouldShowLessonMilestone,
} from "../lessonMilestones.js";

describe("lessonMilestones", () => {
  it("exposes the milestone ladder", () => {
    expect(LESSON_MILESTONES).toEqual([10, 25, 50, 100, 250, 500]);
  });

  it("shows the card only while a next milestone exists", () => {
    expect(shouldShowLessonMilestone({ completed: 3, next_milestone: 10 })).toBe(true);
    expect(shouldShowLessonMilestone({ completed: 500, next_milestone: null })).toBe(false);
    expect(shouldShowLessonMilestone(null)).toBe(false);
  });

  it("maps ring offset from backend progress_pct", () => {
    expect(lessonMilestoneRingOffset({ progress_pct: 0 })).toBeCloseTo(113.1);
    expect(lessonMilestoneRingOffset({ progress_pct: 50 })).toBeCloseTo(56.55, 1);
    expect(lessonMilestoneRingOffset({ progress_pct: 100 })).toBeCloseTo(0);
  });

  it("uses a single celebration i18n key", () => {
    expect(LESSON_MILESTONE_CELEBRATION_KEY).toBe("path.lessonMilestoneReached");
  });
});