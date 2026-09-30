import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/shared/api.js";
import { __resetTtsBridgeForTests } from "@/shared/ttsBridge.js";
import {
  TTS_ENGINE_KOKORO,
  TTS_ENGINE_SETTING_KEY,
  TTS_ENGINE_SYSTEM,
  canChooseAndroidTtsEngine,
  chooseTtsEngine,
  loadTtsEngineSetting,
  normalizeTtsEngine,
  syncNativeTtsEngineFromSettings,
  ttsDownloadPercent,
} from "@/shared/ttsEngine.js";

describe("ttsEngine", () => {
  beforeEach(() => {
    api.__setInvoke(vi.fn(async () => null));
    delete window.__amigaTts;
    __resetTtsBridgeForTests();
  });

  afterEach(() => {
    delete window.__amigaTts;
    __resetTtsBridgeForTests();
  });

  it("normalizes unknown values to the system engine", () => {
    expect(normalizeTtsEngine("kokoro")).toBe(TTS_ENGINE_KOKORO);
    expect(normalizeTtsEngine("system")).toBe(TTS_ENGINE_SYSTEM);
    expect(normalizeTtsEngine("")).toBe(TTS_ENGINE_SYSTEM);
    expect(normalizeTtsEngine(null)).toBe(TTS_ENGINE_SYSTEM);
  });

  it("hides the picker unless the native setEngine bridge is present", () => {
    expect(canChooseAndroidTtsEngine()).toBe(false);
    window.__amigaTts = { speak: () => "ok" };
    expect(canChooseAndroidTtsEngine()).toBe(false);
    window.__amigaTts.setEngine = () => "{}";
    expect(canChooseAndroidTtsEngine()).toBe(true);
  });

  it("loads a saved engine and ignores invalid values", async () => {
    api.__setInvoke(vi.fn(async (cmd, args) => {
      if (cmd === "get_setting_cmd" && args?.key === TTS_ENGINE_SETTING_KEY) return "kokoro";
      return null;
    }));
    expect(await loadTtsEngineSetting()).toBe(TTS_ENGINE_KOKORO);

    api.__setInvoke(vi.fn(async () => "nope"));
    expect(await loadTtsEngineSetting()).toBe(TTS_ENGINE_SYSTEM);
  });

  it("persists Kokoro and calls setEngine", async () => {
    const saved = [];
    window.__amigaTts = {
      speak: () => "ok",
      setEngine: vi.fn(() =>
        JSON.stringify({ engine: "kokoro", ready: false, downloading: true, supported: true }),
      ),
    };
    api.__setInvoke(vi.fn(async (cmd, args) => {
      if (cmd === "save_setting_cmd") saved.push(args);
      return null;
    }));

    const status = await chooseTtsEngine("kokoro");
    expect(saved).toEqual([{ key: TTS_ENGINE_SETTING_KEY, value: "kokoro" }]);
    expect(window.__amigaTts.setEngine).toHaveBeenCalledWith("kokoro");
    expect(status).toMatchObject({ engine: "kokoro", downloading: true, supported: true });
  });

  it("reverts the saved engine when Kokoro is unsupported", async () => {
    const saved = [];
    window.__amigaTts = {
      speak: () => "ok",
      setEngine: vi.fn(() =>
        JSON.stringify({ engine: "kokoro", ready: false, downloading: false, supported: false }),
      ),
    };
    api.__setInvoke(vi.fn(async (cmd, args) => {
      if (cmd === "save_setting_cmd") saved.push(args?.value);
      return null;
    }));

    const status = await chooseTtsEngine("kokoro");
    expect(saved).toEqual(["kokoro", "system"]);
    expect(status).toMatchObject({ engine: TTS_ENGINE_SYSTEM, supported: false, reverted: true });
  });

  it("restores the saved engine on launch", async () => {
    window.__amigaTts = {
      speak: () => "ok",
      setEngine: vi.fn(() =>
        JSON.stringify({ engine: "kokoro", ready: true, downloading: false, supported: true }),
      ),
    };
    api.__setInvoke(vi.fn(async (cmd, args) => {
      if (cmd === "get_setting_cmd" && args?.key === TTS_ENGINE_SETTING_KEY) return "kokoro";
      return null;
    }));

    const status = await syncNativeTtsEngineFromSettings();
    expect(window.__amigaTts.setEngine).toHaveBeenCalledWith("kokoro");
    expect(status.engine).toBe("kokoro");
  });

  it("clamps download percent to 0–100", () => {
    expect(ttsDownloadPercent({ bytes: 50, totalBytes: 100 })).toBe(50);
    expect(ttsDownloadPercent({ bytes: 0, totalBytes: 0 })).toBe(0);
    expect(ttsDownloadPercent({ bytes: 200, totalBytes: 100 })).toBe(100);
    expect(ttsDownloadPercent(null)).toBe(0);
  });
});
