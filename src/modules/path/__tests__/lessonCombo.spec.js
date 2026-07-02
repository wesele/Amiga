import { describe, expect, it } from "vitest";
import {
  COMBO_BADGE_MIN,
  COMBO_MILESTONES,
  comboMilestoneKey,
  getComboMilestone,
  nextComboCount,
  showComboBadge,
} from "../lessonCombo.js";

describe("lessonCombo", () => {
  it("increments on correct answers and resets on wrong", () => {
    expect(nextComboCount(0, true)).toBe(1);
    expect(nextComboCount(2, true)).toBe(3);
    expect(nextComboCount(5, false)).toBe(0);
  });

  it("fires milestones only at exact combo thresholds", () => {
    for (const n of COMBO_MILESTONES) {
      expect(getComboMilestone(n)).toBe(n);
    }
    expect(getComboMilestone(1)).toBeNull();
    expect(getComboMilestone(4)).toBeNull();
    expect(getComboMilestone(0)).toBeNull();
  });

  it("maps milestone counts to i18n keys", () => {
    expect(comboMilestoneKey(3)).toBe("path.comboMilestone3");
    expect(comboMilestoneKey(10)).toBe("path.comboMilestone10");
  });

  it("shows the badge from the configured minimum combo", () => {
    expect(COMBO_BADGE_MIN).toBe(2);
    expect(showComboBadge(1)).toBe(false);
    expect(showComboBadge(2)).toBe(true);
    expect(showComboBadge(7)).toBe(true);
  });
});