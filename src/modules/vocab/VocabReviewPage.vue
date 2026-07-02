<template>
  <div class="vocab-review-page">
    <header class="review-header">
      <button type="button" class="close-btn" :aria-label="t('common.back')" @click="exitReview">
        ✕
      </button>
      <div v-if="!finished && words.length" class="progress-track">
        <div class="progress-fill" :style="{ width: progressPct + '%' }" />
      </div>
      <span v-if="!finished && words.length" class="progress-label">
        {{ t("vocab.reviewProgress", { current: progress.current, total: progress.total }) }}
      </span>
    </header>

    <div v-if="loading" class="center-state">
      <div class="spinner" />
    </div>

    <div v-else-if="error" class="center-state">
      <p>{{ error }}</p>
      <button type="button" class="action-btn secondary" @click="load">{{ t("common.retry") }}</button>
    </div>

    <div v-else-if="!words.length" class="center-state">
      <span class="empty-emoji" aria-hidden="true">✨</span>
      <p>{{ t("vocab.reviewAllCaughtUp") }}</p>
      <button type="button" class="action-btn primary" @click="exitReview">
        {{ t("vocab.reviewBack") }}
      </button>
    </div>

    <div v-else-if="finished" class="summary">
      <div class="summary-emoji" aria-hidden="true">🎉</div>
      <h2>{{ t("vocab.reviewComplete") }}</h2>
      <p class="summary-sub">
        {{ t("vocab.reviewCompleteHint", { n: words.length }) }}
      </p>
      <p v-if="masteredCount" class="summary-stat">
        {{ t("vocab.reviewMasteredCount", { n: masteredCount }) }}
      </p>
      <p v-if="streakCelebration" class="streak-banner">{{ streakCelebration }}</p>
      <p v-if="vocabMilestoneBanner" class="vocab-milestone-banner">{{ vocabMilestoneBanner }}</p>
      <p v-if="showContinueReview" class="continue-hint">{{ t("vocab.reviewContinueHint") }}</p>
      <div class="summary-actions">
        <button
          v-if="showContinueReview"
          type="button"
          class="action-btn primary"
          :disabled="continuing"
          @click="continueReview"
        >
          {{ continueReviewLabel }}
        </button>
        <button
          type="button"
          class="action-btn"
          :class="showContinueReview ? 'secondary' : 'primary'"
          @click="exitReview"
        >
          {{ t("vocab.reviewBack") }}
        </button>
      </div>
    </div>

    <template v-else>
      <div class="review-body">
        <p v-if="currentWord?.mastery === 1" class="review-badge">
          {{ t("vocab.reviewReinforce") }}
        </p>
        <p v-if="flipped && !acting && !ratingAck" class="swipe-guide">
          {{ t("vocab.reviewSwipeHint") }}
        </p>
        <button
          type="button"
          class="flashcard"
          :class="{
            'is-flipped': flipped,
            'is-swipe-ready': swipeEnabled,
            'is-swiping': swipeDragging,
            'is-ack-positive': ratingAck === 'positive',
            'is-ack-learning': ratingAck === 'learning',
          }"
          :style="swipeCardStyle"
          :aria-label="flipped ? t('vocab.reviewTapToHide') : t('vocab.reviewTapToReveal')"
          @click="onCardClick"
          @pointerdown="onSwipePointerDown"
          @pointermove="onSwipePointerMove"
          @pointerup="onSwipePointerUp"
          @pointercancel="onSwipePointerCancel"
        >
          <div v-if="flipped" class="swipe-overlays" aria-hidden="true">
            <span
              class="swipe-overlay swipe-overlay-left"
              :style="{ opacity: swipeHints.stillLearning }"
            >
              {{ t("vocab.reviewStillLearning") }}
            </span>
            <span
              class="swipe-overlay swipe-overlay-right"
              :style="{ opacity: swipeHints.gotIt }"
            >
              {{ t("vocab.reviewGotIt") }}
            </span>
          </div>
          <div class="flashcard-inner">
            <div class="flashcard-face flashcard-front">
              <span class="flashcard-word">{{ currentWord?.word }}</span>
              <span class="flashcard-hint">{{ t("vocab.reviewTapToReveal") }}</span>
            </div>
            <div class="flashcard-face flashcard-back">
              <span class="flashcard-definition">{{ definitionText }}</span>
              <p v-if="currentWord?.example" class="flashcard-example">
                {{ currentWord.example }}
              </p>
              <span v-if="currentWord?.pos" class="flashcard-pos">{{ currentWord.pos }}</span>
            </div>
          </div>
        </button>
      </div>

      <footer class="review-footer">
        <button
          type="button"
          class="action-btn secondary"
          :disabled="!flipped || acting"
          @click="markStillLearning"
        >
          {{ t("vocab.reviewStillLearning") }}
        </button>
        <button
          type="button"
          class="action-btn primary"
          :disabled="!flipped || acting"
          @click="markGotIt"
        >
          {{ t("vocab.reviewGotIt") }}
        </button>
      </footer>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import { getUnknownWords, getUserVocabStats, updateWordMastery } from "@/shared/api.js";
import {
  VOCAB_MILESTONE_CELEBRATION_KEY,
  vocabMilestoneReached,
} from "@/modules/learn/vocabMilestones.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import { applyReviewStreak, reviewStreakCelebration } from "@/shared/reviewStreak.js";
import { useTargetLangStore } from "@/stores/targetLang.js";
import {
  REVIEW_SESSION_LIMIT,
  isSessionComplete,
  sessionProgress,
  sessionProgressPct,
  vocabDefinition,
} from "./vocabReviewSession.js";
import {
  playVocabRatingFeedback,
  vocabRatingAckKind,
  waitVocabRatingAck,
} from "./vocabRatingFeedback.js";
import {
  REMAINING_PEEK_LIMIT,
  remainingVocabReviewCount,
  shouldOfferVocabContinuation,
  vocabContinueLabelKey,
} from "./vocabReviewContinuation.js";
import {
  canSwipeToRate,
  isVocabSwipeTap,
  shouldAbortVocabSwipe,
  vocabSwipeDragStyle,
  vocabSwipeHintOpacity,
  vocabSwipeRating,
} from "./vocabSwipeRating.js";

const router = useRouter();
const { t } = useI18n();
const targetLangStore = useTargetLangStore();

const loading = ref(true);
const error = ref("");
const words = ref([]);
const index = ref(0);
const flipped = ref(false);
const cardRated = ref(false);
const ratingAck = ref(null);
const swipeOffsetX = ref(0);
const swipeDragging = ref(false);
const swipeConsumed = ref(false);
let swipeStartX = 0;
let swipeStartY = 0;
let swipeActive = false;
let swipeAborted = false;
const finished = ref(false);
const acting = ref(false);
const masteredCount = ref(0);
const knownBefore = ref(0);
const streakUpdate = ref(null);
const remainingDue = ref(0);
const checkingRemaining = ref(false);
const continuing = ref(false);
const userId = ref("");
const nativeLang = ref("zh");
const cefr = ref("A1");
const targetLang = ref("es");

const currentWord = computed(() => words.value[index.value] || null);

const progress = computed(() => sessionProgress(index.value, words.value.length));

const progressPct = computed(() =>
  sessionProgressPct(index.value, words.value.length, {
    answered: cardRated.value,
  }),
);

const definitionText = computed(() =>
  vocabDefinition(currentWord.value, nativeLang.value),
);

const streakCelebration = computed(() =>
  reviewStreakCelebration(streakUpdate.value, t),
);

const vocabMilestoneBanner = computed(() => {
  const milestone = vocabMilestoneReached(
    knownBefore.value,
    knownBefore.value + masteredCount.value,
  );
  if (!milestone) return "";
  return t(VOCAB_MILESTONE_CELEBRATION_KEY, { n: milestone });
});

const showContinueReview = computed(
  () => !checkingRemaining.value && shouldOfferVocabContinuation(remainingDue.value),
);

const continueReviewLabel = computed(() => {
  const key = vocabContinueLabelKey(remainingDue.value);
  const n =
    remainingDue.value >= REMAINING_PEEK_LIMIT
      ? REMAINING_PEEK_LIMIT
      : remainingDue.value;
  return t(key, { n });
});

const swipeEnabled = computed(() =>
  canSwipeToRate({
    flipped: flipped.value,
    acting: acting.value,
    ratingAck: ratingAck.value,
  }),
);

const swipeCardStyle = computed(() => {
  if (!swipeDragging.value || swipeOffsetX.value === 0) return undefined;
  return vocabSwipeDragStyle(swipeOffsetX.value);
});

const swipeHints = computed(() => vocabSwipeHintOpacity(swipeOffsetX.value));

function resetSwipeState() {
  swipeOffsetX.value = 0;
  swipeDragging.value = false;
  swipeActive = false;
  swipeAborted = false;
}

function onSwipePointerDown(event) {
  if (!swipeEnabled.value) return;
  swipeStartX = event.clientX;
  swipeStartY = event.clientY;
  swipeActive = true;
  swipeAborted = false;
  swipeDragging.value = false;
  swipeOffsetX.value = 0;
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function onSwipePointerMove(event) {
  if (!swipeActive || swipeAborted) return;
  const deltaX = event.clientX - swipeStartX;
  const deltaY = event.clientY - swipeStartY;
  if (!swipeDragging.value && shouldAbortVocabSwipe({ deltaX, deltaY })) {
    swipeAborted = true;
    resetSwipeState();
    return;
  }
  if (!swipeDragging.value && !isVocabSwipeTap(deltaX, deltaY) && Math.abs(deltaX) > 6) {
    swipeDragging.value = true;
  }
  if (swipeDragging.value) {
    swipeOffsetX.value = deltaX;
    event.preventDefault();
  }
}

function onSwipePointerUp(event) {
  if (!swipeActive) return;
  const deltaX = event.clientX - swipeStartX;
  const deltaY = event.clientY - swipeStartY;
  const rating = swipeDragging.value ? vocabSwipeRating(deltaX) : null;

  if (rating === "got_it") {
    swipeConsumed.value = true;
    resetSwipeState();
    markGotIt();
    return;
  }
  if (rating === "still_learning") {
    swipeConsumed.value = true;
    resetSwipeState();
    markStillLearning();
    return;
  }

  resetSwipeState();

  if (!isVocabSwipeTap(deltaX, deltaY)) {
    swipeConsumed.value = true;
  }
}

function onSwipePointerCancel() {
  resetSwipeState();
}

function toggleFlip() {
  if (!currentWord.value) return;
  flipped.value = !flipped.value;
}

function onCardClick() {
  if (swipeConsumed.value) {
    swipeConsumed.value = false;
    return;
  }
  toggleFlip();
}

function resetCard() {
  flipped.value = false;
  cardRated.value = false;
  ratingAck.value = null;
  resetSwipeState();
  swipeConsumed.value = false;
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const ctx = await loadLearningContext({ targetLangStore });
    userId.value = ctx.user.id;
    nativeLang.value = ctx.nativeLang;
    cefr.value = ctx.cefr;
    targetLang.value = ctx.targetLang;
    const [reviewWords, stats] = await Promise.all([
      getUnknownWords(ctx.user.id, ctx.cefr, REVIEW_SESSION_LIMIT, ctx.targetLang),
      getUserVocabStats(ctx.user.id, ctx.targetLang),
    ]);
    words.value = reviewWords;
    knownBefore.value = stats?.total_known ?? 0;
    index.value = 0;
    finished.value = false;
    masteredCount.value = 0;
    streakUpdate.value = null;
    remainingDue.value = 0;
    checkingRemaining.value = false;
    continuing.value = false;
    resetCard();
  } catch {
    error.value = t("common.fail");
    words.value = [];
  } finally {
    loading.value = false;
  }
}

async function advanceAfterMark(mastery) {
  if (!currentWord.value || acting.value) return;
  cardRated.value = true;
  ratingAck.value = vocabRatingAckKind(mastery);
  playVocabRatingFeedback(mastery);
  acting.value = true;
  try {
    await Promise.all([
      waitVocabRatingAck(),
      updateWordMastery(userId.value, currentWord.value.id, mastery, "vocab_flashcard"),
    ]);
    if (mastery >= 2) masteredCount.value += 1;
  } catch {
    // Still advance — local session should not block on a single failure.
  } finally {
    acting.value = false;
  }

  const nextIndex = index.value + 1;
  if (isSessionComplete(nextIndex, words.value.length)) {
    finished.value = true;
    streakUpdate.value = await applyReviewStreak(userId.value, words.value.length);
    await refreshRemainingDue();
    return;
  }
  index.value = nextIndex;
  resetCard();
}

function markGotIt() {
  advanceAfterMark(2);
}

function markStillLearning() {
  advanceAfterMark(1);
}

async function refreshRemainingDue() {
  if (!userId.value) {
    remainingDue.value = 0;
    return;
  }
  checkingRemaining.value = true;
  try {
    const peeked = await getUnknownWords(
      userId.value,
      cefr.value,
      REMAINING_PEEK_LIMIT,
      targetLang.value,
    );
    remainingDue.value = remainingVocabReviewCount(peeked);
  } catch {
    remainingDue.value = 0;
  } finally {
    checkingRemaining.value = false;
  }
}

async function continueReview() {
  continuing.value = true;
  try {
    await load();
  } finally {
    continuing.value = false;
  }
}

function exitReview() {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  router.push({ name: "learn" });
}

onMounted(load);
</script>

<style scoped>
.vocab-review-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: var(--bg);
}

.review-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--white);
  border-bottom: 1px solid var(--border);
}

.close-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: var(--bg);
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
}

.progress-track {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: var(--border);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, #58cc02, #89e219);
  transition: width 0.3s ease;
}

.progress-label {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.center-state,
.summary {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
}

.empty-emoji,
.summary-emoji {
  font-size: 48px;
}

.summary h2 {
  margin: 0;
  font-size: 22px;
}

.summary-sub,
.summary-stat {
  margin: 0;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.5;
}

.streak-banner {
  margin: 12px 0 0;
  padding: 12px 16px;
  background: var(--orange-bg);
  color: var(--orange-hover);
  border-radius: var(--radius-md);
  font-weight: 700;
}

.vocab-milestone-banner {
  margin: 12px 0 0;
  padding: 12px 16px;
  background: #e8f8ef;
  color: #1f6b47;
  border-radius: var(--radius-md);
  font-weight: 700;
}

.continue-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.summary-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 280px;
  margin-top: 4px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.review-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 16px;
  gap: 12px;
}

.review-badge {
  margin: 0;
  padding: 4px 12px;
  border-radius: 999px;
  background: #fff4e5;
  color: #c65d00;
  font-size: 12px;
  font-weight: 600;
}

.swipe-guide {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.02em;
}

.flashcard {
  position: relative;
  width: 100%;
  max-width: 360px;
  height: 280px;
  perspective: 1000px;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  touch-action: manipulation;
}

.flashcard.is-swipe-ready {
  touch-action: none;
}

.flashcard.is-swiping .flashcard-inner {
  transition: none;
}

.swipe-overlays {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.swipe-overlay {
  position: absolute;
  top: 50%;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  transform: translateY(-50%);
  transition: opacity 0.08s ease;
}

.swipe-overlay-left {
  left: 12px;
  color: #9a6200;
  background: rgba(240, 180, 41, 0.22);
  border: 2px solid rgba(240, 180, 41, 0.55);
}

.swipe-overlay-right {
  right: 12px;
  color: #2d7a18;
  background: rgba(88, 204, 2, 0.18);
  border: 2px solid rgba(88, 204, 2, 0.5);
}

.flashcard-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.45s ease;
  transform-style: preserve-3d;
}

.flashcard.is-flipped .flashcard-inner {
  transform: rotateY(180deg);
}

.flashcard.is-ack-positive,
.flashcard.is-ack-learning {
  animation: vocab-rating-ack 0.32s ease;
}

.flashcard.is-ack-positive .flashcard-face {
  box-shadow:
    0 0 0 3px var(--green),
    0 4px 24px rgba(88, 204, 2, 0.28);
}

.flashcard.is-ack-learning .flashcard-face {
  box-shadow:
    0 0 0 3px #f0b429,
    0 4px 24px rgba(240, 180, 41, 0.22);
}

@keyframes vocab-rating-ack {
  0% {
    transform: scale(1);
  }
  45% {
    transform: scale(1.015);
  }
  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .flashcard.is-ack-positive,
  .flashcard.is-ack-learning {
    animation: none;
  }
}

.flashcard-face {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  border-radius: 16px;
  background: var(--white);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  backface-visibility: hidden;
}

.flashcard-back {
  transform: rotateY(180deg);
}

.flashcard-word {
  font-size: 36px;
  font-weight: 700;
  color: var(--text);
}

.flashcard-hint {
  font-size: 13px;
  color: var(--text-secondary);
}

.flashcard-definition {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.4;
  text-align: center;
  color: var(--text);
}

.flashcard-example {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-secondary);
  text-align: center;
}

.flashcard-pos {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--bg);
  color: var(--text-secondary);
}

.review-footer {
  display: flex;
  gap: 10px;
  padding: 16px;
  background: var(--white);
  border-top: 1px solid var(--border);
}

.action-btn {
  flex: 1;
  padding: 14px 16px;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.action-btn.primary {
  background: var(--primary);
  color: #fff;
}

.action-btn.secondary {
  background: var(--bg);
  color: var(--text);
}
</style>