import { describe, expect, it } from "vitest";
import {
  WEAK_AREA_GRADUATION_PCT,
  focusPracticeProgressSummary,
  pickPostGraduationTypeId,
  resolveFocusSummaryCtas,
  shouldCelebrateGraduation,
  snapshotTypeAccuracy,
  weakAreaGraduationProgress,
} from "../focusPracticeProgress.js";

describe("focusPracticeProgress", () => {
  it("snapshots cumulative accuracy for a question type", () => {
    expect(snapshotTypeAccuracy({ T09: { correct: 29, wrong: 21 } }, "T09")).toBe(58);
    expect(snapshotTypeAccuracy({}, "T09")).toBe(100);
    expect(snapshotTypeAccuracy(null, "T09")).toBe(100);
  });

  it("summarizes positive, neutral, and negative deltas", () => {
    expect(
      focusPracticeProgressSummary({ beforePct: 58, afterPct: 63 }),
    ).toMatchObject({
      delta: 5,
      graduated: false,
      progressPct: 84,
      remainingPct: 12,
      graduationPct: WEAK_AREA_GRADUATION_PCT,
    });

    expect(
      focusPracticeProgressSummary({ beforePct: 63, afterPct: 63 }),
    ).toMatchObject({
      delta: 0,
      graduated: false,
      remainingPct: 12,
    });

    expect(
      focusPracticeProgressSummary({ beforePct: 70, afterPct: 68 }),
    ).toMatchObject({
      delta: -2,
      graduated: false,
      remainingPct: 7,
    });
  });

  it("treats exactly 75% as not graduated and above 75% as graduated", () => {
    expect(
      focusPracticeProgressSummary({ beforePct: 70, afterPct: 75 }).graduated,
    ).toBe(false);
    expect(
      focusPracticeProgressSummary({ beforePct: 70, afterPct: 76 }).graduated,
    ).toBe(true);
    expect(
      focusPracticeProgressSummary({ beforePct: 76, afterPct: 76 }).graduated,
    ).toBe(true);
  });

  it("computes graduation progress for weak-area cards", () => {
    expect(weakAreaGraduationProgress(58)).toMatchObject({
      graduated: false,
      progressPct: 77,
      remainingPct: 17,
    });
    expect(weakAreaGraduationProgress(76)).toMatchObject({
      graduated: true,
      progressPct: 100,
      remainingPct: 0,
    });
  });

  it("picks the next weakest type after graduation", () => {
    const stats = {
      T09: { correct: 80, wrong: 0 },
      T03: { correct: 10, wrong: 10 },
      T05: { correct: 3, wrong: 7 },
    };

    expect(pickPostGraduationTypeId(stats, "T09")).toBe("T05");
    expect(pickPostGraduationTypeId(stats, "T05")).toBe("T03");
    expect(pickPostGraduationTypeId({ T09: { correct: 80, wrong: 0 } }, "T09")).toBe(
      null,
    );
  });

  it("celebrates only when crossing out of the weak band", () => {
    expect(
      shouldCelebrateGraduation(
        focusPracticeProgressSummary({ beforePct: 70, afterPct: 76 }),
      ),
    ).toBe(true);
    expect(
      shouldCelebrateGraduation(
        focusPracticeProgressSummary({ beforePct: 80, afterPct: 82 }),
      ),
    ).toBe(false);
  });

  it("resolves summary CTAs for graduation and continuation", () => {
    expect(
      resolveFocusSummaryCtas(
        focusPracticeProgressSummary({ beforePct: 58, afterPct: 76 }),
        { hasNextWeak: true, roundAccuracyPct: 90, questionCount: 10 },
      ),
    ).toEqual({ primary: "nextWeak", showContinueRound: false });

    expect(
      resolveFocusSummaryCtas(
        focusPracticeProgressSummary({ beforePct: 58, afterPct: 76 }),
        { hasNextWeak: false, roundAccuracyPct: 90, questionCount: 10 },
      ),
    ).toEqual({ primary: "back", showContinueRound: false });

    expect(
      resolveFocusSummaryCtas(
        focusPracticeProgressSummary({ beforePct: 58, afterPct: 63 }),
        { hasNextWeak: false, roundAccuracyPct: 80, questionCount: 10 },
      ),
    ).toEqual({ primary: "continue", showContinueRound: true });

    expect(
      resolveFocusSummaryCtas(
        focusPracticeProgressSummary({ beforePct: 58, afterPct: 63 }),
        { hasNextWeak: false, roundAccuracyPct: 100, questionCount: 10 },
      ),
    ).toEqual({ primary: "back", showContinueRound: false });
  });
});