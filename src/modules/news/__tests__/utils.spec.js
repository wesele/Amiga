import { describe, it, expect, vi, beforeEach } from "vitest";
import { openSourceUrl } from "../utils.js";

vi.mock("@tauri-apps/plugin-shell");

describe("openSourceUrl", () => {
  let openMock;

  beforeEach(async () => {
    vi.clearAllMocks();
    const shell = await import("@tauri-apps/plugin-shell");
    openMock = shell.open;
  });

  it("calls open with the url", async () => {
    openMock.mockResolvedValue();
    openSourceUrl("https://example.com/news");
    await vi.waitFor(() => {
      expect(openMock).toHaveBeenCalledWith("https://example.com/news");
    });
  });

  it("adds https:// prefix when url has no scheme", async () => {
    openMock.mockResolvedValue();
    openSourceUrl("example.com/news");
    await vi.waitFor(() => {
      expect(openMock).toHaveBeenCalledWith("https://example.com/news");
    });
  });

  it("preserves http:// scheme", async () => {
    openMock.mockResolvedValue();
    openSourceUrl("http://example.com");
    await vi.waitFor(() => {
      expect(openMock).toHaveBeenCalledWith("http://example.com");
    });
  });

  it("falls back to window.open when open() rejects", async () => {
    openMock.mockRejectedValue(new Error("denied"));
    let fallbackUrl = "";
    const orig = window.open;
    window.open = (u) => { fallbackUrl = u; };
    openSourceUrl("https://test.com");
    await vi.waitFor(() => {
      expect(fallbackUrl).toBe("https://test.com");
    });
    window.open = orig;
  });

  it("does nothing for empty url", () => {
    openSourceUrl("");
    expect(openMock).not.toHaveBeenCalled();
  });

  it("does nothing for null url", () => {
    openSourceUrl(null);
    expect(openMock).not.toHaveBeenCalled();
  });
});