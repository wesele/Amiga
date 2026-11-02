// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  MAX_MODEL_LABEL_CHARS,
  normalizeModelName,
  resolveActiveModelName,
  truncateModelLabel,
} from "../llmModelLabel.js";

describe("resolveActiveModelName", () => {
  it("picks builtin.model when mode is builtin", () => {
    const config = {
      mode: "builtin",
      builtin: { model: "nvidia/nemotron-3-nano" },
      primary: { model: "gpt-4o-mini" },
    };
    expect(resolveActiveModelName(config)).toBe("nvidia/nemotron-3-nano");
  });

  it("picks primary.model for custom mode", () => {
    const config = {
      mode: "custom",
      builtin: { model: "nvidia/nemotron-3-nano" },
      primary: { model: "gpt-4o-mini" },
    };
    expect(resolveActiveModelName(config)).toBe("gpt-4o-mini");
  });

  it("falls back to primary when mode is missing", () => {
    expect(resolveActiveModelName({ primary: { model: "deepseek-chat" } })).toBe("deepseek-chat");
  });

  it("returns an empty string for missing config or model", () => {
    expect(resolveActiveModelName(null)).toBe("");
    expect(resolveActiveModelName(undefined)).toBe("");
    expect(resolveActiveModelName({})).toBe("");
    expect(resolveActiveModelName({ mode: "builtin" })).toBe("");
    expect(resolveActiveModelName({ mode: "custom", primary: { model: "   " } })).toBe("");
  });
});

describe("normalizeModelName", () => {
  it("collapses whitespace and newlines", () => {
    expect(normalizeModelName("  gpt-4o \n mini  ")).toBe("gpt-4o mini");
  });

  it("handles non-string input", () => {
    expect(normalizeModelName(null)).toBe("");
    expect(normalizeModelName(undefined)).toBe("");
    expect(normalizeModelName(42)).toBe("42");
  });
});

describe("truncateModelLabel", () => {
  it("keeps names at or below the limit untouched", () => {
    const exact = "a".repeat(MAX_MODEL_LABEL_CHARS);
    expect(truncateModelLabel(exact)).toBe(exact);
    expect(truncateModelLabel("gpt-4o-mini")).toBe("gpt-4o-mini");
  });

  it("truncates with an ellipsis without exceeding the limit", () => {
    const long = "nvidia/nemotron-3-nano-omni-30b";
    const label = truncateModelLabel(long);
    expect(label.endsWith("…")).toBe(true);
    expect(Array.from(label)).toHaveLength(MAX_MODEL_LABEL_CHARS);
    expect(label).toBe("nvidia/nemotron-3-n…");
  });

  it("counts code points instead of UTF-16 units", () => {
    const label = truncateModelLabel("模型".repeat(20));
    expect(Array.from(label)).toHaveLength(MAX_MODEL_LABEL_CHARS);
  });

  it("respects a custom limit", () => {
    expect(truncateModelLabel("abcdefgh", 5)).toBe("abcd…");
    expect(truncateModelLabel("abc", 5)).toBe("abc");
  });

  it("returns an empty string for empty input", () => {
    expect(truncateModelLabel("")).toBe("");
    expect(truncateModelLabel(null)).toBe("");
    expect(truncateModelLabel("   ")).toBe("");
  });
});
