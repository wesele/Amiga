<template>
  <div class="news-reader">
    <!-- Header -->
    <header class="reader-header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <div class="header-info">
        <div class="header-title">{{ article?.original_title }}</div>
        <div class="header-title-translation" v-if="bilingualMode && titleTranslation">{{ titleTranslation }}</div>
        <a
          v-if="article?.source"
          class="header-source"
          :href="article.source"
          target="_blank"
          rel="noopener noreferrer"
          :title="article.source"
          @click.stop.prevent="openSourceUrl(article.source)"
        >{{ formatSource(article.source) }}</a>
      </div>
    </header>

    <div v-if="article?.rewritten_body" class="reading-progress-bar">
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: displayScrollPct + '%' }" />
      </div>
    </div>

    <!-- Loading / Rewrite prompt -->
    <div v-if="!article" class="loading-center">{{ t('news.loading') }}</div>
    <div v-else-if="!article.rewritten_body && !rewriting && !rewriteError" class="rewrite-prompt">
      <p>{{ t('news.rewritePrompt') }}</p>
      <button class="btn-rewrite" @click="doRewrite">{{ t('news.rewriteBtn') }}</button>
    </div>
    <div v-else-if="rewriting" class="loading-center">
      <div class="spinner" />
      <p>{{ t('news.rewriting') }}</p>
    </div>
    <div v-else-if="rewriteError" class="rewrite-prompt">
      <p class="error-text">{{ rewriteError }}</p>
      <button class="btn-rewrite" @click="doRewrite">{{ t('common.retry') }}</button>
    </div>

    <!-- Article body -->
    <div v-else ref="articleBodyRef" class="article-body" @scroll="onArticleScroll">
      <!-- Original mode -->
      <div v-if="!bilingualMode" class="article-text">
        <template v-for="(token, idx) in tokens" :key="idx">
          <span
            v-if="token.isWord"
            class="word"
            :class="resolveWordClass(token)"
            @click.stop="onWordTap(token)"
          >
            {{ token.text }}
          </span>
          <span v-else>{{ token.text }}</span>
        </template>
      </div>

      <!-- Bilingual mode -->
      <div v-else-if="translations.length > 0" class="article-text bilingual">
        <template v-for="(tokens, pidx) in paraTokens" :key="pidx">
          <p class="para-original">
            <template v-for="(token, idx) in tokens" :key="idx">
              <span
                v-if="token.isWord"
                class="word"
                :class="resolveWordClass(token)"
                @click.stop="onWordTap(token)"
              >{{ token.text }}</span>
              <span v-else>{{ token.text }}</span>
            </template>
          </p>
          <p class="para-translation">{{ translations[pidx] || '…' }}</p>
        </template>
      </div>
      <div v-else-if="loadingTranslation" class="loading-center">
        <div class="spinner" />
        <p>{{ t('news.translating') }}</p>
      </div>
      <div v-else class="loading-center">
        <p class="error-text">{{ translationError || t('news.bilingualLoadFail') }}</p>
        <button class="btn-rewrite" @click="loadBilingual">{{ t('common.retry') }}</button>
      </div>
    </div>

    <!-- Word popup -->
    <Transition name="popup">
      <WordPopup
        v-if="selectedWord"
        :word="selectedWord.text"
        :context="selectedWord.context"
        :source-lang="targetLang"
        :native-lang="getLocale()"
        @close="selectedWord = null"
        @known="onWordKnown"
        @unknown="onWordUnknown"
      />
    </Transition>

    <SelectionTranslateOverlay
      :selection-text="selectionText"
      :selection-result="selectionResult"
      :selection-loading="selectionLoading"
      :selection-error="selectionError"
      :show-translate-button="showTranslateButton"
      :translate-button-x="translateButtonX"
      :translate-button-y="translateButtonY"
      :translate-label="t('news.translate')"
      :loading-label="t('news.translating')"
      @clear="clearSelection"
      @translate="onTranslateButtonClick"
    />

    <!-- Word mastery toast -->
    <Transition name="popup">
      <div v-if="wordToast" class="word-toast">{{ wordToast }}</div>
    </Transition>

    <button
      v-if="article?.rewritten_body && wordsUnknownSet.size > 0 && !microReviewOpen"
      type="button"
      class="reading-review-cta"
      @click="goToSessionReview"
    >
      {{ t("news.reviewSessionCta", { n: wordsUnknownSet.size }) }}
    </button>

    <MicroReviewSheet
      :open="microReviewOpen"
      :card="microReviewCard"
      :session-count="wordsUnknownSet.size"
      :index="microReviewIndex"
      :queue-length="microReviewQueue.length"
      :definition="microReviewDefinition"
      :context-label="t('news.microReviewFromArticle')"
      :context-parts="microReviewContextParts"
      :flipped="microReviewFlipped"
      :swipe-enabled="microReviewSwipeEnabled"
      :swipe-dragging="microReviewSwipeDragging"
      :swipe-style="microReviewSwipeStyle"
      :rating-ack="microReviewRatingAck"
      title-key="news.microReviewTitle"
      hint-key="news.microReviewHint"
      continue-key="news.microReviewContinue"
      later-key="news.microReviewLater"
      @card-click="onMicroReviewCardClick"
      @swipe-down="onMicroReviewSwipeDown"
      @swipe-move="onMicroReviewSwipeMove"
      @swipe-up="onMicroReviewSwipeUp"
      @swipe-cancel="onMicroReviewSwipeCancel"
      @continue="collapseMicroReview"
      @later="dismissMicroReview"
    />

    <!-- Fixed bottom bar -->
    <div v-if="article?.rewritten_body" class="bottom-bar">
      <button
        type="button"
        class="legend-toggle"
        :aria-expanded="legendExpanded"
        @click="legendExpanded = !legendExpanded"
      >
        <span>{{ t('news.vocabLegend') }}</span>
        <svg class="legend-chevron" :class="{ 'is-open': legendExpanded }" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
          <path d="M7 10l5 5 5-5z"/>
        </svg>
      </button>
      <div v-if="legendExpanded" class="vocab-legend">
        <span class="legend-item"><span class="legend-dot legend-mastered" />{{ t('news.vocabLegendMastered') }}</span>
        <span class="legend-item"><span class="legend-dot legend-seen" />{{ t('news.vocabLegendSeen') }}</span>
        <span class="legend-item"><span class="legend-dot legend-new" />{{ t('news.vocabLegendNew') }}</span>
      </div>
      <div class="mode-bar">
        <button
          class="mode-btn mode-toggle"
          :class="{ 'is-bilingual': bilingualMode }"
          :title="bilingualMode ? t('news.original') : t('news.bilingual')"
          @click="toggleBilingual"
        >
          <span class="mode-toggle-label">{{ bilingualMode ? t('news.bilingual') : t('news.original') }}</span>
          <svg class="mode-toggle-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M7 10l5 5 5-5z"/>
          </svg>
        </button>
        <button
          type="button"
          class="mode-btn mark-complete-btn"
          @click="markReadingComplete"
        >
          {{ t("news.markComplete") }}
        </button>
        <button
          class="mode-btn share-btn"
          :disabled="sharing"
          :title="t('news.shareTitle')"
          @click="onShare"
        >
          <svg class="share-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
          </svg>
          <span>{{ sharing ? t('news.sharing') : t('news.share') }}</span>
        </button>
      </div>
    </div>

    <!-- Share status toast -->
    <Transition name="popup">
      <div v-if="shareStatus" class="share-toast">{{ shareStatus }}</div>
    </Transition>

    <!-- Reading completion summary -->
    <Transition name="popup">
      <div v-if="showCompletionSummary" class="completion-overlay">
        <div class="completion-sheet summary">
          <div class="summary-emoji">📰</div>
          <h2>{{ t("news.readingCompleteTitle") }}</h2>
          <p v-if="article?.original_title" class="completion-article-title">
            {{ article.original_title }}
          </p>
          <p class="summary-stat">
            {{
              t("news.readingCompleteStats", {
                time: completionTime,
                unknown: wordsUnknownSet.size,
                lookedUp: knownWordIds.size,
              })
            }}
          </p>
          <p v-if="showStreakSaved" class="streak-banner">
            {{ t("news.readingStreakSaved", { n: dailyGoalSnapshot?.streak_current ?? 0 }) }}
          </p>
          <p v-if="showDailyGoalHint" class="daily-goal-hint">
            {{ t("news.readingDailyGoalHint", { remaining: dailyGoalRemaining }) }}
          </p>
          <section v-if="readingPlan" class="next-steps-panel">
            <p class="next-steps-eyebrow">{{ t("path.nextStep.title") }}</p>
            <div class="next-steps-primary">
              <span class="next-steps-icon" aria-hidden="true">{{ readingPlan.primary.icon }}</span>
              <div class="next-steps-copy">
                <p class="next-steps-primary-title">{{ stepTitle(readingPlan.primary) }}</p>
                <p
                  v-if="readingPlan.primary.subtitleKey"
                  class="next-steps-primary-sub"
                >
                  {{ stepSubtitle(readingPlan.primary) }}
                </p>
              </div>
            </div>
            <div v-if="readingPlan.secondary.length" class="next-steps-queue">
              <p class="next-steps-queue-title">
                {{ t("path.nextStep.queueTitle", { n: readingPlan.secondary.length }) }}
              </p>
              <button
                v-for="step in readingPlan.secondary"
                :key="step.id"
                type="button"
                class="next-steps-queue-item"
                :disabled="!step.route && !step.contactAction && !isVocabReviewStep(step)"
                @click="goToReadingStep(step)"
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
          <div v-if="readingPlan" class="summary-actions">
            <button
              type="button"
              class="action-btn primary"
              :disabled="openingAiPractice"
              @click="goToReadingStep(readingPlan.primary)"
            >
              {{ stepContinueLabel(readingPlan.primary) }}
            </button>
            <button
              type="button"
              class="action-btn secondary"
              @click="dismissCompletionSummary"
            >
              {{ t("news.readingCompleteLater") }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import {
  getArticle,
  rewriteArticle,
  saveReadingLog,
  updateWordMastery,
  getBilingual,
  translateText,
  lookupWordIds,
  lookupWordsMastery,
  getUnknownWords,
  ensureWordsSeen,
  addDiscoveredWord,
  shareText as nativeShareText,
  getDailyGoalProgress,
  getArticles,
  getArticlesReadingStatus,
  getPathCurriculum,
} from "@/shared/api.js";
import { openAiContact } from "@/modules/ai-chat/openAiContact.js";
import { findCurrentSection } from "@/modules/learn/pathResume.js";
import WordPopup from "@/shared/components/WordPopup.vue";
import MicroReviewSheet from "@/modules/vocab/MicroReviewSheet.vue";
import SelectionTranslateOverlay from "@/shared/components/SelectionTranslateOverlay.vue";
import { useI18n, getLocale } from "@/shared/i18n";
import { useTargetLangStore, TARGET_LANG_CHANGED } from "@/stores/targetLang.js";
import { eventBus } from "@/shared/eventBus.js";
import { openSourceUrl } from "./utils.js";
import { displayLang } from "@/shared/constants.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import { extractWordTexts, tokenizeArticleText, applyMasteryToTokens } from "./articleText.js";
import { shareArticle } from "./share.js";
import { useSelectionTranslation } from "./selectionTranslation.js";
import { buildMasteryMap, resolveWordClass as resolveWordMasteryClass, wordKey } from "./wordMastery.js";
import { saveReadingSessionSummary, saveReadingProgressToast } from "./readingSession.js";
import {
  buildMicroReviewQueue,
  microReviewNudgeCopy,
  shouldOfferMicroReview,
} from "./readingMicroReview.js";
import {
  clearPendingReadingVocab,
  savePendingReadingVocab,
} from "./pendingReadingVocab.js";
import { vocabDefinition } from "@/modules/vocab/vocabReviewSession.js";
import { highlightWordInContext } from "@/modules/vocab/vocabReviewContext.js";
import { useMicroReviewCard } from "@/modules/vocab/useMicroReviewCard.js";
import {
  playVocabRatingFeedback,
  vocabRatingAckKind,
  waitVocabRatingAck,
} from "@/modules/vocab/vocabRatingFeedback.js";
import {
  computeScrollPct,
  isReadingComplete,
  restoreScrollPosition,
  SCROLL_SAVE_THROTTLE_MS,
} from "./readingProgress.js";
import {
  buildStatusMap,
  countUnreadArticlesExcluding,
  findNextUnreadArticleId,
  serializeUnknownWordEntries,
} from "./newsReadingStatus.js";
import {
  buildPostReadingPlan,
  isAiPracticeStep,
  isVocabReviewStep,
} from "./postReadingPlan.js";
import {
  planHasAiPracticeStep,
  PENDING_SOURCES,
  savePendingAiPractice,
} from "@/modules/ai-chat/pendingAiPractice.js";
import { dailyGoalRemainingLessons } from "@/modules/learn/dailyGoalDisplay.js";
import { formatReadingTime } from "./readingCompletion.js";

const { t } = useI18n();
const props = defineProps({ id: [String, Number] });
const router = useRouter();
const targetLangStore = useTargetLangStore();

const article = ref(null);
const rewriting = ref(false);
const rewriteError = ref("");
const selectedWord = ref(null);
const knownWordIds = ref(new Set());
const wordsKnownSet = ref(new Set());
const wordsUnknownSet = ref(new Set());
const sessionWordsRef = ref([]);
const startTime = ref(Date.now());
let targetLang = "es";
let userId = "";
let currentLevel = "A1";
let unsubscribe = null;

// Bilingual mode state
const bilingualMode = ref(false);
const translations = ref([]);
const paragraphs = ref([]);
const paraTokens = ref([]);
const titleTranslation = ref("");
const loadingTranslation = ref(false);
const translationError = ref("");

// Share state
const sharing = ref(false);
const shareStatus = ref("");
let shareStatusTimer = null;

// Word mastery visualization
const masteryMap = ref(new Map());
const sessionMarkedWords = ref(new Set());
const legendExpanded = ref(false);
const wordToast = ref("");
let wordToastTimer = null;
const sessionMarkTimers = new Map();

const microReviewQueue = ref([]);
const microReviewIndex = ref(0);
const microReviewOpen = ref(false);
const microReviewDismissed = ref(false);
const microReviewCompleted = ref(false);
const microReviewCollapsed = ref(false);
const {
  flipped: microReviewFlipped,
  acting: microReviewActing,
  ratingAck: microReviewRatingAck,
  swipeDragging: microReviewSwipeDragging,
  swipeEnabled: microReviewSwipeEnabled,
  swipeStyle: microReviewSwipeStyle,
  resetCard: resetMicroReviewCard,
  onCardClick: flipMicroReviewCard,
  onSwipeDown: onMicroReviewSwipeDown,
  onSwipeMove: onMicroReviewSwipeMove,
  onSwipeUp: onMicroReviewSwipeUpRaw,
  onSwipeCancel: onMicroReviewSwipeCancel,
} = useMicroReviewCard();

const showCompletionSummary = ref(false);
const dailyGoalSnapshot = ref(null);
const practicedTodayBefore = ref(false);
const resumeTarget = ref(null);
const newsUnreadCount = ref(0);
const nextUnreadArticleId = ref(null);
const openingAiPractice = ref(false);
const articleBodyRef = ref(null);
const displayScrollPct = ref(0);
const userMarkedComplete = ref(false);
const savedReadingStatus = ref(null);
let scrollSaveTimer = null;
let lastPersistedScrollPct = -1;

function onSingleWordSelected(text) {
  const context = articleBodyRef.value?.textContent?.trim() ?? "";
  selectedWord.value = { text, context };
  knownWordIds.value.add(text);
}

const {
  selectionText,
  selectionResult,
  selectionLoading,
  selectionError,
  showTranslateButton,
  translateButtonX,
  translateButtonY,
  onSelectionChange,
  onPointerUp,
  handleNativeTranslate,
  onTranslateButtonClick,
  clearSelection,
  cleanup: cleanupSelectionTranslation,
} = useSelectionTranslation({
  translateText,
  getTargetLang: () => targetLang,
  getNativeLang: () => getLocale(),
  t,
  getSelectionRoot: () => articleBodyRef.value,
  onSingleWordSelected: onSingleWordSelected,
});

const completionElapsedSec = computed(() =>
  Math.round((Date.now() - startTime.value) / 1000),
);

const completionTime = computed(() => formatReadingTime(completionElapsedSec.value));

const showStreakSaved = computed(
  () => !practicedTodayBefore.value && Boolean(dailyGoalSnapshot.value),
);

const dailyGoalRemaining = computed(() =>
  dailyGoalRemainingLessons(dailyGoalSnapshot.value),
);

const showDailyGoalHint = computed(
  () => dailyGoalSnapshot.value && !dailyGoalSnapshot.value.goal_met && dailyGoalRemaining.value > 0,
);

const sessionWords = computed(() => {
  const seen = new Set();
  const words = [];
  for (const word of wordsUnknownSet.value) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    words.push(word);
  }
  for (const word of wordsKnownSet.value) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    words.push(word);
  }
  for (const word of knownWordIds.value) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    words.push(word);
  }
  return words;
});

const sessionWordCount = computed(() => sessionWords.value.length);

const readingPlan = computed(() => {
  if (!showCompletionSummary.value) return null;
  return buildPostReadingPlan({
    unknownCount: wordsUnknownSet.value.size,
    microReviewCompleted: microReviewCompleted.value,
    dailyGoalSnapshot: dailyGoalSnapshot.value,
    resumeTarget: resumeTarget.value,
    nextUnreadArticleId: nextUnreadArticleId.value,
    newsUnreadCount: newsUnreadCount.value,
    sessionWordCount: sessionWordCount.value,
    sessionWords: sessionWords.value,
  });
});

const microReviewCard = computed(() => microReviewQueue.value[microReviewIndex.value] ?? null);

const microReviewDefinition = computed(() =>
  vocabDefinition(microReviewCard.value, getLocale()),
);

const microReviewContextParts = computed(() => {
  const card = microReviewCard.value;
  if (!card?.word) return [];
  const sessionEntry = sessionWordsRef.value.find(
    (entry) => entry.word.toLowerCase() === card.word.toLowerCase(),
  );
  const context = sessionEntry?.context || card.example || "";
  return highlightWordInContext(context, card.word);
});

function onMicroReviewSwipeUp(event) {
  const mastery = onMicroReviewSwipeUpRaw(event);
  if (mastery != null) void rateMicroReviewCard(mastery);
}

function onMicroReviewCardClick() {
  if (!microReviewCard.value) return;
  flipMicroReviewCard();
}

function handleAndroidBackInPage() {
  if (microReviewOpen.value) {
    collapseMicroReview();
    return "navigated";
  }
  if (showCompletionSummary.value) {
    dismissCompletionSummary();
    return "navigated";
  }
  if (tryShowCompletionSummary()) {
    return "navigated";
  }
  return undefined;
}

async function loadSavedReadingStatus() {
  if (!userId) return;
  try {
    const rows = await getArticlesReadingStatus(userId, [Number(props.id)]);
    savedReadingStatus.value = buildStatusMap(rows).get(Number(props.id)) || null;
  } catch {
    savedReadingStatus.value = null;
  }
}

async function restoreSavedScrollPosition() {
  const status = savedReadingStatus.value;
  if (!status || status.completed || !(status.scroll_pct > 0)) return;
  await nextTick();
  restoreScrollPosition(articleBodyRef.value, status.scroll_pct);
  displayScrollPct.value = computeScrollPct(articleBodyRef.value);
}

async function persistReadingProgress({ scrollPct, completed, userMarked } = {}) {
  if (!userId || !article.value) return;
  const pct = scrollPct ?? computeScrollPct(articleBodyRef.value);
  const done = completed ?? isReadingComplete(pct, userMarked ?? userMarkedComplete.value);
  const elapsed = Math.round((Date.now() - startTime.value) / 1000);
  try {
    await saveReadingLog({
      user_id: userId,
      article_id: Number(props.id),
      words_looked_up: JSON.stringify(Array.from(knownWordIds.value)),
      words_known: JSON.stringify(Array.from(wordsKnownSet.value)),
      words_unknown: serializeUnknownWordEntries(sessionWordsRef.value),
      reading_time_sec: elapsed,
      scroll_pct: pct,
      completed: done,
    });
    lastPersistedScrollPct = pct;
  } catch (e) {
    console.error("Failed to save reading log:", e);
  }
}

function onArticleScroll() {
  displayScrollPct.value = computeScrollPct(articleBodyRef.value);
  if (!userId || !article.value?.rewritten_body) return;
  if (scrollSaveTimer) return;
  scrollSaveTimer = setTimeout(() => {
    scrollSaveTimer = null;
    const pct = displayScrollPct.value;
    if (pct === lastPersistedScrollPct) return;
    void persistReadingProgress({ scrollPct: pct, completed: false });
  }, SCROLL_SAVE_THROTTLE_MS);
}

async function markReadingComplete() {
  userMarkedComplete.value = true;
  displayScrollPct.value = 100;
  await persistReadingProgress({ scrollPct: 100, completed: true, userMarked: true });
  tryShowCompletionSummary();
}

onMounted(async () => {
  startTime.value = Date.now();
  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("pointerup", onPointerUp);
  // Android: the system text-selection toolbar calls this global function
  // when the user taps the "翻译" menu item (see MainActivity.kt).
  window.__amigaTranslateSelection = handleNativeTranslate;
  window.__amigaGoBackInPage = handleAndroidBackInPage;
  try {
    const ctx = await loadLearningContext({ targetLangStore });
    userId = ctx.user.id;
    targetLang = ctx.targetLang;
    currentLevel = ctx.cefr;
    await loadSavedReadingStatus();
    try {
      const goal = await getDailyGoalProgress(userId, targetLang);
      dailyGoalSnapshot.value = goal;
      practicedTodayBefore.value = Boolean(goal?.practiced_today);
    } catch {
      dailyGoalSnapshot.value = null;
      practicedTodayBefore.value = false;
    }
    const art = await getArticle(Number(props.id));
    article.value = art;
    if (!art.rewritten_body) {
      await doRewrite();
    } else {
      processArticleWords();
      await restoreSavedScrollPosition();
    }
  } catch (e) {
    console.error("Failed to load article:", e);
  }
  // The reader is bound to a single article; if the user switches target
  // language elsewhere, jump back to the list so NewsList can refetch
  // articles in the new language.
  unsubscribe = eventBus.on(TARGET_LANG_CHANGED, () => {
    if (router.currentRoute.value.path.startsWith("/news/")) {
      router.replace("/news");
    }
  });
});

onBeforeUnmount(async () => {
  if (unsubscribe) unsubscribe();
  document.removeEventListener("selectionchange", onSelectionChange);
  document.removeEventListener("pointerup", onPointerUp);
  delete window.__amigaTranslateSelection;
  if (window.__amigaGoBackInPage === handleAndroidBackInPage) {
    delete window.__amigaGoBackInPage;
  }
  cleanupSelectionTranslation();
  if (shareStatusTimer) {
    clearTimeout(shareStatusTimer);
    shareStatusTimer = null;
  }
  if (wordToastTimer) {
    clearTimeout(wordToastTimer);
    wordToastTimer = null;
  }
  for (const timer of sessionMarkTimers.values()) {
    clearTimeout(timer);
  }
  sessionMarkTimers.clear();
  if (scrollSaveTimer) {
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer = null;
  }
  if (userId && article.value) {
    const pct = computeScrollPct(articleBodyRef.value);
    const completed = isReadingComplete(pct, userMarkedComplete.value);
    await persistReadingProgress({ scrollPct: pct, completed });
    // Mark article words as "seen" — if not already processed after rewrite.
    if (!wordsProcessed) {
      try {
        const body = article.value?.rewritten_body || article.value?.original_body || "";
        const title = article.value?.original_title || "";
        const allText = `${title} ${body}`;
        const wordTokens = extractWordTexts(allText);
        if (wordTokens.length > 0) {
          await ensureWordsSeen(userId, wordTokens, targetLang);
        }
      } catch (e) {
        console.error("Failed to mark words as seen:", e);
      }
    }
  }
});

// After an article is generated (or loaded already-rewritten), ensure every
// word in the article is tracked for the user. Words already in the CEFR-
// graded vocabulary (A1–C2) are marked as "seen" (mastery=1); words NOT in
// the bank are automatically added to the "D" (Discovered) level and also
// marked seen. This runs automatically — the user does not need to tap
// each unknown word.
let wordsProcessed = false;
async function processArticleWords() {
  if (wordsProcessed || !userId || !article.value) return;
  const body = article.value?.rewritten_body || article.value?.original_body || "";
  const title = article.value?.original_title || "";
  const allText = `${title} ${body}`;
  const wordTokens = extractWordTexts(allText);
  if (wordTokens.length === 0) return;
  try {
    await ensureWordsSeen(userId, wordTokens, targetLang);
    wordsProcessed = true;
    await loadWordMastery(allText);
  } catch (e) {
    console.error("Failed to process article words:", e);
  }
}

async function loadWordMastery(allText) {
  if (!userId) return;
  const body = allText || article.value?.rewritten_body || article.value?.original_body || "";
  const title = article.value?.original_title || "";
  const text = allText ? allText : `${title} ${body}`;
  const wordTokens = extractWordTexts(text);
  if (wordTokens.length === 0) return;
  try {
    const entries = await lookupWordsMastery(userId, wordTokens, targetLang);
    masteryMap.value = buildMasteryMap(entries);
    refreshTokenMastery();
  } catch (e) {
    console.error("Failed to load word mastery:", e);
  }
}

function refreshTokenMastery() {
  if (tokens.value.length > 0) {
    tokens.value = applyMasteryToTokens(tokens.value, masteryMap.value);
  }
  if (paraTokens.value.length > 0) {
    paraTokens.value = paraTokens.value.map((para) =>
      applyMasteryToTokens(para, masteryMap.value),
    );
  }
}

function resolveWordClass(token) {
  return resolveWordMasteryClass(token, masteryMap.value, sessionMarkedWords.value);
}

function setLocalMastery(wordText, mastery) {
  const key = wordKey(wordText);
  const next = new Map(masteryMap.value);
  next.set(key, mastery);
  masteryMap.value = next;
  refreshTokenMastery();
}

function markSessionUnknown(wordText) {
  const key = wordKey(wordText);
  const next = new Set(sessionMarkedWords.value);
  next.add(key);
  sessionMarkedWords.value = next;

  const existing = sessionMarkTimers.get(key);
  if (existing) clearTimeout(existing);
  sessionMarkTimers.set(
    key,
    setTimeout(() => {
      const cleared = new Set(sessionMarkedWords.value);
      cleared.delete(key);
      sessionMarkedWords.value = cleared;
      sessionMarkTimers.delete(key);
    }, 2000),
  );
}

function showWordToast(msg) {
  wordToast.value = msg;
  if (wordToastTimer) clearTimeout(wordToastTimer);
  wordToastTimer = setTimeout(() => {
    wordToast.value = "";
    wordToastTimer = null;
  }, 2500);
}

function savePendingVocabIfNeeded() {
  if (wordsUnknownSet.value.size === 0 || microReviewCompleted.value) return;
  savePendingReadingVocab({
    entries: sessionWordsRef.value,
    articleTitle: article.value?.original_title || "",
    articleId: article.value?.id,
  });
}

async function prepareMicroReviewQueue() {
  try {
    const dueWords = await getUnknownWords(userId, currentLevel, 50, targetLang);
    const queue = buildMicroReviewQueue(sessionWordsRef.value, dueWords);
    if (!queue.length) {
      microReviewQueue.value = [];
      return;
    }
    const masteryEntries = await lookupWordsMastery(
      userId,
      queue.map((entry) => entry.word),
      targetLang,
    );
    const masteryByWord = new Map(
      masteryEntries.map((entry) => [entry.word?.toLowerCase(), entry]),
    );
    microReviewQueue.value = queue.map((entry) => ({
      ...masteryByWord.get(entry.word.toLowerCase()),
      ...entry,
      word: entry.word,
    }));
  } catch {
    microReviewQueue.value = buildMicroReviewQueue(sessionWordsRef.value, []);
  }
}

async function maybeOpenMicroReview() {
  if (
    microReviewOpen.value ||
    microReviewCollapsed.value ||
    !shouldOfferMicroReview({
      sessionWordCount: wordsUnknownSet.value.size,
      sheetDismissed: microReviewDismissed.value,
      sheetCompleted: microReviewCompleted.value,
    })
  ) {
    return;
  }
  await prepareMicroReviewQueue();
  if (!microReviewQueue.value.length) return;
  microReviewIndex.value = 0;
  microReviewOpen.value = true;
  resetMicroReviewCard();
}

function collapseMicroReview() {
  microReviewCollapsed.value = true;
  microReviewOpen.value = false;
}

function dismissMicroReview() {
  savePendingVocabIfNeeded();
  microReviewDismissed.value = true;
  microReviewOpen.value = false;
}

async function rateMicroReviewCard(mastery) {
  const card = microReviewCard.value;
  if (!card || microReviewActing.value) return;
  microReviewActing.value = true;
  microReviewRatingAck.value = vocabRatingAckKind(mastery);
  playVocabRatingFeedback(mastery);
  try {
    await waitVocabRatingAck();
    let wordId = card.id;
    if (wordId == null) {
      const ids = await lookupWordIds([card.word], targetLang);
      wordId = ids[0] ?? null;
    }
    if (wordId != null) {
      await updateWordMastery(userId, wordId, mastery, "vocab_flashcard");
    }
    setLocalMastery(card.word, mastery);
  } catch {
    /* continue advancing */
  } finally {
    microReviewActing.value = false;
  }

  const reviewedCount = microReviewIndex.value + 1;
  const nextIndex = reviewedCount;
  if (nextIndex >= microReviewQueue.value.length) {
    microReviewCompleted.value = true;
    microReviewOpen.value = false;
    clearPendingReadingVocab();
    showWordToast(t("news.microReviewComplete", { n: reviewedCount }));
    return;
  }
  microReviewIndex.value = nextIndex;
  resetMicroReviewCard();
}

async function doRewrite() {
  rewriting.value = true;
  rewriteError.value = "";
  try {
    const result = await rewriteArticle(Number(props.id), currentLevel, userId, targetLang);
    article.value = result;
    processArticleWords();
  } catch (e) {
    console.error("Failed to rewrite article:", e);
    rewriteError.value = typeof e === "string" ? e : (e?.message || t("news.rewriteFail"));
  } finally {
    rewriting.value = false;
  }
}

async function toggleBilingual() {
  bilingualMode.value = !bilingualMode.value;
  if (bilingualMode.value && translations.value.length === 0) {
    await loadBilingual();
  }
}

async function loadBilingual() {
  loadingTranslation.value = true;
  translationError.value = "";
  try {
    // Split body into paragraphs
    const body = article.value?.rewritten_body || article.value?.original_body || "";
    paragraphs.value = body.split("\n\n").map(p => p.trim()).filter(p => p);
    paraTokens.value = paragraphs.value.map((p) =>
      applyMasteryToTokens(tokenizeArticleText(p), masteryMap.value),
    );
    const result = await getBilingual(Number(props.id), targetLang, getLocale());
    translations.value = result;
    // Translate title
    const title = article.value?.original_title || "";
    if (title) {
      try {
        titleTranslation.value = await translateText(title, targetLang, getLocale());
      } catch (_) {
        titleTranslation.value = "";
      }
    }
  } catch (e) {
    console.error("Failed to load bilingual:", e);
    translationError.value = typeof e === "string" ? e : (e?.message || t("news.bilingualLoadFail"));
  } finally {
    loadingTranslation.value = false;
  }
}

// Tokenize article body
const tokens = ref([]);
function parseText(text) {
  tokens.value = applyMasteryToTokens(tokenizeArticleText(text), masteryMap.value);
}

watch(() => article.value?.rewritten_body, async (val) => {
  if (val) {
    parseText(val);
    await restoreSavedScrollPosition();
  }
});

watch(() => article.value?.original_body, (val) => {
  if (val && !article.value?.rewritten_body) parseText(val);
});

function onWordTap(token) {
  if (!token.isWord) return;
  // If there's an active multi-character text selection, this click likely
  // resulted from the user finishing a drag-selection — don't open the word
  // popup; let the selectionchange handler process the selection instead.
  const sel = window.getSelection();
  if (sel && sel.toString().trim().length > 0) return;
  selectedWord.value = token;
  knownWordIds.value.add(token.text);
}

async function onWordKnown() {
  if (selectedWord.value) {
    const wordText = selectedWord.value.text;
    knownWordIds.value.add(wordText);
    wordsKnownSet.value.add(wordText);
    try {
      const ids = await lookupWordIds([wordText], targetLang);
      if (ids.length > 0) {
        await updateWordMastery(userId, ids[0], 2, "news_reading");
      } else {
        const newId = await addDiscoveredWord(userId, wordText, targetLang, selectedWord.value.context);
        await updateWordMastery(userId, newId, 2, "news_reading");
      }
      setLocalMastery(wordText, 2);
      showWordToast(t("news.wordMarkedKnown"));
    } catch (_) {}
  }
  selectedWord.value = null;
}

function upsertSessionWord(wordText, context) {
  const articleId = article.value?.id;
  const key = wordText.toLowerCase();
  const entry = { word: wordText, context, articleId };
  const existingIndex = sessionWordsRef.value.findIndex(
    (item) => item.word.toLowerCase() === key,
  );
  if (existingIndex >= 0) {
    sessionWordsRef.value[existingIndex] = entry;
  } else {
    sessionWordsRef.value.push(entry);
  }
}

function buildSessionPayload() {
  return {
    unknownCount: wordsUnknownSet.value.size,
    words: sessionWordsRef.value,
  };
}

async function onWordUnknown() {
  if (selectedWord.value) {
    const wordText = selectedWord.value.text;
    knownWordIds.value.add(wordText);
    wordsUnknownSet.value.add(wordText);
    upsertSessionWord(wordText, selectedWord.value.context);
    try {
      const ids = await lookupWordIds([wordText], targetLang);
      if (ids.length > 0) {
        await updateWordMastery(userId, ids[0], 1, "news_reading");
      } else {
        await addDiscoveredWord(userId, wordText, targetLang, selectedWord.value.context);
      }
      setLocalMastery(wordText, 1);
      markSessionUnknown(wordText);
      const nudge = microReviewNudgeCopy(wordsUnknownSet.value.size, t);
      showWordToast(nudge || t("news.wordMarkedUnknown"));
      await maybeOpenMicroReview();
    } catch (_) {}
  }
  selectedWord.value = null;
}

function showShareStatus(msg) {
  shareStatus.value = msg;
  if (shareStatusTimer) clearTimeout(shareStatusTimer);
  shareStatusTimer = setTimeout(() => { shareStatus.value = ""; }, 2500);
}

async function onShare() {
  if (!article.value || sharing.value) return;
  sharing.value = true;
  try {
    const locale = getLocale();
    await shareArticle({
      article: article.value,
      targetLabel: displayLang(targetLang, locale),
      t,
      nativeShareText,
      showShareStatus,
    });
  } finally {
    sharing.value = false;
  }
}

function goToSessionReview() {
  microReviewOpen.value = false;
  if (wordsUnknownSet.value.size > 0) {
    saveReadingSessionSummary(buildSessionPayload());
  }
  clearPendingReadingVocab();
  router.push({ name: "vocab-review", query: { from: "reading" } });
}

function navigateBack() {
  const parent = router.currentRoute.value?.meta?.parent;
  if (parent) {
    router.replace({ name: parent });
  } else {
    router.replace("/news");
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

async function loadPostReadingContext() {
  const currentArticleId = Number(props.id);
  try {
    const curriculum = await getPathCurriculum(getLocale(), targetLang, currentLevel);
    resumeTarget.value = findCurrentSection(curriculum);

    const articles = await getArticles(regionForLang(targetLang));
    if (!articles.length) {
      newsUnreadCount.value = 0;
      nextUnreadArticleId.value = null;
      return;
    }
    const ids = articles.map((article) => article.id).filter((id) => id != null);
    const rows = await getArticlesReadingStatus(userId, ids);
    const statusMap = buildStatusMap(rows);
    newsUnreadCount.value = countUnreadArticlesExcluding(statusMap, articles, currentArticleId);
    nextUnreadArticleId.value = findNextUnreadArticleId(articles, statusMap, currentArticleId);
  } catch {
    resumeTarget.value = null;
    newsUnreadCount.value = 0;
    nextUnreadArticleId.value = null;
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
  if (!step?.continueKey) return t("news.readingCompleteNext");
  return t(step.continueKey, step.continueParams ?? {});
}

async function goToReadingStep(step) {
  if (!step) return;
  if (isVocabReviewStep(step)) {
    completeAndReview();
    return;
  }
  if (isAiPracticeStep(step)) {
    openingAiPractice.value = true;
    try {
      await openAiContact(
        router,
        { name: t("chat.amiga"), contactType: "amiga" },
        {
          targetLang,
          starterId: "reviewed-words",
          starterParams: {
            words: (step.sessionWords ?? sessionWords.value).join(", "),
            from: "reading",
          },
        },
      );
    } finally {
      openingAiPractice.value = false;
    }
    return;
  }
  if (step.route) {
    showCompletionSummary.value = false;
    router.replace(step.route);
  }
}

function tryShowCompletionSummary() {
  if (showCompletionSummary.value) return true;
  if (!article.value?.rewritten_body) return false;
  const scrollPct = computeScrollPct(articleBodyRef.value);
  const completed = isReadingComplete(scrollPct, userMarkedComplete.value);
  if (!completed) return false;
  showCompletionSummary.value = true;
  void loadPostReadingContext();
  return true;
}

function dismissCompletionSummary() {
  const plan = readingPlan.value;
  if (planHasAiPracticeStep(plan) && sessionWords.value.length >= 3) {
    savePendingAiPractice({
      source: PENDING_SOURCES.READING,
      words: sessionWords.value,
      articleTitle: article.value?.original_title || "",
    });
  }
  savePendingVocabIfNeeded();
  showCompletionSummary.value = false;
  navigateBack();
}

function completeAndReview() {
  showCompletionSummary.value = false;
  goToSessionReview();
}

async function goBack() {
  if (microReviewOpen.value) {
    collapseMicroReview();
    return;
  }
  if (tryShowCompletionSummary()) return;
  const scrollPct = computeScrollPct(articleBodyRef.value);
  if (wordsUnknownSet.value.size > 0 && !microReviewCompleted.value) {
    savePendingVocabIfNeeded();
  }
  if (article.value?.rewritten_body && scrollPct > 0) {
    await persistReadingProgress({ scrollPct, completed: false });
    saveReadingProgressToast(scrollPct);
  }
  navigateBack();
}

function formatSource(source) {
  if (!source || source === "sample") return t("news.sample");
  try {
    const url = new URL(source);
    return url.hostname;
  } catch {
    return source?.slice(0, 30) || "";
  }
}
</script>

<style scoped>
.news-reader {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface);
  position: relative;
}

.reader-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 8px 8px 4px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.reading-progress-bar {
  flex-shrink: 0;
  padding: 0 16px 8px;
  border-bottom: 1px solid var(--border);
}

.reading-progress-bar .progress-track {
  height: 4px;
  background: var(--gray-light);
  border-radius: 999px;
  overflow: hidden;
}

.reading-progress-bar .progress-fill {
  height: 100%;
  background: var(--green);
  border-radius: 999px;
  transition: width 0.2s ease;
}

.back-btn {
  width: 44px;
  height: 44px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background var(--transition);
  flex-shrink: 0;
}

.back-btn:hover {
  background: var(--surface-variant);
}

.header-info {
  flex: 1;
  min-width: 0;
}

.header-title {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: break-word;
}

.header-title-translation {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-lighter);
  line-height: 1.3;
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.header-source {
  display: inline-block;
  font-size: 11px;
  color: var(--text-lighter);
  margin-top: 2px;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
  cursor: pointer;
}

.header-source:hover {
  color: var(--green);
}

.loading-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-light);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--green);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.rewrite-prompt {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 40px;
  text-align: center;
  color: var(--text-light);
}

.error-text {
  color: var(--red);
  font-size: 14px;
  max-width: 300px;
  word-break: break-word;
}

.btn-rewrite {
  padding: 12px 32px;
  border-radius: var(--radius-md);
  background: var(--green);
  color: #fff;
  border: none;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: all var(--transition);
}

.btn-rewrite:hover {
  background: var(--green-hover);
}

/* Article text */
.article-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 20px 20px 80px;
}

.article-text {
  font-size: 17px;
  line-height: 2.0;
  color: var(--text);
  overflow-wrap: break-word;
  word-wrap: break-word;
  -webkit-user-select: text;
  -webkit-touch-callout: default;
  user-select: text;
  -webkit-tap-highlight-color: transparent;
  touch-action: auto;
}

.word {
  cursor: pointer;
  padding: 0 1px;
  border-radius: 3px;
  transition: background 0.15s, box-shadow 0.15s;
  white-space: normal;
  -webkit-user-select: text;
  user-select: text;
}

.word-mastered {
  color: var(--text);
}

.word-seen {
  color: var(--blue);
  font-weight: 600;
  background: var(--blue-bg);
}

.word-new {
  color: var(--purple);
  font-weight: 600;
  background: var(--purple-bg);
}

.word-session-marked {
  color: var(--red);
  font-weight: 700;
  background: rgba(255, 75, 75, 0.12);
  box-shadow: inset 3px 0 0 var(--red);
  animation: word-pulse 0.6s ease-out;
}

@keyframes word-pulse {
  0% { background: rgba(255, 75, 75, 0.28); }
  100% { background: rgba(255, 75, 75, 0.12); }
}

.word:hover {
  filter: brightness(0.97);
}

.word-toast {
  position: fixed;
  left: 50%;
  bottom: calc(120px + var(--safe-bottom, env(safe-area-inset-bottom, 0px)));
  transform: translateX(-50%);
  background: var(--text);
  color: #fff;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  z-index: 400;
  max-width: calc(100% - 40px);
  text-align: center;
  box-shadow: var(--shadow-lg);
  line-height: 1.4;
}

.legend-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  margin-bottom: 8px;
  padding: 4px 0;
  border: none;
  background: none;
  color: var(--text-lighter);
  font-size: 11px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}

.legend-chevron {
  transition: transform var(--transition);
}

.legend-chevron.is-open {
  transform: rotate(180deg);
}

.vocab-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px 14px;
  margin-bottom: 10px;
  font-size: 11px;
  color: var(--text-light);
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-mastered {
  background: var(--text);
}

.legend-seen {
  background: var(--blue);
}

.legend-new {
  background: var(--purple);
}

.reading-review-cta {
  flex-shrink: 0;
  margin: 0 16px 8px;
  padding: 12px 16px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--primary);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(28, 176, 246, 0.28);
  transition: transform var(--transition), box-shadow var(--transition);
}

.reading-review-cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(28, 176, 246, 0.34);
}

/* Fixed bottom bar */
.bottom-bar {
  flex-shrink: 0;
  border-top: 1px solid var(--border);
  background: var(--surface);
  padding: 12px 16px;
  padding-bottom: 12px;
}

/* Mode bar */
.mode-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 0;
}

.mode-btn {
  flex: 1;
  padding: 10px 0;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text-light);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.mode-toggle {
  /* The single "原文/双语" toggle. Show the current mode and a
     chevron hint to suggest it can be switched. */
  color: var(--blue);
  border-color: var(--blue);
  background: var(--blue-bg);
  box-shadow: 0 0 0 2px rgba(28, 176, 246, 0.15);
}

.mode-toggle-icon {
  opacity: 0.7;
  margin-top: 1px;
}

.mark-complete-btn {
  color: var(--text-light);
  border-color: var(--border);
  background: var(--surface-variant);
}

.mark-complete-btn:hover {
  color: var(--green);
  border-color: var(--green);
}

.share-btn {
  color: var(--green, #58cc02);
  border-color: var(--green, #58cc02);
  background: var(--green-bg, rgba(88, 204, 2, 0.08));
  box-shadow: 0 0 0 2px rgba(88, 204, 2, 0.12);
}

.share-btn:hover:not(:disabled) {
  background: var(--green-bg, rgba(88, 204, 2, 0.15));
}

.share-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.share-icon {
  flex-shrink: 0;
}

.share-toast {
  position: fixed;
  left: 50%;
  bottom: calc(80px + var(--safe-bottom, env(safe-area-inset-bottom, 0px)));
  transform: translateX(-50%);
  background: var(--text);
  color: #fff;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  z-index: 400;
  max-width: calc(100% - 40px);
  text-align: center;
  box-shadow: var(--shadow-lg);
  line-height: 1.4;
}

/* Bilingual paragraphs */
.bilingual .para-original {
  margin-bottom: 4px;
  overflow-wrap: break-word;
}

.bilingual .para-translation {
  color: var(--text-lighter);
  font-size: 14px;
  line-height: 1.7;
  margin-bottom: 20px;
  padding-left: 12px;
  border-left: 2px solid var(--border);
  overflow-wrap: break-word;
}

/* Selection translate popup */
.sel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 500;
  padding: 20px;
  padding-bottom: calc(20px + 80px);
}

/* Floating "翻译" button that appears over the user's text
   selection. Pure-JS fallback for Android (system selection
   toolbar doesn't have a translate item). */
.translate-fab {
  position: fixed;
  z-index: 600;
  background: var(--purple, #7c3aed);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  border: none;
  border-radius: 18px;
  padding: 6px 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}
.translate-fab:active {
  transform: scale(0.96);
}

.sel-popup {
  background: var(--surface);
  border-radius: var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-sm);
  padding: 20px 24px;
  width: 100%;
  max-width: 360px;
  box-shadow: var(--shadow-lg);
  animation: slideUp 0.2s cubic-bezier(0.2, 0, 0, 1);
  position: relative;
}

.sel-source {
  font-size: 15px;
  color: var(--text-light);
  margin-bottom: 8px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}

.sel-loading {
  font-size: 14px;
  color: var(--text-lighter);
  font-style: italic;
  padding: 4px 0;
}

.sel-result {
  font-size: 17px;
  font-weight: 700;
  color: var(--purple);
  line-height: 1.5;
  padding: 4px 0;
}

.sel-error {
  font-size: 13px;
  color: var(--red);
}

.sel-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 28px;
  height: 28px;
  border: none;
  background: var(--surface-variant);
  border-radius: 50%;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-light);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  transition: background var(--transition);
}

.sel-close:hover {
  background: var(--border);
}

/* Popup transition */
.popup-enter-active,
.popup-leave-active {
  transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
}
.popup-enter-from,
.popup-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.completion-overlay {
  position: fixed;
  inset: 0;
  z-index: 700;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  padding: 20px;
  padding-bottom: calc(20px + var(--safe-bottom, env(safe-area-inset-bottom, 0px)));
}

.completion-sheet {
  width: 100%;
  max-width: 400px;
  padding: 28px 24px 24px;
  background: var(--surface);
  border-radius: var(--radius-lg) var(--radius-lg) var(--radius-md) var(--radius-md);
  box-shadow: var(--shadow-lg);
  text-align: center;
}

.completion-sheet h2 {
  margin: 0;
  font-size: 22px;
}

.completion-article-title {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-lighter);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.summary-stat {
  margin: 12px 0 0;
  font-size: 14px;
  color: var(--text-light);
  line-height: 1.45;
}

.streak-banner {
  margin: 12px 0 0;
  padding: 12px 16px;
  background: var(--orange-bg);
  color: var(--orange-hover);
  border-radius: var(--radius-md);
  font-weight: 700;
  font-size: 14px;
}

.daily-goal-hint {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--text-lighter);
  line-height: 1.4;
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
  margin-top: 18px;
}

.action-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: var(--radius-md);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}

.action-btn.primary {
  background: var(--green);
  color: #fff;
  box-shadow: 0 4px 0 var(--green-hover);
}

.action-btn.secondary {
  background: var(--surface);
  color: var(--text);
  border: 2px solid var(--border);
  box-shadow: none;
}
</style>
