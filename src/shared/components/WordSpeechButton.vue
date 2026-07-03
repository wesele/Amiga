<template>
  <button
    v-if="speechAvailable"
    type="button"
    class="word-speech-btn"
    :class="{ 'is-speaking': speaking }"
    :aria-label="ariaLabel"
    :disabled="speaking"
    @click.stop="play"
  >
    🔊
  </button>
</template>

<script setup>
import { computed, onUnmounted, ref } from "vue";
import {
  isSpeechSynthesisAvailable,
  SPEECH_RATE_NORMAL,
  speakWord,
} from "@/shared/wordSpeech.js";

const props = defineProps({
  word: { type: String, required: true },
  language: { type: String, required: true },
  ariaLabel: { type: String, required: true },
  rate: { type: Number, default: SPEECH_RATE_NORMAL },
});

const speechAvailable = computed(() => isSpeechSynthesisAvailable());
const speaking = ref(false);

async function play() {
  if (speaking.value || !props.word) return;
  speaking.value = true;
  try {
    await speakWord(props.word, props.language, { rate: props.rate });
  } finally {
    speaking.value = false;
  }
}

onUnmounted(() => {
  globalThis.speechSynthesis?.cancel();
});
</script>

<style scoped>
.word-speech-btn {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--blue-bg);
  color: var(--blue-hover);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition:
    background var(--transition),
    transform 0.2s ease;
}

.word-speech-btn:hover:not(:disabled) {
  background: var(--green-bg);
}

.word-speech-btn:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.word-speech-btn.is-speaking {
  animation: word-speech-pulse 0.9s ease-in-out infinite;
}

@keyframes word-speech-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.08);
  }
}

@media (prefers-reduced-motion: reduce) {
  .word-speech-btn.is-speaking {
    animation: none;
  }
}
</style>