<template>
  <div
    v-if="paragraphs.length"
    class="listen-along"
    role="group"
    :aria-label="t('news.listenAlong')"
  >
    <div class="listen-along-controls">
      <button
        type="button"
        class="listen-along-main"
        :disabled="busy"
        @click="onMainClick"
      >
        <span
          class="listen-along-icon"
          :class="{ 'is-animating': status === 'playing' }"
          aria-hidden="true"
        >
          🔊
        </span>
        <span class="listen-along-label">{{ mainLabel }}</span>
      </button>
      <button
        type="button"
        class="listen-along-slow"
        :disabled="busy || !hasCurrentParagraph"
        :aria-label="t('path.playAudioSlow')"
        @click="replaySlow"
      >
        🐢
      </button>
      <span v-if="status !== 'idle'" class="listen-along-progress-text">
        {{ progressLabel }}
      </span>
    </div>
    <div v-if="status === 'playing'" class="listen-along-track" aria-hidden="true">
      <div
        class="listen-along-fill"
        :style="{ width: segmentProgressPct + '%' }"
      />
    </div>
    <span class="listen-along-live" aria-live="polite">{{ liveStatus }}</span>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "@/shared/i18n";
import {
  isSpeechSynthesisAvailable,
  SPEECH_RATE_NORMAL,
  SPEECH_RATE_SLOW,
  speakText,
} from "@/shared/wordSpeech.js";
import {
  clampParagraphIndex,
  findParagraphIndexInViewport,
  scrollToParagraph,
} from "../articleListenAlong.js";

const props = defineProps({
  paragraphs: { type: Array, default: () => [] },
  language: { type: String, required: true },
  articleBodyEl: { type: Object, default: null },
  forcePause: { type: Boolean, default: false },
});

const emit = defineEmits(["update:readingIndex", "update:active"]);

const { t } = useI18n();

const status = ref("idle");
const currentIndex = ref(0);
const busy = ref(false);
const liveStatus = ref("");
const segmentProgressPct = ref(0);
let playGeneration = 0;

const hasCurrentParagraph = computed(
  () => props.paragraphs.length > 0 && currentIndex.value < props.paragraphs.length,
);

const mainLabel = computed(() => {
  if (status.value === "playing") return t("news.listenAlongPlaying");
  if (status.value === "paused") return t("news.listenAlongPause");
  return t("news.listenAlong");
});

const progressLabel = computed(() =>
  t("news.listenAlongProgress", {
    current: currentIndex.value + 1,
    total: props.paragraphs.length,
  }),
);

function setReadingIndex(index) {
  currentIndex.value = clampParagraphIndex(index, props.paragraphs.length);
  emit("update:readingIndex", currentIndex.value);
}

function setActive(active) {
  emit("update:active", active);
}

function scrollToCurrentParagraph() {
  const body = props.articleBodyEl;
  if (!body) return;
  const paragraphs = body.querySelectorAll(".para-original");
  const el = paragraphs[currentIndex.value];
  if (el) scrollToParagraph(body, el);
}

function cancelSpeech() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function resetPlayback() {
  playGeneration += 1;
  cancelSpeech();
  status.value = "idle";
  currentIndex.value = 0;
  busy.value = false;
  liveStatus.value = "";
  segmentProgressPct.value = 0;
  setReadingIndex(0);
  setActive(false);
}

async function playLoop(startIndex, { rate = SPEECH_RATE_NORMAL, advance = true } = {}) {
  if (!isSpeechSynthesisAvailable() || !props.paragraphs.length) return;
  const generation = ++playGeneration;
  busy.value = true;
  status.value = "playing";
  setActive(true);
  liveStatus.value = t("news.listenAlongPlaying");

  let index = clampParagraphIndex(startIndex, props.paragraphs.length);
  setReadingIndex(index);

  while (
    generation === playGeneration &&
    status.value === "playing" &&
    index < props.paragraphs.length
  ) {
    setReadingIndex(index);
    segmentProgressPct.value = ((index + 1) / props.paragraphs.length) * 100;
    scrollToCurrentParagraph();
    const ok = await speakText(
      { text: props.paragraphs[index], language: props.language, rate },
      {},
    );
    if (generation !== playGeneration || status.value !== "playing") break;
    if (!ok) break;
    if (!advance) break;
    index += 1;
  }

  if (generation !== playGeneration) return;

  busy.value = false;
  liveStatus.value = "";

  if (!advance) {
    status.value = "paused";
    segmentProgressPct.value = ((currentIndex.value + 1) / props.paragraphs.length) * 100;
    setActive(true);
    return;
  }

  if (status.value === "playing" && index >= props.paragraphs.length) {
    resetPlayback();
    return;
  }

  if (status.value === "paused") {
    segmentProgressPct.value = ((currentIndex.value + 1) / props.paragraphs.length) * 100;
  }
}

function onMainClick() {
  if (!isSpeechSynthesisAvailable() || !props.paragraphs.length) return;

  if (status.value === "playing") {
    status.value = "paused";
    cancelSpeech();
    busy.value = false;
    liveStatus.value = "";
    setActive(true);
    return;
  }

  if (status.value === "paused") {
    void playLoop(currentIndex.value);
    return;
  }

  const startIndex = props.articleBodyEl
    ? findParagraphIndexInViewport(props.articleBodyEl)
    : 0;
  void playLoop(startIndex);
}

function replaySlow() {
  if (!hasCurrentParagraph.value || busy.value) return;
  if (status.value === "playing") {
    status.value = "paused";
    cancelSpeech();
  }
  setActive(true);
  void playLoop(currentIndex.value, { rate: SPEECH_RATE_SLOW, advance: false });
}

watch(
  () => props.forcePause,
  (shouldPause) => {
    if (shouldPause && status.value === "playing") {
      status.value = "paused";
      cancelSpeech();
      busy.value = false;
      liveStatus.value = "";
      setActive(true);
    }
  },
);

watch(
  () => props.paragraphs,
  () => resetPlayback(),
);

onBeforeUnmount(() => {
  resetPlayback();
});

defineExpose({ resetPlayback });
</script>

<style scoped>
.listen-along {
  position: relative;
  margin-bottom: 10px;
}

.listen-along-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.listen-along-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 8px 12px;
  border: 1.5px solid var(--blue);
  border-radius: var(--radius-md);
  background: var(--blue-bg);
  color: var(--blue-hover);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: border-color var(--transition), background var(--transition);
}

.listen-along-main:disabled,
.listen-along-slow:disabled {
  opacity: 0.6;
  cursor: default;
}

.listen-along-icon {
  font-size: 18px;
  line-height: 1;
}

.listen-along-icon.is-animating {
  animation: listen-pulse 1s ease-in-out infinite;
}

.listen-along-slow {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.listen-along-progress-text {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-light);
  white-space: nowrap;
}

.listen-along-track {
  margin-top: 6px;
  height: 3px;
  border-radius: 2px;
  background: var(--border);
  overflow: hidden;
}

.listen-along-fill {
  height: 100%;
  background: var(--blue);
  border-radius: 2px;
  transition: width 0.25s ease;
}

.listen-along-live {
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

@keyframes listen-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.82;
  }
}

@media (prefers-reduced-motion: reduce) {
  .listen-along-icon.is-animating {
    animation: none;
  }
}
</style>