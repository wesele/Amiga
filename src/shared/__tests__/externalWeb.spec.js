import { beforeEach, describe, expect, it, vi } from "vitest";
import { open } from "@tauri-apps/plugin-shell";
import { showAlert } from "@/shared/alert.js";

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));

vi.mock("@/shared/alert.js", () => ({
  showAlert: vi.fn(),
}));

vi.mock("@/shared/appMode.js", () => ({
  isWebMode: true,
}));

const { openExternalUrl } = await import("@/shared/external.js");

describe("openExternalUrl in the Web Demo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Mobile Safari/537.36",
    });
  });

  it("opens an external link in the browser even when the UA is Android", async () => {
    const browserOpen = vi.spyOn(window, "open").mockReturnValue({});

    await openExternalUrl("https://example.com/article");

    expect(browserOpen).toHaveBeenCalledWith(
      "https://example.com/article",
      "_blank",
      "noopener,noreferrer",
    );
    expect(open).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
    browserOpen.mockRestore();
  });
});
