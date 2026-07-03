<template>
  <div
    v-if="showPanel"
    class="audio-panel"
    :class="{ 'is-playing': playing, 'is-listen-first': listenFirst }"
    role="group"
    :aria-label="t('path.audioPanelLabel')"
  >
    <p v-if="unavailable" class="audio-unavailable" role="status">
      {{ t("path.audioUnavailable") }}
    </p>
    <template v-else>
      <button
        type="button"
        class="audio-panel-main"
        :disabled="busy"
        @click="playNormal"
      >
        <span
          class="audio-panel-icon"
          :class="{ 'is-animating': playing && !slowMode }"
          aria-hidden="true"
        >
          🔊
        </span>
        <span class="audio-panel-label">
          {{ playing && !slowMode ? t("path.audioPlaying") : t("path.playAudio") }}
        </span>
      </button>
      <button
        type="button"
        class="audio-panel-slow"
        :disabled="busy"
        :aria-label="t('path.playAudioSlow')"
        @click="playSlow"
      >
        🐢
      </button>
    </template>
    <span class="audio-live" aria-live="polite">{{ liveStatus }}</span>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from "vue";
import { useI18n } from "@/shared/i18n";
import {
  isSpeechSynthesisAvailable,
  SPEECH_RATE_NORMAL,
  SPEECH_RATE_SLOW,
} from "@/shared/wordSpeech.js";
import {
  hasQuestionAudio,
  isListenFirstQuestion,
  QUESTION_AUDIO_AUTO_PLAY_MS,
  speakQuestionAudio,
} from "../questionAudio.js";

const props = defineProps({
  question: { type: Object, required: true },
  autoPlay: { type: Boolean, default: true },
});

const emit = defineEmits(["play-start", "play-end"]);

const { t } = useI18n();
const playing = ref(false);
const slowMode = ref(false);
const busy = ref(false);
const liveStatus = ref("");

const hasAudio = computed(() => hasQuestionAudio(props.question));
const listenFirst = computed(() => isListenFirstQuestion(props.question));
const unavailable = computed(
  () => hasAudio.value && !isSpeechSynthesisAvailable(),
);
const showPanel = computed(() => hasAudio.value);

let autoPlayTimer = null;

function clearAutoPlayTimer() {
  if (autoPlayTimer != null) {
    clearTimeout(autoPlayTimer);
    autoPlayTimer = null;
  }
}

async function playAtRate(rate) {
  if (!hasAudio.value || busy.value || unavailable.value) return;
  busy.value = true;
  playing.value = true;
  slowMode.value = rate !== SPEECH_RATE_NORMAL;
  liveStatus.value = t("path.audioPlaying");
  emit("play-start");
  try {
    await speakQuestionAudio(props.question, { rate });
  } finally {
    playing.value = false;
    slowMode.value = false;
    busy.value = false;
    liveStatus.value = "";
    emit("play-end");
  }
}

function playNormal() {
  return playAtRate(SPEECH_RATE_NORMAL);
}

function playSlow() {
  return playAtRate(SPEECH_RATE_SLOW);
}

function scheduleAutoPlay() {
  clearAutoPlayTimer();
  if (!props.autoPlay || !hasAudio.value || unavailable.value) return;
  autoPlayTimer = setTimeout(() => {
    autoPlayTimer = null;
    if (props.autoPlay) void playNormal();
  }, QUESTION_AUDIO_AUTO_PLAY_MS);
}

watch(
  () => props.question?.id,
  () => scheduleAutoPlay(),
  { immediate: true },
);

watch(
  () => props.autoPlay,
  (autoPlay) => {
    if (!autoPlay) clearAutoPlayTimer();
  },
);

onUnmounted(() => {
  clearAutoPlayTimer();
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
});
</script>

<style scoped>
.audio-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 72px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--blue-bg);
}

.audio-panel.is-listen-first {
  margin-bottom: 8px;
}

.audio-panel-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 48px;
  padding: 12px 16px;
  border: 2px solid var(--blue);
  border-radius: var(--radius-md);
  background: var(--white);
  color: var(--blue-hover);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition);
}

.audio-panel-main:disabled,
.audio-panel-slow:disabled {
  opacity: 0.6;
  cursor: default;
}

.audio-panel-icon {
  font-size: 22px;
  line-height: 1;
}

.audio-panel-icon.is-animating {
  animation: audio-pulse 1s ease-in-out infinite;
}

.audio-panel-slow {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--white);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition);
}

.audio-panel-slow:not(:disabled):hover,
.audio-panel-main:not(:disabled):hover {
  border-color: var(--blue);
  background: var(--blue-bg);
}

.audio-unavailable {
  margin: 0;
  width: 100%;
  text-align: center;
  font-size: 14px;
  color: var(--text-light);
  line-height: 1.4;
}

.audio-live {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes audio-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.12);
    opacity: 0.82;
  }
}

@media (prefers-reduced-motion: reduce) {
  .audio-panel-icon.is-animating {
    animation: none;
  }
}
</style>