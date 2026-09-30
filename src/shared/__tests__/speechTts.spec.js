import { afterEach, describe, expect, it, vi } from "vitest";
import { getSpeechLang, speakText, stopSpeech } from "@/shared/speechTts.js";
import {
  __resetTtsBridgeForTests,
  getNativeTtsStatus,
  onNativeTtsProgress,
  setNativeTtsEngine,
  speakNativeTts,
} from "@/shared/ttsBridge.js";

describe("speechTts", () => {
  afterEach(() => {
    delete window.__amigaTts;
    delete window.__amigaTtsDone;
    delete window.__amigaTtsError;
    delete window.__amigaTtsProgress;
    __resetTtsBridgeForTests();
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  });

  it("maps short language codes to BCP-47 tags", () => {
    expect(getSpeechLang("es")).toBe("es-ES");
    expect(getSpeechLang("en")).toBe("en-US");
  });

  it("uses __amigaTtsDone for native TTS completion", () => {
    const onEnd = vi.fn();
    window.__amigaTts = { speak: vi.fn(() => "started") };

    speakText("Hola", "es", { onEnd });

    expect(typeof window.__amigaTtsDone).toBe("function");
    window.__amigaTtsDone();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("chains native TTS done callbacks", () => {
    const prevDone = vi.fn();
    const onEnd = vi.fn();
    window.__amigaTtsDone = prevDone;
    window.__amigaTts = { speak: vi.fn(() => "queued") };

    speakText("Hola", "es", { onEnd });
    window.__amigaTtsDone();

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(prevDone).toHaveBeenCalledTimes(1);
    expect(window.__amigaTtsDone).toBe(prevDone);
  });

  it("calls onEnd when native TTS is unavailable", () => {
    const onEnd = vi.fn();
    delete window.speechSynthesis;

    const ok = speakText("Hola", "es", { onEnd });

    expect(ok).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("stopSpeech delegates to native bridge when present", () => {
    window.__amigaTts = { stop: vi.fn() };
    stopSpeech();
    expect(window.__amigaTts.stop).toHaveBeenCalledTimes(1);
  });

  it("treats downloading as a successful native start", () => {
    window.__amigaTts = { speak: vi.fn(() => "downloading") };
    const result = speakNativeTts("Hola", "es-ES");
    expect(result.started).toBe(true);
    expect(result.result).toBe("downloading");
  });

  it("forwards native progress JSON to listeners", () => {
    const listener = vi.fn();
    window.__amigaTts = { speak: vi.fn(() => "ok") };
    const off = onNativeTtsProgress(listener);
    window.__amigaTtsProgress('{"state":"downloading","bytes":10,"totalBytes":100}');
    expect(listener).toHaveBeenCalledWith({ state: "downloading", bytes: 10, totalBytes: 100 });
    off();
  });

  it("parses setEngine / getStatus JSON from the native bridge", () => {
    window.__amigaTts = {
      speak: () => "ok",
      setEngine: vi.fn(() => '{"engine":"kokoro","ready":false,"downloading":true,"supported":true}'),
      getStatus: vi.fn(() => '{"engine":"kokoro","ready":true,"downloading":false,"supported":true}'),
    };
    expect(setNativeTtsEngine("kokoro")).toMatchObject({
      engine: "kokoro",
      downloading: true,
      supported: true,
    });
    expect(getNativeTtsStatus()).toMatchObject({ engine: "kokoro", ready: true });
  });
});
