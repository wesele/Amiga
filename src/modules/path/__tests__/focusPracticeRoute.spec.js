import { describe, expect, it } from "vitest";
import { focusPracticeRoute, isValidFocusType } from "../focusPracticeRoute.js";

describe("focusPracticeRoute", () => {
  it("accepts tracked question types", () => {
    expect(isValidFocusType("T09")).toBe(true);
    expect(isValidFocusType("T99")).toBe(false);
  });

  it("builds the focus practice route", () => {
    expect(focusPracticeRoute("T05")).toEqual({
      name: "path-focus-practice",
      params: { typeId: "T05" },
    });
  });
});