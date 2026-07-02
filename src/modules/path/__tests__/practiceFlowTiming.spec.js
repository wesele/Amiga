import { describe, expect, it } from "vitest";
import {
  COMBO_MILESTONE_AUTO_ADVANCE_MS,
  COMBO_PERSONAL_BEST_AUTO_ADVANCE_MS,
  CORRECT_AUTO_ADVANCE_MS,
  correctAutoAdvanceDelayMs,
} from "../practiceFlowTiming.js";

describe("practiceFlowTiming", () => {
  it("uses the default delay for ordinary correct answers", () => {
    expect(correctAutoAdvanceDelayMs()).toBe(CORRECT_AUTO_ADVANCE_MS);
    expect(correctAutoAdvanceDelayMs({ comboToast: "" })).toBe(CORRECT_AUTO_ADVANCE_MS);
  });

  it("extends the delay when combo milestones or personal bests appear", () => {
    expect(
      correctAutoAdvanceDelayMs({ comboToast: "🔥 5 连击！" }),
    ).toBe(COMBO_MILESTONE_AUTO_ADVANCE_MS);
    expect(
      correctAutoAdvanceDelayMs({
        comboToast: "🔥 5 连击！",
        comboPersonalBestToast: "新纪录！",
      }),
    ).toBe(COMBO_PERSONAL_BEST_AUTO_ADVANCE_MS);
  });
});