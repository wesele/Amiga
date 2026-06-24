import { describe, it, expect, vi, beforeEach } from "vitest";
import { openSourceUrl, buildShareText } from "../utils.js";

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

describe("buildShareText", () => {
  it("assembles prompt + title + body + source in order, separated by blank lines", () => {
    const out = buildShareText({
      title: "El cambio climático",
      body: "El planeta se calienta.",
      source: "https://example.com/news/1",
      prompt: "Please help me discuss this article.",
      sourceLabel: "Source: ",
    });
    expect(out).toBe(
      "Please help me discuss this article.\n\n" +
      "El cambio climático\n\n" +
      "El planeta se calienta.\n\n" +
      "Source: https://example.com/news/1",
    );
  });

  it("strips trailing whitespace from the prompt so the next line is the title", () => {
    const out = buildShareText({
      title: "Title",
      body: "Body",
      source: "https://x.com",
      prompt: "I am learning.\n\n",
      sourceLabel: "Source: ",
    });
    // prompt is trimmed of trailing whitespace but internal newlines preserved
    expect(out.startsWith("I am learning.\n\nTitle")).toBe(true);
    expect(out.includes("I am learning.\n\n\nTitle")).toBe(false);
  });

  it("omits the source line when source is empty", () => {
    const out = buildShareText({
      title: "Title",
      body: "Body",
      source: "",
      prompt: "prompt",
      sourceLabel: "Source: ",
    });
    expect(out).toBe("prompt\n\nTitle\n\nBody");
    expect(out.includes("Source:")).toBe(false);
  });

  it("omits the source line when source is null/undefined", () => {
    expect(
      buildShareText({ title: "T", body: "B", source: null, prompt: "p", sourceLabel: "S: " }),
    ).toBe("p\n\nT\n\nB");
    expect(
      buildShareText({ title: "T", body: "B", source: undefined, prompt: "p", sourceLabel: "S: " }),
    ).toBe("p\n\nT\n\nB");
  });

  it("omits the body block when body is empty", () => {
    const out = buildShareText({
      title: "Title",
      body: "",
      source: "https://x.com",
      prompt: "prompt",
      sourceLabel: "S: ",
    });
    expect(out).toBe("prompt\n\nTitle\n\nS: https://x.com");
  });

  it("renders title and body as plain strings even when they contain Markdown-like characters", () => {
    const out = buildShareText({
      title: "**Breaking**: markets **up**",
      body: "Paragraph 1.\n\nParagraph 2.",
      source: "https://x.com",
      prompt: "p",
      sourceLabel: "S: ",
    });
    expect(out).toContain("**Breaking**: markets **up**");
    expect(out).toContain("Paragraph 1.\n\nParagraph 2.");
  });

  it("still emits prompt + title when both body and source are missing", () => {
    const out = buildShareText({
      title: "T",
      body: "",
      source: "",
      prompt: "p",
      sourceLabel: "S: ",
    });
    expect(out).toBe("p\n\nT");
  });
});