import { describe, expect, it } from "vitest";
import {
  COMPREHENSION_VERIFY_STEP_ID,
  buildComprehensionRetakeVerifyStep,
  shouldOfferComprehensionRetakeVerify,
} from "../postComprehensionVerifyPlan.js";

describe("shouldOfferComprehensionRetakeVerify", () => {
  it("returns true for comprehension source with article id", () => {
    expect(
      shouldOfferComprehensionRetakeVerify({
        source: "comprehension",
        articleId: 7,
      }),
    ).toBe(true);
  });

  it("returns false without article id or wrong source", () => {
    expect(
      shouldOfferComprehensionRetakeVerify({
        source: "comprehension",
        articleId: null,
      }),
    ).toBe(false);
    expect(
      shouldOfferComprehensionRetakeVerify({
        source: "reading",
        articleId: 7,
      }),
    ).toBe(false);
    expect(
      shouldOfferComprehensionRetakeVerify({
        source: "comprehension",
        articleId: 7,
        comprehensionRetakePending: false,
      }),
    ).toBe(false);
  });
});

describe("buildComprehensionRetakeVerifyStep", () => {
  it("routes to reader retake mode with localized keys", () => {
    const step = buildComprehensionRetakeVerifyStep({
      articleId: 12,
      articleTitle: "Inflación en España",
      wrongCount: 2,
    });
    expect(step.id).toBe(COMPREHENSION_VERIFY_STEP_ID);
    expect(step.route).toEqual({
      name: "reader",
      params: { id: "12" },
      query: { comprehensionRetake: "1" },
    });
    expect(step.titleKey).toBe("chat.nextStep.comprehensionRetake");
    expect(step.titleParams).toEqual({ title: "Inflación en España" });
    expect(step.subtitleParams).toEqual({ n: 2 });
  });
});