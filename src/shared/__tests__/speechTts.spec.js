import { afterEach, describe, expect, it, vi } from "vitest";
import { getSpeechLang, speakText, stopSpeech } from "@/shared/speechTts.js";

describe("speechTts", () => {
  afterEach(() => {
    delete window.__amigaTts;
    delete window.__amigaTtsDone;
    delete window.__amigaTtsError;
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
});
