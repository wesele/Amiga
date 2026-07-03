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
      <p v-if="readingSessionMode && sessionWordCount" class="summary-reading-session">
        {{ t("vocab.reviewSessionComplete", { n: sessionWordCount }) }}
      </p>
      <p v-if="masteredCount" class="summary-stat">
        {{ t("vocab.reviewMasteredCount", { n: masteredCount }) }}
      </p>
      <p v-if="streakCelebration" class="streak-banner">{{ streakCelebration }}</p>
      <p v-if="dailyGoalCelebration" class="daily-goal-banner">{{ dailyGoalCelebration }}</p>
      <p v-else-if="dailyGoalNudge" class="daily-goal-banner is-nudge">{{ dailyGoalNudge }}</p>
      <p v-else-if="dailyGoalContributed" class="daily-goal-banner">{{ dailyGoalContributed }}</p>
      <p v-if="vocabMilestoneBanner" class="vocab-milestone-banner">{{ vocabMilestoneBanner }}</p>
      <AchievementUnlockBanner :badges="settlementUnlockBadges" />
      <section v-if="vocabReviewPlan" class="next-steps-panel">
        <p class="next-steps-eyebrow">{{ t("path.nextStep.title") }}</p>
        <div class="next-steps-primary">
          <span class="next-steps-icon" aria-hidden="true">{{ vocabReviewPlan.primary.icon }}</span>
          <div class="next-steps-copy">
            <p class="next-steps-primary-title">{{ stepTitle(vocabReviewPlan.primary) }}</p>
            <p
              v-if="vocabReviewPlan.primary.subtitleKey"
              class="next-steps-primary-sub"
            >
              {{ stepSubtitle(vocabReviewPlan.primary) }}
            </p>
          </div>
        </div>
        <div v-if="vocabReviewPlan.secondary.length" class="next-steps-queue">
          <p class="next-steps-queue-title">
            {{ t("path.nextStep.queueTitle", { n: vocabReviewPlan.secondary.length }) }}
          </p>
          <button
            v-for="step in vocabReviewPlan.secondary"
            :key="step.id"
            type="button"
            class="next-steps-queue-item"
            :disabled="!step.route && !step.contactAction && !isContinueReviewStep(step)"
            @click="goToVocabStep(step)"
          >
            <span class="next-steps-queue-icon" aria-hidden="true">{{ step.icon }}</span>
            <div class="next-steps-queue-copy">
              <p class="next-steps-queue-item-title">{{ stepTitle(step) }}</p>
              <p v-if="step.subtitleKey" class="next-steps-queue-item-sub">
                {{ stepSubtitle(step) }}
              </p>
            </div>
          </button>
        </div>
      </section>
      <div v-if="vocabReviewPlan" class="summary-actions">
        <button
          type="button"
          class="action-btn primary"
          :disabled="continuing || openingAiPractice"
          @click="goToVocabStep(vocabReviewPlan.primary)"
        >
          {{ stepContinueLabel(vocabReviewPlan.primary) }}
        </button>
        <button type="button" class="action-btn secondary" @click="exitReview">
          {{ t("vocab.reviewLater") }}
        </button>
      </div>
      <div v-else class="summary-actions">
        <button type="button" class="action-btn primary" @click="exitReview">
          {{ t("vocab.reviewBack") }}
        </button>
      </div>
    </div>

    <template v-else>
      <div class="review-body">
        <p v-if="currentWord?.mastery === 1" class="review-badge">
          {{ t("vocab.reviewReinforce") }}
        </p>
        <div
          v-if="vocabDots.length"
          class="srs-progress vocab-srs"
          :aria-label="vocabStageLabelText"
        >
          <span
            v-for="(filled, dotIdx) in vocabDots"
            :key="dotIdx"
            class="srs-dot"
            :class="{
              'is-filled': filled,
              'is-just-filled': filled && dotIdx === vocabJustFilledDot,
            }"
            aria-hidden="true"
          />
          <span class="srs-label">{{ vocabStageLabelText }}</span>
        </div>
        <p v-if="isRecallMode" class="recall-mode-badge">
          {{ t("vocab.recallModeBadge") }}
        </p>
        <p v-if="canRateCurrentCard && !acting && !ratingAck" class="swipe-guide">
          {{ t("vocab.reviewSwipeHint") }}
        </p>
        <WordSpeechButton
          v-if="currentWord && showWordSpeech"
          class="flashcard-speech-btn"
          :word="currentWord.word"
          :language="speechLanguage"
          :aria-label="t('vocab.playPronunciation')"
        />
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
          :aria-label="cardAriaLabel"
          @click="onCardClick"
          @pointerdown="onSwipePointerDown"
          @pointermove="onSwipePointerMove"
          @pointerup="onSwipePointerUp"
          @pointercancel="onSwipePointerCancel"
        >
          <div v-if="canRateCurrentCard" class="swipe-overlays" aria-hidden="true">
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
              <template v-if="cardMode === VOCAB_CARD_MODES.CLOZE">
                <div class="flashcard-cloze">
                  <p class="flashcard-cloze-text" :aria-label="clozeAriaText">
                    <template v-for="(part, clozeIndex) in clozeParts" :key="clozeIndex">
                      <span v-if="part.blank" class="flashcard-cloze-blank">{{ part.text }}</span>
                      <span v-else>{{ part.text }}</span>
                    </template>
                  </p>
                </div>
                <span class="flashcard-hint">{{ t("vocab.recallClozeHint") }}</span>
              </template>
              <template v-else-if="cardMode === VOCAB_CARD_MODES.REVERSE">
                <span class="flashcard-prompt">{{ definitionText }}</span>
                <span class="flashcard-hint">{{ t("vocab.recallReverseHint") }}</span>
              </template>
              <template v-else>
                <span class="flashcard-word">{{ currentWord?.word }}</span>
                <span class="flashcard-hint">{{ t("vocab.reviewTapToReveal") }}</span>
              </template>
            </div>
            <div class="flashcard-face flashcard-back">
              <span v-if="cardMode !== VOCAB_CARD_MODES.CLASSIC" class="flashcard-word flashcard-word-back">
                {{ currentWord?.word }}
              </span>
              <span class="flashcard-definition">{{ definitionText }}</span>
              <div v-if="reviewContextParts.length" class="flashcard-context">
                <span v-if="showNewsSourceBadge" class="flashcard-source-badge">
                  {{ t("vocab.reviewFromNews") }}
                </span>
                <div class="flashcard-example-row">
                  <p class="flashcard-example">
                    <template v-for="(part, partIndex) in reviewContextParts" :key="partIndex">
                      <mark v-if="part.highlight" class="flashcard-context-mark">{{ part.text }}</mark>
                      <span v-else>{{ part.text }}</span>
                    </template>
                  </p>
                  <ContextSpeechControls
                    :text="reviewContextText"
                    :language="speechLanguage"
                    :visible="flipped"
                  />
                </div>
                <button
                  v-if="showContextRevisitLink"
                  type="button"
                  class="flashcard-revisit-link"
                  @click.stop="goToContextArticle"
                >
                  {{ t("vocab.reviewContextRevisit") }}
                </button>
              </div>
              <span v-if="currentWord?.pos" class="flashcard-pos">{{ currentWord.pos }}</span>
            </div>
          </div>
        </button>
      </div>

      <footer class="review-footer">
        <p
          v-if="ratingAck && vocabScheduleText"
          class="srs-schedule vocab-srs-schedule is-revealed"
        >
          {{ vocabScheduleText }}
        </p>
        <section
          v-if="pendingContextNudge && contextNudgeCopy"
          class="context-reinforce-nudge"
        >
          <p class="context-reinforce-title">{{ contextNudgeCopy.title }}</p>
          <p v-if="contextNudgeCopy.snippet" class="context-reinforce-snippet">
            "{{ contextNudgeCopy.snippet }}"
          </p>
          <p class="context-reinforce-hint">{{ contextNudgeCopy.hint }}</p>
          <div class="context-reinforce-actions">
            <button type="button" class="action-btn primary" @click="acceptContextNudge">
              {{ contextNudgeCopy.actionLabel }}
            </button>
            <button type="button" class="action-btn secondary" @click="skipContextNudge">
              {{ contextNudgeCopy.skipLabel }}
            </button>
          </div>
        </section>
        <div v-else-if="showRevealButton" class="review-footer-actions">
          <button type="button" class="action-btn primary recall-reveal-btn" @click="revealAnswer">
            {{ t("vocab.recallReveal") }}
          </button>
        </div>
        <div v-else class="review-footer-actions">
          <button
            type="button"
            class="action-btn secondary"
            :disabled="!canRateCurrentCard || acting"
            @click="markStillLearning"
          >
            {{ t("vocab.reviewStillLearning") }}
          </button>
          <button
            type="button"
            class="action-btn primary"
            :disabled="!canRateCurrentCard || acting"
            @click="markGotIt"
          >
            {{ t("vocab.reviewGotIt") }}
          </button>
        </div>
      </footer>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import ContextSpeechControls from "@/shared/components/ContextSpeechControls.vue";
import WordSpeechButton from "@/shared/components/WordSpeechButton.vue";
import {
  WORD_SPEECH_AUTO_PLAY_MS,
  shouldAutoPlayWordSpeech,
  speakWord,
} from "@/shared/wordSpeech.js";
import { useRoute, useRouter } from "vue-router";
import {
  buildReadingReviewQueue,
  consumeReadingSessionWords,
  peekReadingSessionWords,
} from "@/modules/news/readingSession.js";
import { useI18n } from "@/shared/i18n";
import {
  getArticles,
  getArticlesReadingStatus,
  getPathCurriculum,
  getUnknownWords,
  getUserVocabStats,
  lookupWordIds,
  lookupWordsMastery,
  updateWordMastery,
} from "@/shared/api.js";
import { clearPendingReadingVocab } from "@/modules/news/pendingReadingVocab.js";
import { openAiContact } from "@/modules/ai-chat/openAiContact.js";
import { findCurrentSection } from "@/modules/learn/pathResume.js";
import {
  buildStatusMap,
  countUnreadArticles,
} from "@/modules/news/newsReadingStatus.js";
import {
  buildArticleReviewSessionWords,
  buildDueWordKeySet,
} from "@/modules/news/newsReadingStatus.js";
import AchievementUnlockBanner from "@/modules/achievements/AchievementUnlockBanner.vue";
import { notifyAchievementUnlocks } from "@/modules/achievements/achievementUnlockDetect.js";
import {
  VOCAB_MILESTONE_CELEBRATION_KEY,
  vocabMilestoneReached,
} from "@/modules/learn/vocabMilestones.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import {
  applyReviewStreak,
  reviewDailyGoalCelebration,
  reviewDailyGoalContributed,
  reviewDailyGoalNudge,
  reviewStreakCelebration,
} from "@/shared/reviewStreak.js";
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
} from "./vocabReviewContinuation.js";
import {
  mergeArticlesWithStatus,
  pickBestArticleForLessonWords,
} from "@/modules/news/lessonArticleMatch.js";
import { saveRecentLessonWords } from "@/modules/path/recentLessonWords.js";
import {
  buildPostVocabReviewPlan,
  isAiPracticeStep,
  isContinueReviewStep,
  pickWordsForArticleMatch,
} from "./postVocabReviewPlan.js";
import {
  planHasAiPracticeStep,
  PENDING_SOURCES,
  savePendingAiPractice,
} from "@/modules/ai-chat/pendingAiPractice.js";
import {
  isVocabSwipeTap,
  shouldAbortVocabSwipe,
  vocabSwipeDragStyle,
  vocabSwipeHintOpacity,
  vocabSwipeRating,
} from "./vocabSwipeRating.js";
import {
  VOCAB_CARD_MODES,
  buildClozeContextParts,
  canRateCard,
  clozeAriaLabel,
  isRecallCardMode,
  resolveVocabCardMode,
  shouldHideTargetOnFront,
} from "./vocabRecallMode.js";
import {
  highlightWordInContext,
  isFromReadingSession,
  pickReviewContext,
} from "./vocabReviewContext.js";
import {
  buildContextRevisitAction,
  contextReinforcementCopy,
  shouldOfferContextReinforcement,
} from "./contextReinforcementNudge.js";
import {
  clearVocabReviewResume,
  loadVocabReviewResume,
  resolveVocabReviewResumeIndex,
  shouldShowContextRevisitLink,
} from "./vocabContextRevisit.js";
import {
  vocabDisplayDotStates,
  vocabDisplayStageLabel,
  vocabJustFilledDotIndex,
  vocabRatingFeedback,
} from "./vocabReviewMastery.js";

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const targetLangStore = useTargetLangStore();

const loading = ref(true);
const error = ref("");
const words = ref([]);
const index = ref(0);
const flipped = ref(false);
const revealed = ref(false);
const cardRated = ref(false);
const ratingAck = ref(null);
const pendingRatedMastery = ref(null);
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
const settlementUnlockBadges = ref([]);
const reviewResult = ref(null);
const remainingDue = ref(0);
const checkingRemaining = ref(false);
const continuing = ref(false);
const userId = ref("");
const nativeLang = ref("zh");
const cefr = ref("A1");
const targetLang = ref("es");
const readingSessionMode = ref(false);
const sessionWordCount = ref(0);
const sessionContextMap = ref(new Map());
const resumeTarget = ref(null);
const newsUnreadCount = ref(0);
const articleMatch = ref(null);
const sourceArticleId = ref(null);
const reviewedWordEntries = ref([]);
const sessionRatings = ref(new Map());
const planContextReady = ref(false);
const openingAiPractice = ref(false);

const currentWord = computed(() => words.value[index.value] || null);

const speechLanguage = computed(
  () => currentWord.value?.language ?? targetLang.value,
);

let autoPlayTimer = null;

function clearAutoPlayTimer() {
  if (autoPlayTimer) {
    clearTimeout(autoPlayTimer);
    autoPlayTimer = null;
  }
}

function scheduleFlipAutoPlay() {
  clearAutoPlayTimer();
  if (!shouldAutoPlayWordSpeech({ showResult: acting.value })) return;
  autoPlayTimer = setTimeout(() => {
    autoPlayTimer = null;
    if (!currentWord.value || !flipped.value || acting.value) return;
    void speakWord(currentWord.value.word, speechLanguage.value);
  }, WORD_SPEECH_AUTO_PLAY_MS);
}

const progress = computed(() => sessionProgress(index.value, words.value.length));

const progressPct = computed(() =>
  sessionProgressPct(index.value, words.value.length, {
    answered: cardRated.value,
  }),
);

const definitionText = computed(() =>
  vocabDefinition(currentWord.value, nativeLang.value),
);

const reviewContextText = computed(() =>
  pickReviewContext(currentWord.value, sessionContextMap.value),
);

const reviewContextParts = computed(() =>
  highlightWordInContext(reviewContextText.value, currentWord.value?.word),
);

const cardMode = computed(() =>
  resolveVocabCardMode(currentWord.value, {
    index: index.value,
    sessionContextMap: sessionContextMap.value,
    mastery: currentWord.value?.mastery,
    readingSessionMode: readingSessionMode.value,
    nativeLang: nativeLang.value,
  }),
);

const isRecallMode = computed(() => isRecallCardMode(cardMode.value));

const clozeParts = computed(() =>
  buildClozeContextParts(reviewContextText.value, currentWord.value?.word),
);

const clozeAriaText = computed(() =>
  clozeAriaLabel(reviewContextText.value, currentWord.value?.word, t("vocab.recallBlankAria")),
);

const showWordSpeech = computed(
  () => !shouldHideTargetOnFront(cardMode.value) || revealed.value,
);

const canRateCurrentCard = computed(() =>
  canRateCard({
    mode: cardMode.value,
    flipped: flipped.value,
    revealed: revealed.value,
    acting: acting.value,
    ratingAck: ratingAck.value,
  }),
);

const showRevealButton = computed(
  () => isRecallMode.value && !revealed.value && !acting.value && !ratingAck.value,
);

const cardAriaLabel = computed(() => {
  if (canRateCurrentCard.value) return t("vocab.reviewTapToHide");
  if (isRecallMode.value) return t("vocab.recallTapToReveal");
  return t("vocab.reviewTapToReveal");
});

const showNewsSourceBadge = computed(() => {
  const word = currentWord.value;
  if (!word?.word) return false;
  if (word.has_user_context) return true;
  if (word.source === "news_reading") return true;
  return (
    readingSessionMode.value &&
    sessionContextMap.value.has(word.word.toLowerCase())
  );
});

const showContextRevisitLink = computed(() =>
  shouldShowContextRevisitLink(currentWord.value),
);

const pendingContextNudge = ref(false);

const contextNudgeCopy = computed(() => {
  if (!pendingContextNudge.value || !currentWord.value) return null;
  return contextReinforcementCopy(currentWord.value, t, sessionContextMap.value);
});

const streakCelebration = computed(() =>
  reviewStreakCelebration(reviewResult.value, t),
);

const dailyGoalCelebration = computed(() =>
  reviewDailyGoalCelebration(reviewResult.value, t),
);

const dailyGoalNudge = computed(() => reviewDailyGoalNudge(reviewResult.value, t));

const dailyGoalContributed = computed(() =>
  reviewDailyGoalContributed(reviewResult.value, t),
);

const vocabMilestoneBanner = computed(() => {
  const milestone = vocabMilestoneReached(
    knownBefore.value,
    knownBefore.value + masteredCount.value,
  );
  if (!milestone) return "";
  return t(VOCAB_MILESTONE_CELEBRATION_KEY, { n: milestone });
});

const reviewedWords = computed(() =>
  words.value.map((entry) => entry.word).filter(Boolean),
);

const vocabReviewPlan = computed(() => {
  if (!finished.value || checkingRemaining.value || !planContextReady.value) {
    return null;
  }
  return buildPostVocabReviewPlan({
    reviewResult: reviewResult.value,
    remainingDue: remainingDue.value,
    fromReading: readingSessionMode.value,
    sessionWordCount: sessionWordCount.value,
    masteredCount: masteredCount.value,
    reviewedWords: reviewedWords.value,
    newsUnreadCount: newsUnreadCount.value,
    resumeTarget: resumeTarget.value,
    articleMatch: articleMatch.value,
    sourceArticleId: sourceArticleId.value,
  });
});

const swipeEnabled = computed(() => canRateCurrentCard.value);

const swipeCardStyle = computed(() => {
  if (!swipeDragging.value || swipeOffsetX.value === 0) return undefined;
  return vocabSwipeDragStyle(swipeOffsetX.value);
});

const swipeHints = computed(() => vocabSwipeHintOpacity(swipeOffsetX.value));

const vocabDots = computed(() =>
  vocabDisplayDotStates(currentWord.value?.mastery, {
    ratedMastery: pendingRatedMastery.value,
  }),
);

const vocabJustFilledDot = computed(() =>
  vocabJustFilledDotIndex(currentWord.value?.mastery, {
    ratedMastery: pendingRatedMastery.value,
  }),
);

const vocabStageLabelText = computed(() =>
  vocabDisplayStageLabel(currentWord.value?.mastery, t, {
    ratedMastery: pendingRatedMastery.value,
  }),
);

const vocabScheduleText = computed(() => {
  if (!ratingAck.value || pendingRatedMastery.value == null) return "";
  return vocabRatingFeedback(
    currentWord.value?.mastery,
    pendingRatedMastery.value,
    t,
  );
});

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
  if (isRecallMode.value && !revealed.value) return;
  flipped.value = !flipped.value;
  if (cardMode.value === VOCAB_CARD_MODES.CLASSIC) {
    revealed.value = flipped.value;
  }
}

function revealAnswer() {
  if (!currentWord.value || revealed.value) return;
  revealed.value = true;
  flipped.value = true;
  scheduleFlipAutoPlay();
}

watch(flipped, (isFlipped) => {
  if (isFlipped) scheduleFlipAutoPlay();
});

watch(index, () => {
  clearAutoPlayTimer();
  globalThis.speechSynthesis?.cancel();
});

function onCardClick() {
  if (swipeConsumed.value) {
    swipeConsumed.value = false;
    return;
  }
  toggleFlip();
}

function resetCard() {
  flipped.value = false;
  revealed.value = false;
  cardRated.value = false;
  ratingAck.value = null;
  pendingRatedMastery.value = null;
  pendingContextNudge.value = false;
  resetSwipeState();
  swipeConsumed.value = false;
}

function buildSessionContextMap(sessionWords) {
  return new Map(
    sessionWords.map((entry) => [entry.word.toLowerCase(), entry.context]),
  );
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

    let sessionWords = [];
    if (isFromReadingSession(route)) {
      sessionWords = peekReadingSessionWords();
      if (sessionWords.length) {
        readingSessionMode.value = true;
        sessionWordCount.value = sessionWords.length;
        sessionContextMap.value = buildSessionContextMap(sessionWords);
        sourceArticleId.value = resolveSourceArticleId(sessionWords);
        consumeReadingSessionWords();
      } else {
        const articleId = Number(route.query.articleId);
        if (Number.isFinite(articleId) && articleId > 0) {
          const [statusRow] = await getArticlesReadingStatus(ctx.user.id, [articleId]);
          const candidateWords = buildArticleReviewSessionWords(statusRow, articleId);
          if (candidateWords.length) {
            const masteryEntries = await lookupWordsMastery(
              ctx.user.id,
              candidateWords.map((entry) => entry.word),
              ctx.targetLang,
            );
            const dueKeys = buildDueWordKeySet(masteryEntries);
            sessionWords = candidateWords.filter((entry) =>
              dueKeys.has(entry.word.toLowerCase()),
            );
          }
        }
        if (sessionWords.length) {
          readingSessionMode.value = true;
          sessionWordCount.value = sessionWords.length;
          sessionContextMap.value = buildSessionContextMap(sessionWords);
          sourceArticleId.value = resolveSourceArticleId(sessionWords);
        } else {
          readingSessionMode.value = false;
          sessionWordCount.value = 0;
          sessionContextMap.value = new Map();
          sourceArticleId.value = null;
        }
      }
    } else {
      readingSessionMode.value = false;
      sessionWordCount.value = 0;
      sessionContextMap.value = new Map();
      sourceArticleId.value = null;
    }

    const fetchLimit = sessionWords.length
      ? Math.max(REVIEW_SESSION_LIMIT + sessionWords.length, 50)
      : REVIEW_SESSION_LIMIT;

    const [dueWords, stats] = await Promise.all([
      getUnknownWords(ctx.user.id, ctx.cefr, fetchLimit, ctx.targetLang),
      getUserVocabStats(ctx.user.id, ctx.targetLang),
    ]);

    words.value = sessionWords.length
      ? buildReadingReviewQueue(sessionWords, dueWords, REVIEW_SESSION_LIMIT)
      : dueWords.slice(0, REVIEW_SESSION_LIMIT);
    knownBefore.value = stats?.total_known ?? 0;
    index.value = 0;
    finished.value = false;
    masteredCount.value = 0;
    reviewResult.value = null;
    remainingDue.value = 0;
    checkingRemaining.value = false;
    continuing.value = false;
    resumeTarget.value = null;
    newsUnreadCount.value = 0;
    articleMatch.value = null;
    reviewedWordEntries.value = [];
    sessionRatings.value = new Map();
    planContextReady.value = false;
    openingAiPractice.value = false;
    resetCard();
    applyVocabReviewResume();
  } catch {
    error.value = t("common.fail");
    words.value = [];
  } finally {
    loading.value = false;
  }
}

function applyVocabReviewResume() {
  const resume = loadVocabReviewResume();
  if (!resume) return;
  const targetIndex = resolveVocabReviewResumeIndex(words.value, resume);
  clearVocabReviewResume();
  if (targetIndex == null) return;
  index.value = targetIndex;
  if (resume.flipped) flipped.value = true;
}

function goToContextArticle() {
  const route = buildContextRevisitAction({
    word: currentWord.value,
    sessionContextMap: sessionContextMap.value,
    resume: {
      index: index.value,
      flipped: flipped.value,
      wordId: currentWord.value?.id,
    },
  });
  if (route) router.push(route);
}

function acceptContextNudge() {
  pendingContextNudge.value = false;
  goToContextArticle();
}

function skipContextNudge() {
  proceedToNextCard();
}

async function resolveCurrentWordId() {
  const word = currentWord.value;
  if (!word) return null;
  if (word.id != null) return word.id;
  const ids = await lookupWordIds([word.word], targetLang.value);
  return ids[0] ?? null;
}

async function advanceAfterMark(mastery) {
  if (!currentWord.value || acting.value) return;
  cardRated.value = true;
  pendingRatedMastery.value = mastery;
  ratingAck.value = vocabRatingAckKind(mastery);
  playVocabRatingFeedback(mastery);
  acting.value = true;
  try {
    const wordId = await resolveCurrentWordId();
    await waitVocabRatingAck();
    if (wordId != null) {
      await updateWordMastery(userId.value, wordId, mastery, "vocab_flashcard");
    }
    if (mastery >= 2) masteredCount.value += 1;
    if (currentWord.value?.word) {
      sessionRatings.value.set(String(currentWord.value.word).toLowerCase(), mastery);
    }
  } catch {
    // Still advance — local session should not block on a single failure.
  } finally {
    acting.value = false;
  }

  if (shouldOfferContextReinforcement(currentWord.value, mastery)) {
    pendingContextNudge.value = true;
    return;
  }
  proceedToNextCard();
}

function proceedToNextCard() {
  pendingContextNudge.value = false;
  const nextIndex = index.value + 1;
  if (isSessionComplete(nextIndex, words.value.length)) {
    void finishReviewSession();
    return;
  }
  index.value = nextIndex;
  resetCard();
}

async function finishReviewSession() {
  finished.value = true;
  if (readingSessionMode.value) {
    clearPendingReadingVocab();
  }
  reviewedWordEntries.value = snapshotReviewedWordEntries();
  reviewResult.value = await applyReviewStreak(userId.value, words.value.length, {
    sessionComplete: true,
    targetLanguage: targetLang.value,
  });
  settlementUnlockBadges.value = notifyAchievementUnlocks({
    vocabStats: { total_known: knownBefore.value + masteredCount.value },
  });
  await Promise.all([refreshRemainingDue(), loadPostReviewContext()]);
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

function regionForLang(lang) {
  switch (lang) {
    case "zh":
      return "CN";
    case "en":
      return "US";
    case "es":
      return "ES";
    default:
      return "CN";
  }
}

function resolveSourceArticleId(sessionWords = []) {
  const fromQuery = Number(route.query.articleId);
  if (Number.isFinite(fromQuery) && fromQuery > 0) return fromQuery;
  for (const entry of sessionWords) {
    if (entry?.articleId != null) return entry.articleId;
  }
  for (const entry of words.value) {
    if (entry?.articleId != null) return entry.articleId;
  }
  return null;
}

function snapshotReviewedWordEntries() {
  return words.value.map((entry) => ({
    word: entry.word,
    mastery:
      sessionRatings.value.get(String(entry.word).toLowerCase()) ??
      entry.mastery ??
      null,
    articleId: entry.articleId ?? null,
  }));
}

async function loadPostReviewNewsContext(entries, excludeArticleId) {
  try {
    const articles = await getArticles(regionForLang(targetLang.value));
    if (!articles.length) {
      newsUnreadCount.value = 0;
      articleMatch.value = null;
      return;
    }
    const ids = articles.map((article) => article.id).filter((id) => id != null);
    const rows = await getArticlesReadingStatus(userId.value, ids);
    const map = buildStatusMap(rows);
    const merged = mergeArticlesWithStatus(articles, map);
    newsUnreadCount.value = countUnreadArticles(map, articles);

    const reviewedWords = entries.map((entry) => entry.word).filter(Boolean);
    const wordPool = pickWordsForArticleMatch({
      reviewedWordEntries: entries,
      reviewedWords,
    });
    if (wordPool.length < 2) {
      articleMatch.value = null;
      return;
    }

    saveRecentLessonWords({
      words: wordPool,
      pairKey: `${nativeLang.value}:${targetLang.value}:${cefr.value}`,
    });

    articleMatch.value = pickBestArticleForLessonWords(merged, wordPool, {
      minOverlap: 1,
      excludeArticleId,
    });
  } catch {
    newsUnreadCount.value = 0;
    articleMatch.value = null;
  }
}

async function loadPostReviewContext() {
  planContextReady.value = false;
  try {
    const curriculum = await getPathCurriculum(
      nativeLang.value,
      targetLang.value,
      cefr.value,
    );
    resumeTarget.value = findCurrentSection(curriculum);
    await loadPostReviewNewsContext(
      reviewedWordEntries.value,
      sourceArticleId.value,
    );
  } catch {
    resumeTarget.value = null;
    newsUnreadCount.value = 0;
    articleMatch.value = null;
  } finally {
    planContextReady.value = true;
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

function stepTitle(step) {
  if (!step?.titleKey) return "";
  return t(step.titleKey, step.titleParams ?? {});
}

function stepSubtitle(step) {
  if (!step?.subtitleKey) return "";
  return t(step.subtitleKey, step.subtitleParams ?? {});
}

function stepContinueLabel(step) {
  if (!step?.continueKey) return t("vocab.reviewBack");
  return t(step.continueKey, step.continueParams ?? {});
}

async function goToVocabStep(step) {
  if (!step) return;
  if (isContinueReviewStep(step)) {
    await continueReview();
    return;
  }
  if (isAiPracticeStep(step)) {
    openingAiPractice.value = true;
    try {
      await openAiContact(
        router,
        { name: t("chat.amiga"), contactType: "amiga" },
        {
          targetLang: targetLang.value,
          starterId: "reviewed-words",
          starterParams: {
            words: (step.reviewedWords ?? reviewedWords.value).join(", "),
            from: readingSessionMode.value ? "reading" : "vocab",
          },
        },
      );
    } finally {
      openingAiPractice.value = false;
    }
    return;
  }
  if (step.route) {
    router.replace(step.route);
  }
}

function exitReview() {
  const plan = vocabReviewPlan.value;
  if (planHasAiPracticeStep(plan) && reviewedWords.value.length >= 3) {
    savePendingAiPractice({
      source: readingSessionMode.value ? PENDING_SOURCES.READING : PENDING_SOURCES.VOCAB,
      words: reviewedWords.value,
    });
  }
  if (window.history.length > 1) {
    router.back();
    return;
  }
  router.push({ name: "learn" });
}

onMounted(load);

onUnmounted(() => {
  clearAutoPlayTimer();
  globalThis.speechSynthesis?.cancel();
});
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

.daily-goal-banner {
  margin: 12px 0 0;
  padding: 12px 16px;
  background: var(--green-bg);
  color: var(--green-hover);
  border-radius: var(--radius-md);
  font-weight: 700;
}

.daily-goal-banner.is-nudge {
  background: linear-gradient(135deg, #fff8e6 0%, #ffefcc 100%);
  color: #8a6200;
  border: 1px solid #e6b84d;
}

.vocab-milestone-banner {
  margin: 12px 0 0;
  padding: 12px 16px;
  background: #e8f8ef;
  color: #1f6b47;
  border-radius: var(--radius-md);
  font-weight: 700;
}

.next-steps-panel {
  width: 100%;
  margin: 12px 0 0;
  padding: 14px 16px 16px;
  background: linear-gradient(135deg, #e8f8ef 0%, #d4f5e0 100%);
  border: 1px solid var(--green);
  border-radius: var(--radius-md);
  text-align: left;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.next-steps-eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--green-hover);
}

.next-steps-primary {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 8px;
}

.next-steps-icon {
  font-size: 28px;
  line-height: 1;
  flex-shrink: 0;
}

.next-steps-copy {
  flex: 1;
  min-width: 0;
}

.next-steps-primary-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.3;
}

.next-steps-primary-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-light);
  line-height: 1.4;
}

.next-steps-queue {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(88, 204, 2, 0.25);
}

.next-steps-queue-title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-light);
}

.next-steps-queue-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  margin: 0;
  padding: 10px 0;
  border: none;
  border-bottom: 1px solid var(--border);
  background: transparent;
  text-align: left;
  font-family: inherit;
  cursor: pointer;
}

.next-steps-queue-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.next-steps-queue-item:disabled {
  cursor: default;
}

.next-steps-queue-icon {
  font-size: 18px;
  line-height: 1.2;
  flex-shrink: 0;
}

.next-steps-queue-copy {
  flex: 1;
  min-width: 0;
}

.next-steps-queue-item-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.3;
}

.next-steps-queue-item-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-lighter);
  line-height: 1.35;
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
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 16px;
  gap: 12px;
}

.flashcard-speech-btn {
  position: absolute;
  top: 28px;
  right: calc(50% - 180px + 8px);
  z-index: 3;
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
  max-height: 100%;
  overflow-y: auto;
}

.flashcard-word {
  font-size: 36px;
  font-weight: 700;
  color: var(--text);
}

.flashcard-word-back {
  font-size: 28px;
}

.recall-mode-badge {
  margin: 0;
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(28, 176, 246, 0.12);
  color: var(--blue);
  font-size: 12px;
  font-weight: 700;
}

.flashcard-cloze {
  width: 100%;
}

.flashcard-cloze-text {
  margin: 0;
  font-size: 18px;
  line-height: 1.55;
  text-align: center;
  color: var(--text);
}

.flashcard-cloze-blank {
  display: inline-block;
  min-width: 3.5em;
  padding: 0 4px;
  border-bottom: 2px dashed var(--blue);
  color: var(--blue);
  font-weight: 700;
  letter-spacing: 0.08em;
}

.flashcard-prompt {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.4;
  text-align: center;
  color: var(--text);
}

.recall-reveal-btn {
  flex: 1;
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

.flashcard-context {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.flashcard-source-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(28, 176, 246, 0.12);
  color: var(--blue);
}

.flashcard-example-row {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 8px;
  width: 100%;
}

.flashcard-example {
  margin: 0;
  flex: 1;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-secondary);
  text-align: center;
}

.flashcard-revisit-link {
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--blue);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.flashcard-context-mark {
  background: rgba(240, 180, 41, 0.35);
  color: inherit;
  border-radius: 3px;
  padding: 0 2px;
}

.summary-reading-session {
  margin: 0;
  font-size: 14px;
  color: var(--blue);
  font-weight: 600;
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
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  background: var(--white);
  border-top: 1px solid var(--border);
}

.review-footer-actions {
  display: flex;
  gap: 10px;
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

.context-reinforce-nudge {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(28, 176, 246, 0.08);
  border: 1px solid rgba(28, 176, 246, 0.2);
}

.context-reinforce-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}

.context-reinforce-snippet {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-secondary);
  font-style: italic;
}

.context-reinforce-hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-lighter);
}

.context-reinforce-actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
</style>