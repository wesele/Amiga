import { describe, it, expect } from "vitest";
import {
  isRewriteLevelStale,
  rewriteLevelBadge,
  shouldOfferRewriteRefresh,
} from "../rewriteLevelMatch.js";

describe("rewriteLevelMatch", () => {
  it("isRewriteLevelStale compares levels case-insensitively", () => {
    expect(isRewriteLevelStale("A2", "B1")).toBe(true);
    expect(isRewriteLevelStale("b1", "B1")).toBe(false);
    expect(isRewriteLevelStale(null, "A1")).toBe(false);
    expect(isRewriteLevelStale("A1", null)).toBe(false);
  });

  it("rewriteLevelBadge hides for unrewritten articles", () => {
    expect(rewriteLevelBadge({ rewritten_body: null }, "A2")).toEqual({ show: false });
    expect(rewriteLevelBadge({ rewritten_body: "text" }, "A2")).toEqual({
      show: true,
      level: null,
      stale: false,
    });
    expect(
      rewriteLevelBadge({ rewritten_body: "text", rewrite_level: "a2" }, "A2"),
    ).toEqual({
      show: true,
      level: "A2",
      stale: false,
    });
    expect(
      rewriteLevelBadge({ rewritten_body: "text", rewrite_level: "A2" }, "B1"),
    ).toEqual({
      show: true,
      level: "A2",
      stale: true,
    });
  });

  it("shouldOfferRewriteRefresh only when rewritten and stale", () => {
    expect(shouldOfferRewriteRefresh(null, "A1")).toBe(false);
    expect(shouldOfferRewriteRefresh({ rewritten_body: "x" }, "A1")).toBe(false);
    expect(
      shouldOfferRewriteRefresh(
        { rewritten_body: "x", rewrite_level: "A2" },
        "B1",
      ),
    ).toBe(true);
    expect(
      shouldOfferRewriteRefresh(
        { rewritten_body: "x", rewrite_level: "B1" },
        "B1",
      ),
    ).toBe(false);
  });
});