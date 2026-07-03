import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import QuestionAudioPanel from "../components/QuestionAudioPanel.vue";
import { QUESTION_AUDIO_AUTO_PLAY_MS } from "../questionAudio.js";
import { SPEECH_RATE_SLOW } from "@/shared/wordSpeech.js";

describe("QuestionAudioPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
    globalThis.speechSynthesis = {
      cancel: vi.fn(),
      speak: vi.fn((utter) => utter.onend?.()),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.SpeechSynthesisUtterance;
    delete globalThis.speechSynthesis;
  });

  const listeningQuestion = {
    id: "q1",
    type: "T02",
    language: "es",
    audioText: "perro",
    imageOptions: [{ desc: "dog" }, { desc: "cat" }],
  };

  it("renders normal and slow playback buttons", () => {
    const wrapper = mount(QuestionAudioPanel, {
      props: { question: listeningQuestion, autoPlay: false },
    });

    expect(wrapper.find(".audio-panel-main").exists()).toBe(true);
    expect(wrapper.find(".audio-panel-slow").exists()).toBe(true);
    expect(wrapper.find(".audio-panel.is-listen-first").exists()).toBe(true);
  });

  it("auto-plays after the standard delay", async () => {
    mount(QuestionAudioPanel, {
      props: { question: listeningQuestion, autoPlay: true },
    });

    expect(globalThis.speechSynthesis.speak).not.toHaveBeenCalled();
    vi.advanceTimersByTime(QUESTION_AUDIO_AUTO_PLAY_MS);
    await flushPromises();
    expect(globalThis.speechSynthesis.speak).toHaveBeenCalledOnce();
  });

  it("plays slowly when the turtle button is clicked", async () => {
    const wrapper = mount(QuestionAudioPanel, {
      props: { question: listeningQuestion, autoPlay: false },
    });

    await wrapper.find(".audio-panel-slow").trigger("click");
    await flushPromises();

    expect(globalThis.speechSynthesis.speak.mock.calls[0][0].rate).toBe(SPEECH_RATE_SLOW);
  });

  it("shows playing state while audio is active", async () => {
    class SlowUtterance {
      constructor(text) {
        this.text = text;
        this.lang = "";
        this.rate = 1;
        this.onend = null;
        this.onerror = null;
      }
    }
    globalThis.SpeechSynthesisUtterance = SlowUtterance;
    globalThis.speechSynthesis.speak = vi.fn();

    const wrapper = mount(QuestionAudioPanel, {
      props: { question: listeningQuestion, autoPlay: false },
    });

    const playPromise = wrapper.find(".audio-panel-main").trigger("click");
    await flushPromises();
    expect(wrapper.find(".audio-panel.is-playing").exists()).toBe(true);
    expect(wrapper.find(".audio-panel-icon.is-animating").exists()).toBe(true);

    globalThis.speechSynthesis.speak.mock.calls[0][0].onend?.();
    await playPromise;
    await flushPromises();
    expect(wrapper.find(".audio-panel.is-playing").exists()).toBe(false);
  });

  it("shows unavailable message when speech synthesis is missing", () => {
    delete globalThis.speechSynthesis;
    const wrapper = mount(QuestionAudioPanel, {
      props: { question: listeningQuestion, autoPlay: false },
    });

    expect(wrapper.find(".audio-unavailable").exists()).toBe(true);
    expect(wrapper.find(".audio-panel-main").exists()).toBe(false);
  });
});