import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canAutoInstallUpdate,
  isAndroidPlatform,
  pickPreferredUpdateAsset,
  startAppUpdate,
} from "@/shared/update.js";
import { openExternalUrl } from "@/shared/external.js";

vi.mock("@/shared/external.js", () => ({
  openExternalUrl: vi.fn(),
}));

const SAMPLE_UPDATE = {
  release_url: "https://github.com/wesele/Amiga/releases/tag/v0.3.99",
  download_urls: [
    { name: "Amiga-setup.exe", url: "https://example.com/Amiga-setup.exe" },
    { name: "Amiga-arm64.apk", url: "https://example.com/Amiga-arm64.apk" },
  ],
};

function setUserAgent(ua) {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: ua,
  });
}

describe("update helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete window.__amigaUpdater;
    setUserAgent("Mozilla/5.0");
  });

  it("prefers apk assets on Android", () => {
    setUserAgent("Mozilla/5.0 (Linux; Android 14)");
    expect(isAndroidPlatform()).toBe(true);
    expect(pickPreferredUpdateAsset(SAMPLE_UPDATE)?.name).toBe("Amiga-arm64.apk");
  });

  it("prefers installer assets on Windows", () => {
    setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    expect(pickPreferredUpdateAsset(SAMPLE_UPDATE)?.name).toBe("Amiga-setup.exe");
  });

  it("reports Android auto-install availability only when the native bridge exists", () => {
    setUserAgent("Mozilla/5.0 (Linux; Android 14)");
    expect(canAutoInstallUpdate(SAMPLE_UPDATE)).toBe(false);

    window.__amigaUpdater = { installApk: vi.fn() };
    expect(canAutoInstallUpdate(SAMPLE_UPDATE)).toBe(true);
  });

  it("uses the Android updater bridge for apk installs", async () => {
    setUserAgent("Mozilla/5.0 (Linux; Android 14)");
    const installApk = vi.fn();
    window.__amigaUpdater = { installApk };

    await startAppUpdate(SAMPLE_UPDATE);

    expect(installApk).toHaveBeenCalledWith(
      "https://example.com/Amiga-arm64.apk",
      "Amiga-arm64.apk",
    );
    expect(openExternalUrl).not.toHaveBeenCalled();
  });

  it("falls back to opening the preferred asset externally when auto-install is unavailable", async () => {
    setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

    await startAppUpdate(SAMPLE_UPDATE);

    expect(openExternalUrl).toHaveBeenCalledWith("https://example.com/Amiga-setup.exe");
  });
});
