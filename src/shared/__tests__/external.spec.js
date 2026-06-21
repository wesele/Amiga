import { describe, it, expect, vi, beforeEach } from "vitest";
import { open } from "@tauri-apps/plugin-shell";
import {
  normalizeExternalUrl,
  isSafeExternalUrl,
  openExternalUrl,
} from "@/shared/external.js";

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));

describe("normalizeExternalUrl", () => {
  it("returns null for null / undefined / empty / whitespace", () => {
    expect(normalizeExternalUrl(null)).toBeNull();
    expect(normalizeExternalUrl(undefined)).toBeNull();
    expect(normalizeExternalUrl("")).toBeNull();
    expect(normalizeExternalUrl("   ")).toBeNull();
  });

  it("adds https:// when scheme is missing", () => {
    expect(normalizeExternalUrl("example.com")).toBe("https://example.com");
    expect(normalizeExternalUrl("feeds.bbc.co.uk/path")).toBe(
      "https://feeds.bbc.co.uk/path",
    );
  });

  it("preserves http://", () => {
    expect(normalizeExternalUrl("http://example.com")).toBe(
      "http://example.com",
    );
  });

  it("preserves https://", () => {
    expect(normalizeExternalUrl("https://example.com/foo?x=1")).toBe(
      "https://example.com/foo?x=1",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeExternalUrl("  https://example.com  ")).toBe(
      "https://example.com",
    );
  });

  it("rejects non-http(s) schemes instead of prepending https://", () => {
    expect(normalizeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeExternalUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeExternalUrl("data:text/html,<x>")).toBeNull();
    expect(normalizeExternalUrl("ftp://example.com")).toBeNull();
  });

  it("coerces non-string values to string", () => {
    expect(normalizeExternalUrl(123)).toBe("https://123");
  });
});

describe("isSafeExternalUrl", () => {
  it("accepts http / https", () => {
    expect(isSafeExternalUrl("http://a")).toBe(true);
    expect(isSafeExternalUrl("https://a")).toBe(true);
    expect(isSafeExternalUrl("  https://a  ")).toBe(true);
  });

  it("rejects javascript: / data: / file: / blob:", () => {
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("data:text/html,<script>")).toBe(false);
    expect(isSafeExternalUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeExternalUrl("blob:https://x/abc")).toBe(false);
  });

  it("rejects non-string and schemeless", () => {
    expect(isSafeExternalUrl("example.com")).toBe(false);
    expect(isSafeExternalUrl(null)).toBe(false);
    expect(isSafeExternalUrl(undefined)).toBe(false);
    expect(isSafeExternalUrl("")).toBe(false);
  });
});

describe("openExternalUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls tauri open with a normalized https URL", async () => {
    open.mockResolvedValue();
    await openExternalUrl("example.com/foo");
    expect(open).toHaveBeenCalledWith("https://example.com/foo");
  });

  it("preserves http / https scheme", async () => {
    open.mockResolvedValue();
    await openExternalUrl("http://example.com");
    expect(open).toHaveBeenCalledWith("http://example.com");
    await openExternalUrl("https://example.com");
    expect(open).toHaveBeenCalledWith("https://example.com");
  });

  it("does nothing for empty / null URL", async () => {
    await openExternalUrl("");
    await openExternalUrl(null);
    await openExternalUrl(undefined);
    expect(open).not.toHaveBeenCalled();
  });

  it("refuses non-http(s) schemes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await openExternalUrl("javascript:alert(1)");
    await openExternalUrl("file:///etc/passwd");
    await openExternalUrl("data:text/html,x");
    expect(open).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("falls back to window.open when tauri open rejects", async () => {
    open.mockRejectedValue(new Error("denied"));
    const orig = window.open;
    let captured = "";
    let capturedFeatures = "";
    window.open = (u, t, f) => {
      captured = u;
      capturedFeatures = f || "";
      return null;
    };
    await openExternalUrl("https://fallback.test/x");
    expect(captured).toBe("https://fallback.test/x");
    expect(capturedFeatures).toContain("noopener");
    window.open = orig;
  });

  it("does not throw when both tauri open and window.open fail", async () => {
    open.mockRejectedValue(new Error("denied"));
    const orig = window.open;
    window.open = () => {
      throw new Error("blocked");
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(openExternalUrl("https://x.test")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    window.open = orig;
  });
});
