import { ref } from "vue";
import { pickSpeechVoice } from "@/shared/speechTts.js";
import { speakNativeTts, stopNativeTts } from "@/shared/ttsBridge.js";

/**
 * Shared TTS playback state machine used by read-aloud style composables.
 *
 * Prefers the native bridge and falls back to the Web Speech API. Exposes a
 * reactive `busy` flag plus `play`/`stop`; callers layer their own UI (status
 * messages, toggles, lifecycle hooks) on top.
 */
export function useSpeechPlayback() {
  const busy = ref(false);
  let speechUtterance = null;
  let pendingNativeRead = null;
  let nativeToken = null;

  function resetNative() {
    pendingNativeRead = null;
    nativeToken = null;
    busy.value = false;
    speechUtterance = null;
  }

  function speakWithWeb(text, speechLang) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return false;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLang;
    utterance.voice = pickSpeechVoice(speechLang);
    utterance.rate = 0.9;
    utterance.onend = () => {
      if (speechUtterance === utterance) {
        busy.value = false;
        speechUtterance = null;
      }
    };
    utterance.onerror = utterance.onend;
    speechUtterance = utterance;
    busy.value = true;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return true;
  }

  function stop() {
    pendingNativeRead = null;
    stopNativeTts(nativeToken);
    nativeToken = null;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    busy.value = false;
    speechUtterance = null;
  }

  /**
   * Speak `text` in `speechLang`, preferring native TTS with a Web Speech
   * fallback.
   *
   * @param {object} [handlers]
   * @param {() => void} [handlers.onFail] invoked when playback fails entirely.
   * @param {() => void} [handlers.onMissingLanguage] invoked when native
   *   reports a missing language and no fallback succeeds.
   */
  function play(text, speechLang, { onFail, onMissingLanguage } = {}) {
    stop();

    const native = speakNativeTts(text, speechLang, {
      onDone: resetNative,
      onError: (code) => {
        const pending = pendingNativeRead;
        resetNative();
        if (!pending) return;
        if (speakWithWeb(pending.text, pending.speechLang)) return;
        if (code === "missing-language" || String(code).includes("missing")) {
          onMissingLanguage?.();
        } else {
          onFail?.();
        }
      },
    });

    if (native.started) {
      nativeToken = native.token;
      pendingNativeRead = { text, speechLang };
      busy.value = true;
      return;
    }

    if (native.result !== "unavailable") {
      if (speakWithWeb(text, speechLang)) return;
      if (native.result === "missing-language") {
        onMissingLanguage?.();
      } else {
        onFail?.();
      }
      return;
    }

    if (!speakWithWeb(text, speechLang)) {
      onFail?.();
    }
  }

  return {
    busy,
    play,
    stop,
  };
}
