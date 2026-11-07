import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useListeningQuestionAudio } from "@/modules/reading/useListeningQuestionAudio.js";
import * as speechTtsModule from "@/shared/speechTts.js";

describe("useListeningQuestionAudio", () => {
  let speakTextSpy;
  let stopSpeechSpy;

  beforeEach(() => {
    speakTextSpy = vi.spyOn(speechTtsModule, "speakText").mockImplementation((text, lang, callbacks) => {
      callbacks?.onStart?.();
      return true;
    });
    stopSpeechSpy = vi.spyOn(speechTtsModule, "stopSpeech").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("canPlayListeningAudio returns true when audio_text is present and TTS is available", () => {
    vi.spyOn(speechTtsModule, "canUseSpeechTts").mockReturnValue(true);

    const currentQuestion = ref(null);
    const currentQuestionIndex = ref(0);
    const { canPlayListeningAudio } = useListeningQuestionAudio({
      currentQuestion,
      currentQuestionIndex,
      getTargetLang: () => "es",
    });

    expect(canPlayListeningAudio.value).toBe(false);

    currentQuestion.value = { id: "q1", audio_text: "Hola amigo" };
    expect(canPlayListeningAudio.value).toBe(true);
  });

  it("routes through speakText and sets speakingQuestionKey and audioBusy", () => {
    const currentQuestion = ref({ id: "q42", audio_text: "¿Dónde está la biblioteca?" });
    const currentQuestionIndex = ref(2);

    const { audioBusy, isPlaying, speakingQuestionKey, playAudio } = useListeningQuestionAudio({
      currentQuestion,
      currentQuestionIndex,
      getTargetLang: () => "es",
    });

    expect(audioBusy.value).toBe(false);
    expect(speakingQuestionKey.value).toBe(null);

    playAudio();

    expect(speakTextSpy).toHaveBeenCalledTimes(1);
    expect(speakTextSpy).toHaveBeenCalledWith(
      "¿Dónde está la biblioteca?",
      "es",
      expect.objectContaining({ rate: 0.9 }),
    );
    expect(audioBusy.value).toBe(true);
    expect(isPlaying.value).toBe(true);
    expect(speakingQuestionKey.value).toBe("q42");
  });

  it("stopAudio calls stopSpeech and resets state", () => {
    const currentQuestion = ref({ id: "q1", audio_text: "Test audio" });
    const currentQuestionIndex = ref(0);

    const { audioBusy, speakingQuestionKey, playAudio, stopAudio } = useListeningQuestionAudio({
      currentQuestion,
      currentQuestionIndex,
      getTargetLang: () => "en",
    });

    playAudio();
    expect(audioBusy.value).toBe(true);

    stopAudio();
    expect(stopSpeechSpy).toHaveBeenCalled();
    expect(audioBusy.value).toBe(false);
    expect(speakingQuestionKey.value).toBe(null);
  });

  it("toggleListeningAudio plays when stopped and stops when playing", () => {
    const currentQuestion = ref({ id: "q1", audio_text: "Toggle me" });
    const currentQuestionIndex = ref(0);

    const { audioBusy, toggleListeningAudio } = useListeningQuestionAudio({
      currentQuestion,
      currentQuestionIndex,
      getTargetLang: () => "es",
    });

    toggleListeningAudio();
    expect(audioBusy.value).toBe(true);

    toggleListeningAudio();
    expect(audioBusy.value).toBe(false);
    expect(stopSpeechSpy).toHaveBeenCalled();
  });

  it("stops playback when currentQuestionIndex changes", async () => {
    const currentQuestion = ref({ id: "q1", audio_text: "First question" });
    const currentQuestionIndex = ref(0);

    const { audioBusy, playAudio } = useListeningQuestionAudio({
      currentQuestion,
      currentQuestionIndex,
      getTargetLang: () => "es",
    });

    playAudio();
    expect(audioBusy.value).toBe(true);

    currentQuestionIndex.value = 1;
    await vi.waitFor(() => expect(audioBusy.value).toBe(false));
    expect(stopSpeechSpy).toHaveBeenCalled();
  });
});
