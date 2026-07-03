import { describe, expect, it, vi } from "vitest";
import { SPEECH_RATE_SLOW } from "@/shared/wordSpeech.js";
import {
  AUDIO_QUESTION_TYPES,
  hasQuestionAudio,
  isListenFirstQuestion,
  QUESTION_AUDIO_AUTO_PLAY_MS,
  shouldAutoPlayQuestionAudio,
  speakQuestionAudio,
  speechLanguageCode,
} from "../questionAudio.js";

describe("questionAudio", () => {
  it("detects audio-capable questions with non-empty audioText", () => {
    expect(hasQuestionAudio({ type: "T08", audioText: "Hola" })).toBe(true);
    expect(hasQuestionAudio({ type: "T05", audioText: "Hola" })).toBe(false);
    expect(hasQuestionAudio({ type: "T08", audioText: "   " })).toBe(false);
    expect(hasQuestionAudio(null)).toBe(false);
  });

  it("auto-plays only while the learner is still answering", () => {
    const question = { type: "T02", audioText: "perro" };
    expect(shouldAutoPlayQuestionAudio(question)).toBe(true);
    expect(shouldAutoPlayQuestionAudio(question, { showResult: true })).toBe(false);
    expect(shouldAutoPlayQuestionAudio({ type: "T05", audioText: "x" })).toBe(false);
  });

  it("maps target languages to speech synthesis locales", () => {
    expect(speechLanguageCode("es")).toBe("es-ES");
    expect(speechLanguageCode("en")).toBe("en-US");
    expect(speechLanguageCode("zh")).toBe("zh-CN");
  });

  it("speaks question audio and resolves when synthesis ends", async () => {
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

    const promise = speakQuestionAudio(
      { type: "T08", language: "es", audioText: "Buenos días" },
      { speechSynthesis },
    );

    expect(speechSynthesis.cancel).toHaveBeenCalled();
    expect(speechSynthesis.speak).toHaveBeenCalledOnce();
    const utter = speechSynthesis.speak.mock.calls[0][0];
    expect(utter.lang).toBe("es-ES");
    expect(utter.text).toBe("Buenos días");

    handlers.onend?.();
    await expect(promise).resolves.toBe(true);
  });

  it("resolves false when synthesis is unavailable", async () => {
    await expect(
      speakQuestionAudio({ type: "T08", audioText: "Hola" }, { speechSynthesis: null }),
    ).resolves.toBe(false);
  });

  it("exports listening question types and auto-play delay", () => {
    expect(AUDIO_QUESTION_TYPES).toContain("T02");
    expect(AUDIO_QUESTION_TYPES).toContain("T08");
    expect(QUESTION_AUDIO_AUTO_PLAY_MS).toBeGreaterThan(0);
  });

  it("identifies listen-first question types", () => {
    expect(isListenFirstQuestion({ type: "T02" })).toBe(true);
    expect(isListenFirstQuestion({ type: "T08" })).toBe(true);
    expect(isListenFirstQuestion({ type: "T09" })).toBe(false);
    expect(isListenFirstQuestion(null)).toBe(false);
  });

  it("speaks question audio at a slower rate when requested", async () => {
    class MockUtterance {
      constructor(text) {
        this.text = text;
        this.lang = "";
        this.rate = 1;
        this.onend = null;
        this.onerror = null;
      }
    }
    globalThis.SpeechSynthesisUtterance = MockUtterance;

    const speechSynthesis = {
      cancel: vi.fn(),
      speak: vi.fn((utter) => utter.onend?.()),
    };

    await speakQuestionAudio(
      { type: "T08", language: "es", audioText: "Hola" },
      { rate: SPEECH_RATE_SLOW, speechSynthesis },
    );

    expect(speechSynthesis.speak.mock.calls[0][0].rate).toBe(SPEECH_RATE_SLOW);
  });
});