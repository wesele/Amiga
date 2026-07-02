import { onMounted, onUnmounted } from "vue";
import { shouldAdvancePracticeOnEnter } from "./practiceKeyboard.js";

/**
 * Global Enter-to-continue for practice pages.
 * Complements QuestionRenderer's input-level Enter handler for text answers.
 */
export function usePracticeEnterKey(getState, onPrimary) {
  function onKeydown(event) {
    const state = getState();
    if (state.disabled) return;
    if (!shouldAdvancePracticeOnEnter(event, state)) return;
    event.preventDefault();
    onPrimary();
  }

  onMounted(() => {
    window.addEventListener("keydown", onKeydown);
  });

  onUnmounted(() => {
    window.removeEventListener("keydown", onKeydown);
  });
}