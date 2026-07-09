import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";

const speakNativeTts = vi.fn();
const stopNativeTts = vi.fn();

vi.mock("@/shared/ttsBridge.js", () => ({
  speakNativeTts: (...args) => speakNativeTts(...args),
  stopNativeTts: (...args) => stopNativeTts(...args),
}));

let useListeningQuestionAudio;

beforeEach(async () => {
  ({ useListeningQuestionAudio } = await import("../useListeningQuestionAudio.js"));
  speakNativeTts.mockReset();
  stopNativeTts.mockReset();
  window.speechSynthesis = {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => []),
  };
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
});

afterEach(() => {
  delete window.speechSynthesis;
  delete globalThis.SpeechSynthesisUtterance;
});

function setup({ audioText = "hola", targetLang = "es" } = {}) {
  const currentQuestion = ref({ audio_text: audioText });
  const currentQuestionIndex = ref(0);
  let api;
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useListeningQuestionAudio({
          currentQuestion,
          currentQuestionIndex,
          getTargetLang: () => targetLang,
        });
        return () => null;
      },
    }),
  );
  return { api, wrapper, currentQuestion, currentQuestionIndex };
}

describe("useListeningQuestionAudio", () => {
  it("does nothing when there is no audio text", () => {
    const { api } = setup({ audioText: "" });
    api.playAudio();
    expect(speakNativeTts).not.toHaveBeenCalled();
    expect(api.audioBusy.value).toBe(false);
  });

  it("uses native TTS with the mapped speech language when it starts", () => {
    speakNativeTts.mockReturnValue({ started: true, token: Symbol("t") });
    const { api } = setup({ audioText: "hola", targetLang: "es" });

    api.playAudio();

    expect(speakNativeTts).toHaveBeenCalledWith(
      "hola",
      "es-ES",
      expect.objectContaining({
        onDone: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
    expect(api.audioBusy.value).toBe(true);
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
  });

  it("falls back to the Web Speech API when native TTS is unavailable", () => {
    speakNativeTts.mockReturnValue({ started: false, result: "unavailable" });
    const { api } = setup();

    api.playAudio();

    expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
    expect(api.audioBusy.value).toBe(true);
  });

  it("ignores playAudio while audio is already busy", () => {
    speakNativeTts.mockReturnValue({ started: true, token: Symbol("t") });
    const { api } = setup();

    api.playAudio();
    speakNativeTts.mockClear();
    api.playAudio();

    expect(speakNativeTts).not.toHaveBeenCalled();
  });

  it("clears busy state via the native done callback", () => {
    let handlers;
    speakNativeTts.mockImplementation((_text, _lang, cbs) => {
      handlers = cbs;
      return { started: true, token: Symbol("t") };
    });
    const { api } = setup();

    api.playAudio();
    expect(api.audioBusy.value).toBe(true);

    handlers.onDone();
    expect(api.audioBusy.value).toBe(false);
  });

  it("falls back to the Web Speech API when native TTS errors mid-playback", () => {
    let handlers;
    speakNativeTts.mockImplementation((_text, _lang, cbs) => {
      handlers = cbs;
      return { started: true, token: Symbol("t") };
    });
    const { api } = setup();

    api.playAudio();
    handlers.onError();

    expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
  });

  it("stopAudio cancels native and web playback", () => {
    speakNativeTts.mockReturnValue({ started: true, token: Symbol("t") });
    const { api } = setup();

    api.playAudio();
    api.stopAudio();

    expect(stopNativeTts).toHaveBeenCalled();
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
    expect(api.audioBusy.value).toBe(false);
  });

  it("stops playback when the current question index changes", async () => {
    speakNativeTts.mockReturnValue({ started: true, token: Symbol("t") });
    const { api, currentQuestionIndex } = setup();

    api.playAudio();
    stopNativeTts.mockClear();
    currentQuestionIndex.value = 1;
    await nextTick();

    expect(stopNativeTts).toHaveBeenCalled();
    expect(api.audioBusy.value).toBe(false);
  });

  it("stops playback on unmount", () => {
    speakNativeTts.mockReturnValue({ started: true, token: Symbol("t") });
    const { api, wrapper } = setup();

    api.playAudio();
    stopNativeTts.mockClear();
    wrapper.unmount();

    expect(stopNativeTts).toHaveBeenCalled();
  });
});
