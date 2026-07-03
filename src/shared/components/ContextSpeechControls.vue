<template>
  <div
    v-if="showControls"
    class="context-speech-controls"
    @click.stop
    @pointerdown.stop
  >
    <button
      type="button"
      class="context-speech-btn"
      :class="{ 'is-speaking': speaking }"
      :aria-label="t('vocab.playContextSentence')"
      :disabled="speechBusy"
      @click="playNormal"
    >
      🔊
    </button>
    <button
      type="button"
      class="context-speech-btn is-slow"
      :class="{ 'is-speaking': slowSpeaking }"
      :aria-label="t('vocab.playContextSentenceSlow')"
      :disabled="speechBusy"
      @click="playSlow"
    >
      🐢
    </button>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from "vue";
import { useI18n } from "@/shared/i18n";
import { shouldOfferContextSentenceSpeech } from "@/modules/vocab/contextSentenceSpeech.js";
import {
  isSpeechSynthesisAvailable,
  SPEECH_RATE_NORMAL,
  SPEECH_RATE_SLOW,
  speakText,
} from "@/shared/wordSpeech.js";

const props = defineProps({
  text: { type: String, default: "" },
  language: { type: String, default: "" },
  visible: { type: Boolean, default: true },
});

const { t } = useI18n();

const speaking = ref(false);
const slowSpeaking = ref(false);
const speechBusy = computed(() => speaking.value || slowSpeaking.value);
const speechAvailable = computed(() => isSpeechSynthesisAvailable());
const showControls = computed(
  () =>
    props.visible &&
    shouldOfferContextSentenceSpeech(props.text) &&
    Boolean(props.language) &&
    speechAvailable.value,
);

function cancelSpeech() {
  globalThis.speechSynthesis?.cancel();
  speaking.value = false;
  slowSpeaking.value = false;
}

async function playSpeech(rate = SPEECH_RATE_NORMAL) {
  if (!showControls.value) return;
  globalThis.speechSynthesis?.cancel();
  const isSlow = rate !== SPEECH_RATE_NORMAL;
  if (isSlow) slowSpeaking.value = true;
  else speaking.value = true;
  try {
    await speakText({ text: props.text, language: props.language, rate });
  } finally {
    speaking.value = false;
    slowSpeaking.value = false;
  }
}

function playNormal() {
  void playSpeech(SPEECH_RATE_NORMAL);
}

function playSlow() {
  void playSpeech(SPEECH_RATE_SLOW);
}

watch(
  () => [props.text, props.visible],
  () => {
    cancelSpeech();
  },
);

onUnmounted(() => {
  cancelSpeech();
});

defineExpose({ cancelSpeech });
</script>

<style scoped>
.context-speech-controls {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  justify-content: flex-end;
}

.context-speech-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--blue-bg, rgba(28, 176, 246, 0.12));
  color: var(--blue-hover, #1cb0f6);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition:
    background var(--transition, 0.2s ease),
    transform 0.2s ease;
}

.context-speech-btn:hover:not(:disabled) {
  background: var(--green-bg, rgba(88, 204, 2, 0.12));
}

.context-speech-btn:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.context-speech-btn.is-speaking {
  animation: context-speech-pulse 0.9s ease-in-out infinite;
}

@keyframes context-speech-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.08);
  }
}

@media (prefers-reduced-motion: reduce) {
  .context-speech-btn.is-speaking {
    animation: none;
  }
}
</style>