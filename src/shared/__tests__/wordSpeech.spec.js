import { describe, expect, it, vi } from "vitest";
import {
  WORD_SPEECH_AUTO_PLAY_MS,
  isSpeechSynthesisAvailable,
  shouldAutoPlayWordSpeech,
  speakText,
  speakWord,
  speechLanguageCode,
} from "../wordSpeech.js";

describe("wordSpeech", () => {
  it("maps target languages to speech synthesis locales", () => {
    expect(speechLanguageCode("es")).toBe("es-ES");
    expect(speechLanguageCode("en")).toBe("en-US");
    expect(speechLanguageCode("zh")).toBe("zh-CN");
  });

  it("detects speech synthesis availability", () => {
    expect(isSpeechSynthesisAvailable({ speak: vi.fn() })).toBe(true);
    expect(isSpeechSynthesisAvailable(null)).toBe(false);
    expect(isSpeechSynthesisAvailable(undefined)).toBe(false);
  });

  it("speaks text and resolves when synthesis ends", async () => {
    class MockUtterance {
      constructor(text) {
        this.text = text;
        this.lang = "";
        this.onend = null;
        this.onerror = null;
      }
    }
    globalThis.SpeechSynthesisUtterance = MockUtterance;

    const handlers = {};
    const speechSynthesis = {
      cancel: vi.fn(),
      speak: vi.fn((utter) => {
        handlers.onend = utter.onend;
        handlers.onerror = utter.onerror;
      }),
    };

    const promise = speakText(
      { text: "hospital", language: "es" },
      { speechSynthesis },
    );

    expect(speechSynthesis.cancel).toHaveBeenCalled();
    expect(speechSynthesis.speak).toHaveBeenCalledOnce();
    const utter = speechSynthesis.speak.mock.calls[0][0];
    expect(utter.lang).toBe("es-ES");
    expect(utter.text).toBe("hospital");

    handlers.onend?.();
    await expect(promise).resolves.toBe(true);
  });

  it("resolves false when synthesis is unavailable", async () => {
    await expect(
      speakText({ text: "hola", language: "es" }, { speechSynthesis: null }),
    ).resolves.toBe(false);
  });

  it("resolves false when text is empty", async () => {
    const speechSynthesis = { cancel: vi.fn(), speak: vi.fn() };
    await expect(
      speakText({ text: "   ", language: "es" }, { speechSynthesis }),
    ).resolves.toBe(false);
    expect(speechSynthesis.speak).not.toHaveBeenCalled();
  });

  it("speaks a plain word string", async () => {
    class MockUtterance {
      constructor(text) {
        this.text = text;
        this.lang = "";
        this.onend = null;
        this.onerror = null;
      }
    }
    globalThis.SpeechSynthesisUtterance = MockUtterance;

    const speechSynthesis = {
      cancel: vi.fn(),
      speak: vi.fn((utter) => utter.onend?.()),
    };

    await expect(
      speakWord("casa", "es", { speechSynthesis }),
    ).resolves.toBe(true);
    expect(speechSynthesis.speak.mock.calls[0][0].text).toBe("casa");
  });

  it("speaks a vocab word object", async () => {
    class MockUtterance {
      constructor(text) {
        this.text = text;
        this.lang = "";
        this.onend = null;
        this.onerror = null;
      }
    }
    globalThis.SpeechSynthesisUtterance = MockUtterance;

    const speechSynthesis = {
      cancel: vi.fn(),
      speak: vi.fn((utter) => utter.onend?.()),
    };

    await speakWord({ word: "perro" }, "es", { speechSynthesis });
    expect(speechSynthesis.speak.mock.calls[0][0].text).toBe("perro");
  });

  it("auto-plays only while the learner is still on the card", () => {
    expect(shouldAutoPlayWordSpeech()).toBe(true);
    expect(shouldAutoPlayWordSpeech({ showResult: true })).toBe(false);
    expect(shouldAutoPlayWordSpeech({ enabled: false })).toBe(false);
  });

  it("exports a positive auto-play delay", () => {
    expect(WORD_SPEECH_AUTO_PLAY_MS).toBe(320);
  });
});