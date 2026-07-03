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

    <div
      v-if="showStaleRewriteBanner"
      class="rewrite-stale-banner"
    >
      <p class="rewrite-stale-text">
        {{
          t("news.rewriteStaleBanner", {
            articleLevel: article?.rewrite_level?.toUpperCase() || "?",
            userLevel: currentLevel,
          })
        }}
      </p>
      <div class="rewrite-stale-actions">
        <button type="button" class="btn-stale-refresh" @click="onStaleRewriteRefresh">
          {{ t("news.rewriteStaleAction", { userLevel: currentLevel }) }}
        </button>
        <button type="button" class="btn-stale-dismiss" @click="dismissStaleRewriteBanner">
          {{ t("news.rewriteStaleDismiss") }}
        </button>
      </div>
    </div>

    <div v-if="article?.rewritten_body && !rewriting" class="reading-progress-bar">
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
      <p>{{ rewritingMessage }}</p>
    </div>
    <div v-else-if="rewriteError && !article.rewritten_body" class="rewrite-prompt">
      <p class="error-text">{{ rewriteError }}</p>
      <button class="btn-rewrite" @click="doRewrite">{{ t('common.retry') }}</button>
    </div>

    <!-- Article body -->
    <div
      v-else-if="article.rewritten_body"
      ref="articleBodyRef"
      class="article-body"
      @scroll="onArticleScroll"
      @click="onArticleBodyClick"
    >
      <!-- Original mode -->
      <div v-if="!bilingualMode" class="article-text">
        <template v-for="(paraTokenList, pidx) in paraTokens" :key="pidx">
          <p
            class="para-original"
            :class="{ 'is-reading': listenAlongActive && listenAlongIndex === pidx }"
          >
            <template v-for="(token, idx) in paraTokenList" :key="idx">
              <span
                v-if="token.isWord"
                class="word"
                :class="[resolveWordClass(token), { 'evidence-highlight': token.inEvidence }]"
                @click.stop="onWordTap(token)"
              >
                {{ token.text }}
              </span>
              <span v-else :class="{ 'evidence-highlight': token.inEvidence }">{{ token.text }}</span>
            </template>
          </p>
        </template>
      </div>

      <!-- Bilingual mode -->
      <div v-else-if="translations.length > 0" class="article-text bilingual">
        <template v-for="(tokens, pidx) in paraTokens" :key="pidx">
          <p
            class="para-original"
            :class="{ 'is-reading': listenAlongActive && listenAlongIndex === pidx }"
          >
            <template v-for="(token, idx) in tokens" :key="idx">
              <span
                v-if="token.isWord"
                class="word"
                :class="[resolveWordClass(token), { 'evidence-highlight': token.inEvidence }]"
                @click.stop="onWordTap(token)"
              >{{ token.text }}</span>
              <span v-else :class="{ 'evidence-highlight': token.inEvidence }">{{ token.text }}</span>
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
      :show-actions="phraseActionsVisible"
      :show-translate-button="showTranslateButton"
      :translate-button-x="translateButtonX"
      :translate-button-y="translateButtonY"
      :translate-label="t('news.translate')"
      :loading-label="t('news.translating')"
      :known-label="t('popup.known')"
      :unknown-label="t('popup.unknown')"
      @clear="clearSelection"
      @translate="onTranslateButtonClick"
      @known="onPhraseKnown"
      @unknown="onPhraseUnknown"
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
      :acting="microReviewActing"
      :speech-language="targetLang"
      title-key="news.microReviewTitle"
      hint-key="news.microReviewHint"
      continue-key="news.microReviewContinue"
      later-key="news.microReviewLater"
      :context-nudge="microReviewContextNudgeCopy"
      @card-click="onMicroReviewCardClick"
      @swipe-down="onMicroReviewSwipeDown"
      @swipe-move="onMicroReviewSwipeMove"
      @swipe-up="onMicroReviewSwipeUp"
      @swipe-cancel="onMicroReviewSwipeCancel"
      @continue="collapseMicroReview"
      @later="dismissMicroReview"
      @context-revisit="onMicroReviewContextRevisit"
      @context-skip="onMicroReviewContextSkip"
    />

    <div
      v-if="comprehensionRevisitActive && article?.rewritten_body"
      class="comprehension-revisit-strip"
    >
      {{ t("news.comprehensionRevisitStrip") }}
    </div>

    <div
      v-if="vocabContextRevisitActive && article?.rewritten_body"
      class="comprehension-revisit-strip"
    >
      {{ t("vocab.contextRevisitStrip") }}
    </div>

    <!-- Fixed bottom bar -->
    <div v-if="article?.rewritten_body" class="bottom-bar">
      <button
        v-if="showComprehensionRetakeChip"
        type="button"
        class="comprehension-retake-chip"
        @click="offerComprehensionRetake"
      >
        {{ t(`news.${comprehensionRetakeChipLabel}`) }}
      </button>
      <button
        v-if="showComprehensionRevisitChip"
        type="button"
        class="comprehension-revisit-chip"
        @click="revisitPastComprehension"
      >
        {{ t("news.comprehensionRevisitChip") }}
      </button>
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
      <ArticleListenAlongBar
        v-if="listenAlongSpeechAvailable && listenAlongParagraphs.length"
        ref="listenAlongBarRef"
        :paragraphs="listenAlongParagraphs"
        :language="targetLang"
        :article-body-el="articleBodyRef"
        :force-pause="listenAlongForcePause"
        @update:reading-index="listenAlongIndex = $event"
        @update:active="listenAlongActive = $event"
      />
      <p
        v-else-if="listenAlongParagraphs.length && !listenAlongSpeechAvailable"
        class="listen-along-unavailable"
      >
        {{ t("news.listenAlongUnavailable") }}
      </p>
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

    <!-- Post-reading comprehension quiz -->
    <Transition name="popup">
      <div v-if="showComprehensionQuiz" class="completion-overlay">
        <div class="completion-sheet comprehension-quiz">
          <template v-if="comprehensionQuizPhase === 'answering'">
            <div class="summary-emoji">🧠</div>
            <h2>{{ t("news.comprehensionTitle") }}</h2>
            <p class="comprehension-subtitle">{{ t("news.comprehensionSubtitle") }}</p>
            <p class="comprehension-progress">
              {{
                t("news.comprehensionQuestionProgress", {
                  current: comprehensionCurrentIndex + 1,
                  total: comprehensionQuiz.length,
                })
              }}
            </p>
            <p v-if="currentComprehensionQuestion" class="comprehension-prompt">
              {{ currentComprehensionQuestion.prompt_native }}
            </p>
            <div v-if="currentComprehensionQuestion" class="comprehension-options">
              <button
                v-for="option in currentComprehensionQuestion.options"
                :key="option.id"
                type="button"
                class="comprehension-option"
                :class="{
                  selected:
                    comprehensionAnswers[currentComprehensionQuestion.id] === option.id,
                }"
                @click="selectComprehensionOption(option.id)"
              >
                {{ option.text_native }}
              </button>
            </div>
            <div class="summary-actions">
              <button
                v-if="canAdvanceComprehension"
                type="button"
                class="action-btn primary"
                @click="advanceComprehension"
              >
                {{
                  comprehensionCurrentIndex < comprehensionQuiz.length - 1
                    ? t("news.comprehensionNext")
                    : t("news.comprehensionViewSummary")
                }}
              </button>
              <button
                type="button"
                class="action-btn secondary"
                @click="comprehensionRetakeMode ? dismissComprehensionRetake() : skipComprehensionQuiz()"
              >
                {{
                  comprehensionRetakeMode
                    ? t("common.cancel")
                    : t("news.comprehensionSkip")
                }}
              </button>
            </div>
          </template>
          <template v-else>
            <div class="summary-emoji">🧠</div>
            <h2>{{ t("news.comprehensionTitle") }}</h2>
            <div class="comprehension-results">
              <div
                v-for="detail in comprehensionResult?.details ?? []"
                :key="detail.question.id"
                class="comprehension-result-card"
                :class="{ wrong: !detail.correct }"
              >
                <p class="comprehension-result-prompt">{{ detail.question.prompt_native }}</p>
                <p v-if="!detail.correct" class="comprehension-result-label">
                  {{ t("news.comprehensionEvidence") }}
                </p>
                <p v-if="!detail.correct" class="comprehension-evidence">
                  {{ detail.question.evidence_sentence }}
                </p>
                <p v-if="!detail.correct" class="comprehension-explanation">
                  {{ detail.question.explanation_native }}
                </p>
              </div>
            </div>
            <div class="summary-actions">
              <button
                type="button"
                class="action-btn primary"
                @click="
                  comprehensionRetakeMode
                    ? finishComprehensionRetake()
                    : enterCompletionSummaryFromQuiz()
                "
              >
                {{
                  comprehensionRetakeMode
                    ? t("news.comprehensionRetakeDone")
                    : t("news.comprehensionViewSummary")
                }}
              </button>
              <button
                v-if="hasWrongComprehensionAnswers"
                type="button"
                class="action-btn secondary"
                @click="enterComprehensionRevisit()"
              >
                {{ t("news.nextStep.revisitArticle") }}
              </button>
            </div>
          </template>
        </div>
      </div>
    </Transition>

    <!-- Reading completion summary -->
    <Transition name="popup">
      <div v-if="showCompletionSummary" class="completion-overlay">
        <div class="completion-sheet summary">
          <div class="summary-emoji">{{ summaryMode === "checkpoint" ? "📝" : "📰" }}</div>
          <h2>{{
            summaryMode === "checkpoint"
              ? t("news.checkpointTitle")
              : t("news.readingCompleteTitle")
          }}</h2>
          <p v-if="article?.original_title" class="completion-article-title">
            {{ article.original_title }}
          </p>
          <p class="summary-stat">
            {{
              summaryMode === "checkpoint"
                ? t("news.checkpointStats", {
                    time: completionTime,
                    pct: displayScrollPct,
                    unknown: wordsUnknownSet.size,
                    lookedUp: knownWordIds.size,
                  })
                : t("news.readingCompleteStats", {
                    time: completionTime,
                    unknown: wordsUnknownSet.size,
                    lookedUp: knownWordIds.size,
                  })
            }}
          </p>
          <p v-if="comprehensionCelebrationBanner" class="comprehension-banner">
            {{
              t(
                comprehensionCelebrationBanner.key,
                comprehensionCelebrationBanner.params,
              )
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
                :disabled="
                  !step.route
                    && !step.contactAction
                    && !isVocabReviewStep(step)
                    && !isContinueReadingStep(step)
                    && !isRevisitArticleStep(step)
                "
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
              {{
                summaryMode === "checkpoint"
                  ? t("news.checkpointSaveExit")
                  : t("news.readingCompleteLater")
              }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
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
  getComprehensionQuiz,
  getArticleTitleTranslations,
} from "@/shared/api.js";
import { openAiContact } from "@/modules/ai-chat/openAiContact.js";
import { findCurrentSection } from "@/modules/learn/pathResume.js";
import WordPopup from "@/shared/components/WordPopup.vue";
import MicroReviewSheet from "@/modules/vocab/MicroReviewSheet.vue";
import SelectionTranslateOverlay from "@/shared/components/SelectionTranslateOverlay.vue";
import ArticleListenAlongBar from "./components/ArticleListenAlongBar.vue";
import { useI18n, getLocale } from "@/shared/i18n";
import { useTargetLangStore, TARGET_LANG_CHANGED } from "@/stores/targetLang.js";
import { eventBus } from "@/shared/eventBus.js";
import { openSourceUrl } from "./utils.js";
import { CEFR_LEVEL_CHANGED, displayLang } from "@/shared/constants.js";
import { shouldOfferRewriteRefresh } from "./rewriteLevelMatch.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import { extractWordTexts, tokenizeArticleText, applyMasteryToTokens } from "./articleText.js";
import { shareArticle } from "./share.js";
import { useSelectionTranslation } from "./selectionTranslation.js";
import { buildPhraseVocabEntry, isPhraseMarkable, phraseKey } from "./phraseVocabMark.js";
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
  isContinueReadingStep,
  isRevisitArticleStep,
  isVocabReviewStep,
} from "./postReadingPlan.js";
import {
  planHasAiPracticeStep,
  PENDING_SOURCES,
  savePendingAiPractice,
} from "@/modules/ai-chat/pendingAiPractice.js";
import { dailyGoalRemainingLessons } from "@/modules/learn/dailyGoalDisplay.js";
import {
  formatReadingTime,
  isValidReading,
  shouldShowCheckpointSummary,
} from "./readingCompletion.js";
import {
  comprehensionCelebration,
  comprehensionNeedsRetake,
  scoreComprehension,
  shouldOfferComprehensionQuiz,
  shouldOfferComprehensionRetake,
} from "./readingComprehension.js";
import { comprehensionRetakeChipKey } from "./newsReadingStatus.js";
import {
  applyEvidenceToTokens,
  collectEvidenceSentences,
  findEvidenceRanges,
  paragraphOffsets,
  rangesForParagraph,
  scrollToFirstEvidence,
} from "./comprehensionEvidence.js";
import {
  extractReadableParagraphs,
  shouldPauseListenAlong,
} from "./articleListenAlong.js";
import { isSpeechSynthesisAvailable } from "@/shared/wordSpeech.js";
import {
  contextReinforcementCopy,
  contextSentenceForHighlight,
  shouldOfferContextReinforcement,
} from "@/modules/vocab/contextReinforcementNudge.js";
import {
  clearVocabContextRevisitPayload,
  loadVocabContextRevisitPayload,
  shouldReturnToVocabReview,
} from "@/modules/vocab/vocabContextRevisit.js";

const { t } = useI18n();
const props = defineProps({ id: [String, Number] });
const route = useRoute();
const router = useRouter();
const targetLangStore = useTargetLangStore();

const article = ref(null);
const rewriting = ref(false);
const rewriteError = ref("");
const rewriteStaleDismissed = ref(false);
const isStaleRefresh = ref(false);
const selectedWord = ref(null);
const knownWordIds = ref(new Set());
const wordsKnownSet = ref(new Set());
const wordsUnknownSet = ref(new Set());
const sessionWordsRef = ref([]);
const startTime = ref(Date.now());
let targetLang = "es";
let userId = "";
const currentLevel = ref("A1");
let unsubLang = null;
let unsubCefr = null;

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
const microReviewContextNudge = ref(false);
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
const showComprehensionQuiz = ref(false);
const comprehensionQuiz = ref([]);
const comprehensionAnswers = ref({});
const comprehensionCurrentIndex = ref(0);
const comprehensionQuizPhase = ref("answering");
const comprehensionResult = ref(null);
const comprehensionOfferAttempted = ref(false);
const comprehensionRetakeMode = ref(false);
const comprehensionQuizAvailable = ref(false);
const comprehensionRevisitActive = ref(false);
const vocabContextRevisitActive = ref(false);
const evidenceRanges = ref([]);
const summaryMode = ref("complete");
const dailyGoalSnapshot = ref(null);
const practicedTodayBefore = ref(false);
const resumeTarget = ref(null);
const newsUnreadCount = ref(0);
const nextUnreadArticleId = ref(null);
const openingAiPractice = ref(false);
const articleBodyRef = ref(null);
const listenAlongBarRef = ref(null);
const listenAlongIndex = ref(0);
const listenAlongActive = ref(false);
const displayScrollPct = ref(0);
const userMarkedComplete = ref(false);
const savedReadingStatus = ref(null);
let scrollSaveTimer = null;
let lastPersistedScrollPct = -1;

const showStaleRewriteBanner = computed(() => {
  if (!article.value?.rewritten_body || rewriting.value || rewriteStaleDismissed.value) {
    return false;
  }
  return shouldOfferRewriteRefresh(article.value, currentLevel.value);
});

const rewritingMessage = computed(() => {
  if (isStaleRefresh.value) {
    return t("news.rewriteRefreshing", { level: currentLevel.value });
  }
  return t("news.rewriting");
});

function onSingleWordSelected(text) {
  const context = articleBodyRef.value?.textContent?.trim() ?? "";
  selectedWord.value = { text, context };
  knownWordIds.value.add(text);
}

const {
  selectionText,
  selectionContext,
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
  getArticleText: () => article.value?.rewritten_body || article.value?.original_body || "",
  t,
  getSelectionRoot: () => articleBodyRef.value,
  onSingleWordSelected: onSingleWordSelected,
});

const phraseActionsVisible = computed(
  () =>
    isPhraseMarkable(selectionText.value) &&
    !!selectionResult.value &&
    !selectionLoading.value &&
    !selectionError.value,
);

const listenAlongParagraphs = computed(() =>
  extractReadableParagraphs(article.value?.rewritten_body || ""),
);

const listenAlongSpeechAvailable = computed(() => isSpeechSynthesisAvailable());

const listenAlongForcePause = computed(() =>
  shouldPauseListenAlong({
    microReviewOpen: microReviewOpen.value,
    wordPopupOpen: Boolean(selectedWord.value),
    selectionActive: Boolean(selectionText.value || showTranslateButton.value),
    overlayOpen: showComprehensionQuiz.value || showCompletionSummary.value,
  }),
);

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

const currentComprehensionQuestion = computed(
  () => comprehensionQuiz.value[comprehensionCurrentIndex.value] ?? null,
);

const canAdvanceComprehension = computed(() => {
  const question = currentComprehensionQuestion.value;
  if (!question) return false;
  return Boolean(comprehensionAnswers.value[question.id]);
});

const comprehensionCelebrationBanner = computed(() => {
  if (summaryMode.value !== "complete" || !comprehensionResult.value) return null;
  return comprehensionCelebration(
    comprehensionResult.value.score,
    comprehensionResult.value.total,
    comprehensionResult.value.skipped,
  );
});

const hasWrongComprehensionAnswers = computed(
  () => comprehensionResult.value?.details?.some((detail) => !detail.correct) ?? false,
);

const showComprehensionRetakeChip = computed(() =>
  shouldOfferComprehensionRetake({
    status: savedReadingStatus.value,
    quizAvailable: comprehensionQuizAvailable.value,
  }),
);

const comprehensionRetakeChipLabel = computed(
  () => comprehensionRetakeChipKey(savedReadingStatus.value) || "comprehensionRetakeChip",
);

const showComprehensionRevisitChip = computed(() => {
  const status = savedReadingStatus.value;
  if (!status?.completed || status.comprehension_skipped) return false;
  if (status.comprehension_score == null) return false;
  return status.comprehension_score < 2;
});

const readingPlan = computed(() => {
  if (!showCompletionSummary.value) return null;
  return buildPostReadingPlan({
    mode: summaryMode.value,
    scrollPct: displayScrollPct.value,
    unknownCount: wordsUnknownSet.value.size,
    microReviewCompleted: microReviewCompleted.value,
    comprehensionResult: comprehensionResult.value,
    dailyGoalSnapshot: dailyGoalSnapshot.value,
    resumeTarget: resumeTarget.value,
    nextUnreadArticleId: nextUnreadArticleId.value,
    newsUnreadCount: newsUnreadCount.value,
    sessionWordCount: sessionWordCount.value,
    sessionWords: sessionWords.value,
  });
});

const microReviewCard = computed(() => microReviewQueue.value[microReviewIndex.value] ?? null);

const microReviewDefinition = computed(() => {
  const card = microReviewCard.value;
  if (!card?.word) return "";
  const sessionEntry = sessionWordsRef.value.find(
    (entry) => phraseKey(entry.word) === phraseKey(card.word),
  );
  return (
    sessionEntry?.translation ||
    vocabDefinition(card, getLocale())
  );
});

const microReviewContextParts = computed(() => {
  const card = microReviewCard.value;
  if (!card?.word) return [];
  const sessionEntry = sessionWordsRef.value.find(
    (entry) => phraseKey(entry.word) === phraseKey(card.word),
  );
  const context = sessionEntry?.context || card.example || "";
  return highlightWordInContext(context, card.word);
});

const microReviewSessionContextMap = computed(() => {
  const map = new Map();
  for (const entry of sessionWordsRef.value) {
    if (entry?.word && entry?.context) {
      map.set(entry.word.toLowerCase(), entry.context);
    }
  }
  return map;
});

const microReviewContextNudgeCopy = computed(() => {
  if (!microReviewContextNudge.value || !microReviewCard.value) return null;
  return contextReinforcementCopy(
    microReviewCard.value,
    t,
    microReviewSessionContextMap.value,
    { articleId: article.value?.id, fromSession: true },
  );
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
  if (vocabContextRevisitActive.value) {
    clearVocabContextRevisit();
  }
  if (shouldReturnToVocabReview(route)) {
    clearVocabContextRevisitPayload();
    router.replace({ name: "vocab-review" });
    return "navigated";
  }
  if (microReviewOpen.value) {
    collapseMicroReview();
    return "navigated";
  }
  if (showComprehensionQuiz.value) {
    if (comprehensionRetakeMode.value) {
      dismissComprehensionRetake();
    } else {
      void skipComprehensionQuiz();
    }
    return "navigated";
  }
  if (showCompletionSummary.value) {
    dismissCompletionSummary();
    return "navigated";
  }
  void tryShowCompletionSummary();
  if (showCompletionSummary.value || showComprehensionQuiz.value) {
    return "navigated";
  }
  void tryShowCheckpointSummary();
  if (showCompletionSummary.value) {
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

function comprehensionLogFields(comprehension = comprehensionResult.value) {
  if (!comprehension) {
    return {
      comprehension_score: null,
      comprehension_skipped: false,
      comprehension_answers_json: null,
    };
  }
  if (comprehension.skipped) {
    return {
      comprehension_score: null,
      comprehension_skipped: true,
      comprehension_answers_json: null,
    };
  }
  return {
    comprehension_score: comprehension.score,
    comprehension_skipped: false,
    comprehension_answers_json: JSON.stringify(comprehensionAnswers.value),
  };
}

async function persistReadingProgress({
  scrollPct,
  completed,
  userMarked,
  comprehension,
} = {}) {
  if (!userId || !article.value) return;
  const pct = scrollPct ?? computeScrollPct(articleBodyRef.value);
  const done = completed ?? isReadingComplete(pct, userMarked ?? userMarkedComplete.value);
  const elapsed = Math.round((Date.now() - startTime.value) / 1000);
  const compFields = comprehensionLogFields(comprehension);
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
      ...compFields,
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
  await tryShowCompletionSummary();
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
    currentLevel.value = ctx.cefr;
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
    rewriteStaleDismissed.value = false;
    if (!art.rewritten_body) {
      await doRewrite();
    } else {
      processArticleWords();
      await restoreSavedScrollPosition();
    }
    if (comprehensionNeedsRetake(savedReadingStatus.value)) {
      await refreshComprehensionQuizAvailability();
    }
    if (route.query.comprehensionRetake === "1") {
      await offerComprehensionRetake();
      router.replace({ name: "reader", params: { id: String(props.id) } });
    }
    if (route.query.vocabContextRevisit === "1") {
      await enterVocabContextRevisit();
    }
  } catch (e) {
    console.error("Failed to load article:", e);
  }
  // The reader is bound to a single article; if the user switches target
  // language elsewhere, jump back to the list so NewsList can refetch
  // articles in the new language.
  unsubLang = eventBus.on(TARGET_LANG_CHANGED, () => {
    if (router.currentRoute.value.path.startsWith("/news/")) {
      router.replace("/news");
    }
  });
  unsubCefr = eventBus.on(CEFR_LEVEL_CHANGED, ({ cefr }) => {
    if (!cefr) return;
    currentLevel.value = cefr;
    rewriteStaleDismissed.value = false;
  });
});

onBeforeUnmount(async () => {
  if (unsubLang) unsubLang();
  if (unsubCefr) unsubCefr();
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

function articleBodyText() {
  return article.value?.rewritten_body || article.value?.original_body || "";
}

function clearComprehensionRevisit() {
  if (!comprehensionRevisitActive.value) return;
  comprehensionRevisitActive.value = false;
  if (!vocabContextRevisitActive.value) {
    evidenceRanges.value = [];
  }
  refreshEvidenceOnTokens();
}

function clearVocabContextRevisit() {
  if (!vocabContextRevisitActive.value) return;
  vocabContextRevisitActive.value = false;
  if (!comprehensionRevisitActive.value) {
    evidenceRanges.value = [];
  }
  refreshEvidenceOnTokens();
}

function refreshEvidenceOnTokens() {
  const body = articleBodyText();
  if (!body) return;
  const ranges =
    comprehensionRevisitActive.value || vocabContextRevisitActive.value
      ? evidenceRanges.value
      : [];
  const offsets = paragraphOffsets(body);
  paraTokens.value = offsets.map(({ text, start }) => {
    const paraRanges = rangesForParagraph(ranges, start, text.length);
    const paraBase = applyMasteryToTokens(tokenizeArticleText(text), masteryMap.value);
    return applyEvidenceToTokens(paraBase, paraRanges);
  });

  const baseTokens = applyMasteryToTokens(tokenizeArticleText(body), masteryMap.value);
  tokens.value = applyEvidenceToTokens(baseTokens, ranges);
}

function refreshTokenMastery() {
  refreshEvidenceOnTokens();
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
    const dueWords = await getUnknownWords(userId, currentLevel.value, 50, targetLang);
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
  microReviewContextNudge.value = false;
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

  if (
    shouldOfferContextReinforcement(card, mastery, {
      articleId: article.value?.id,
      fromSession: true,
    })
  ) {
    microReviewContextNudge.value = true;
    return;
  }
  proceedMicroReviewNext();
}

function proceedMicroReviewNext() {
  microReviewContextNudge.value = false;
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

async function highlightSentenceInArticle(sentence) {
  clearComprehensionRevisit();
  const body = articleBodyText();
  if (!body) {
    showWordToast(t("vocab.contextRevisitNoArticle"));
    return;
  }

  const ranges = findEvidenceRanges(body, [sentence]);
  if (!ranges.length) {
    showWordToast(t("vocab.contextRevisitFallback"));
    return;
  }

  vocabContextRevisitActive.value = true;
  evidenceRanges.value = ranges;
  refreshEvidenceOnTokens();
  await nextTick();
  const scrolled = scrollToFirstEvidence(articleBodyRef.value);
  showWordToast(
    t(scrolled ? "vocab.contextRevisitToast" : "vocab.contextRevisitFallback"),
  );
}

async function onMicroReviewContextRevisit() {
  const card = microReviewCard.value;
  if (!card) return;
  const sentence = contextSentenceForHighlight(card, microReviewSessionContextMap.value, {
    articleId: article.value?.id,
    fromSession: true,
  });
  microReviewContextNudge.value = false;
  microReviewOpen.value = false;
  microReviewCollapsed.value = true;
  if (!sentence) {
    showWordToast(t("vocab.contextRevisitFallback"));
    proceedMicroReviewNext();
    return;
  }
  await highlightSentenceInArticle(sentence);
}

function onMicroReviewContextSkip() {
  proceedMicroReviewNext();
}

function dismissStaleRewriteBanner() {
  rewriteStaleDismissed.value = true;
}

async function onStaleRewriteRefresh() {
  await doRewrite({ staleRefresh: true });
}

async function doRewrite({ staleRefresh = false } = {}) {
  isStaleRefresh.value = staleRefresh;
  rewriting.value = true;
  rewriteError.value = "";
  try {
    const result = await rewriteArticle(Number(props.id), currentLevel.value, userId, targetLang);
    article.value = result;
    rewriteStaleDismissed.value = false;
    clearComprehensionRevisit();
    comprehensionOfferAttempted.value = false;
    comprehensionQuizAvailable.value = false;
    processArticleWords();
    if (staleRefresh) {
      displayScrollPct.value = 0;
      lastPersistedScrollPct = -1;
      await nextTick();
      if (articleBodyRef.value) articleBodyRef.value.scrollTop = 0;
    }
  } catch (e) {
    console.error("Failed to rewrite article:", e);
    rewriteError.value = typeof e === "string" ? e : (e?.message || t("news.rewriteFail"));
    if (staleRefresh) showWordToast(rewriteError.value);
  } finally {
    rewriting.value = false;
    isStaleRefresh.value = false;
  }
}

async function toggleBilingual() {
  clearComprehensionRevisit();
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
    refreshEvidenceOnTokens();
    const result = await getBilingual(Number(props.id), targetLang, getLocale());
    translations.value = result;
    const title = article.value?.original_title || "";
    if (title) {
      try {
        const rows = await getArticleTitleTranslations(
          [Number(props.id)],
          targetLang,
          getLocale(),
        );
        titleTranslation.value = rows?.[0]?.title_translation || "";
        if (!titleTranslation.value) {
          titleTranslation.value = await translateText(title, targetLang, getLocale());
        }
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
  void text;
  refreshEvidenceOnTokens();
}

watch(() => article.value?.rewritten_body, async (val) => {
  if (val) {
    parseText(val);
    listenAlongBarRef.value?.resetPlayback?.();
    await restoreSavedScrollPosition();
  }
});

watch(() => props.id, () => {
  listenAlongBarRef.value?.resetPlayback?.();
});

watch(() => article.value?.original_body, (val) => {
  if (val && !article.value?.rewritten_body) parseText(val);
});

function onArticleBodyClick() {
  if (comprehensionRevisitActive.value) {
    clearComprehensionRevisit();
    return;
  }
  if (vocabContextRevisitActive.value) {
    clearVocabContextRevisit();
  }
}

function onWordTap(token) {
  if (comprehensionRevisitActive.value) {
    clearComprehensionRevisit();
    return;
  }
  if (vocabContextRevisitActive.value) {
    clearVocabContextRevisit();
    return;
  }
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
      const articleId = article.value?.id ?? null;
      if (ids.length > 0) {
        await updateWordMastery(
          userId,
          ids[0],
          2,
          "news_reading",
          selectedWord.value.context,
          articleId,
        );
      } else {
        const newId = await addDiscoveredWord(userId, wordText, targetLang, selectedWord.value.context);
        await updateWordMastery(userId, newId, 2, "news_reading", selectedWord.value.context, articleId);
      }
      setLocalMastery(wordText, 2);
      showWordToast(t("news.wordMarkedKnown"));
    } catch (_) {}
  }
  selectedWord.value = null;
}

function upsertSessionWord(wordText, context, translation = "") {
  const entry = buildPhraseVocabEntry({
    phrase: wordText,
    translation,
    articleId: article.value?.id,
    contextSentence: context,
  });
  const key = phraseKey(wordText);
  const existingIndex = sessionWordsRef.value.findIndex(
    (item) => phraseKey(item.word) === key,
  );
  if (existingIndex >= 0) {
    sessionWordsRef.value[existingIndex] = entry;
  } else {
    sessionWordsRef.value.push(entry);
  }
}

function isInUnknownSet(wordText) {
  const key = phraseKey(wordText);
  for (const word of wordsUnknownSet.value) {
    if (phraseKey(word) === key) return true;
  }
  return false;
}

function buildSessionPayload() {
  return {
    unknownCount: wordsUnknownSet.value.size,
    words: sessionWordsRef.value,
  };
}

async function onPhraseKnown() {
  if (!isPhraseMarkable(selectionText.value)) return;
  await markPhraseVocab({
    phrase: selectionText.value,
    context: selectionContext.value,
    translation: selectionResult.value,
    known: true,
  });
}

async function onPhraseUnknown() {
  if (!isPhraseMarkable(selectionText.value)) return;
  await markPhraseVocab({
    phrase: selectionText.value,
    context: selectionContext.value,
    translation: selectionResult.value,
    known: false,
  });
}

async function markPhraseVocab({ phrase, context, translation, known }) {
  const phraseText = String(phrase || "").trim();
  if (!phraseText || !isPhraseMarkable(phraseText)) return;

  knownWordIds.value.add(phraseText);

  if (known) {
    wordsKnownSet.value.add(phraseText);
    try {
      const ids = await lookupWordIds([phraseText], targetLang);
      const articleId = article.value?.id ?? null;
      if (ids.length > 0) {
        await updateWordMastery(userId, ids[0], 2, "news_reading", context, articleId);
      } else {
        const newId = await addDiscoveredWord(userId, phraseText, targetLang, context);
        await updateWordMastery(userId, newId, 2, "news_reading", context, articleId);
      }
      setLocalMastery(phraseText, 2);
      showWordToast(t("news.phraseMarkedKnown"));
    } catch (_) {}
    return;
  }

  if (!isInUnknownSet(phraseText)) {
    wordsUnknownSet.value.add(phraseText);
  }
  upsertSessionWord(phraseText, context, translation);
  try {
    const ids = await lookupWordIds([phraseText], targetLang);
    const articleId = article.value?.id ?? null;
    if (ids.length > 0) {
      await updateWordMastery(userId, ids[0], 1, "news_reading", context, articleId);
    } else {
      await addDiscoveredWord(userId, phraseText, targetLang, context);
    }
    setLocalMastery(phraseText, 1);
    markSessionUnknown(phraseText);
    const nudge = microReviewNudgeCopy(wordsUnknownSet.value.size, t);
    showWordToast(nudge || t("news.phraseMarkedUnknown"));
    await maybeOpenMicroReview();
  } catch (_) {}
}

async function onWordUnknown() {
  if (selectedWord.value) {
    const wordText = selectedWord.value.text;
    knownWordIds.value.add(wordText);
    if (!isInUnknownSet(wordText)) {
      wordsUnknownSet.value.add(wordText);
    }
    upsertSessionWord(wordText, selectedWord.value.context);
    try {
      const ids = await lookupWordIds([wordText], targetLang);
      const articleId = article.value?.id ?? null;
      if (ids.length > 0) {
        await updateWordMastery(
          userId,
          ids[0],
          1,
          "news_reading",
          selectedWord.value.context,
          articleId,
        );
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
    const curriculum = await getPathCurriculum(getLocale(), targetLang, currentLevel.value);
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

function readingSessionStats() {
  return {
    elapsedSec: Math.round((Date.now() - startTime.value) / 1000),
    unknownCount: wordsUnknownSet.value.size,
    knownCount: wordsKnownSet.value.size,
    lookedUpCount: knownWordIds.value.size,
  };
}

async function goToReadingStep(step) {
  if (!step) return;
  if (isContinueReadingStep(step)) {
    showCompletionSummary.value = false;
    return;
  }
  if (isRevisitArticleStep(step)) {
    await enterComprehensionRevisit();
    return;
  }
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

function selectComprehensionOption(optionId) {
  const question = currentComprehensionQuestion.value;
  if (!question) return;
  const nextAnswers = {
    ...comprehensionAnswers.value,
    [question.id]: optionId,
  };
  comprehensionAnswers.value = nextAnswers;
  if (comprehensionCurrentIndex.value === comprehensionQuiz.value.length - 1) {
    comprehensionResult.value = scoreComprehension(
      comprehensionQuiz.value,
      nextAnswers,
    );
    comprehensionQuizPhase.value = "results";
  }
}

function advanceComprehension() {
  if (!canAdvanceComprehension.value) return;
  if (comprehensionCurrentIndex.value < comprehensionQuiz.value.length - 1) {
    comprehensionCurrentIndex.value += 1;
    return;
  }
  comprehensionResult.value = scoreComprehension(
    comprehensionQuiz.value,
    comprehensionAnswers.value,
  );
  comprehensionQuizPhase.value = "results";
}

async function enterCompletionSummaryFromQuiz() {
  showComprehensionQuiz.value = false;
  showCompletionSummary.value = true;
  await persistReadingProgress({
    scrollPct: computeScrollPct(articleBodyRef.value),
    completed: true,
    comprehension: comprehensionResult.value,
  });
  void loadPostReadingContext();
}

async function skipComprehensionQuiz() {
  comprehensionResult.value = {
    score: 0,
    total: comprehensionQuiz.value.length || 2,
    skipped: true,
    details: [],
  };
  showComprehensionQuiz.value = false;
  showCompletionSummary.value = true;
  await persistReadingProgress({
    scrollPct: computeScrollPct(articleBodyRef.value),
    completed: true,
    comprehension: comprehensionResult.value,
  });
  void loadPostReadingContext();
}

async function enterVocabContextRevisit() {
  clearComprehensionRevisit();
  showCompletionSummary.value = false;
  showComprehensionQuiz.value = false;

  const body = articleBodyText();
  if (!body) {
    showWordToast(t("vocab.contextRevisitNoArticle"));
    return;
  }

  const payload = loadVocabContextRevisitPayload();
  const sentence = payload?.sentence?.trim();
  if (!sentence) {
    showWordToast(t("vocab.contextRevisitFallback"));
    return;
  }

  const ranges = findEvidenceRanges(body, [sentence]);
  if (!ranges.length) {
    showWordToast(t("vocab.contextRevisitFallback"));
    return;
  }

  vocabContextRevisitActive.value = true;
  evidenceRanges.value = ranges;
  refreshEvidenceOnTokens();
  await nextTick();
  const scrolled = scrollToFirstEvidence(articleBodyRef.value);
  showWordToast(
    t(scrolled ? "vocab.contextRevisitToast" : "vocab.contextRevisitFallback"),
  );
}

async function enterComprehensionRevisit(result = comprehensionResult.value) {
  clearVocabContextRevisit();
  const body = articleBodyText();
  const sentences = collectEvidenceSentences(result);
  showCompletionSummary.value = false;
  showComprehensionQuiz.value = false;

  if (!sentences.length) {
    await nextTick();
    articleBodyRef.value?.scrollTo({ top: 0, behavior: "smooth" });
    showWordToast(t("news.comprehensionRevisitFallback"));
    return;
  }

  const ranges = findEvidenceRanges(body, sentences);
  if (!ranges.length) {
    await nextTick();
    articleBodyRef.value?.scrollTo({ top: 0, behavior: "smooth" });
    showWordToast(t("news.comprehensionRevisitFallback"));
    return;
  }

  comprehensionRevisitActive.value = true;
  evidenceRanges.value = ranges;
  refreshEvidenceOnTokens();
  await nextTick();
  const scrolled = scrollToFirstEvidence(articleBodyRef.value);
  showWordToast(
    t(scrolled ? "news.comprehensionRevisitToast" : "news.comprehensionRevisitFallback"),
  );
}

async function revisitPastComprehension() {
  const status = savedReadingStatus.value;
  if (!status?.comprehension_answers_json) {
    showWordToast(t("news.comprehensionRevisitFallback"));
    return;
  }
  try {
    const quiz = await getComprehensionQuiz(
      Number(props.id),
      currentLevel.value,
      getLocale(),
      targetLang,
    );
    if (!quiz?.questions?.length) {
      showWordToast(t("news.comprehensionRevisitFallback"));
      return;
    }
    const answers = JSON.parse(status.comprehension_answers_json);
    const result = scoreComprehension(quiz.questions, answers);
    comprehensionResult.value = result;
    comprehensionAnswers.value = answers;
    await enterComprehensionRevisit(result);
  } catch (e) {
    console.error("Failed to revisit past comprehension:", e);
    showWordToast(t("news.comprehensionRevisitFallback"));
  }
}

async function fetchComprehensionQuizQuestions() {
  const quiz = await getComprehensionQuiz(
    Number(props.id),
    currentLevel.value,
    getLocale(),
    targetLang,
  );
  if (!quiz?.questions?.length) return null;
  return quiz.questions;
}

async function refreshComprehensionQuizAvailability() {
  try {
    const questions = await fetchComprehensionQuizQuestions();
    comprehensionQuizAvailable.value = Boolean(questions?.length);
    return questions;
  } catch (e) {
    console.error("Failed to probe comprehension quiz:", e);
    comprehensionQuizAvailable.value = false;
    return null;
  }
}

function openComprehensionQuizSheet(questions, { retake = false } = {}) {
  comprehensionRetakeMode.value = retake;
  comprehensionQuiz.value = questions;
  comprehensionAnswers.value = {};
  comprehensionCurrentIndex.value = 0;
  comprehensionQuizPhase.value = "answering";
  comprehensionResult.value = null;
  showComprehensionQuiz.value = true;
}

async function offerComprehensionQuiz() {
  clearComprehensionRevisit();
  if (comprehensionOfferAttempted.value) return false;
  comprehensionOfferAttempted.value = true;
  if (
    !shouldOfferComprehensionQuiz({
      summaryMode: "complete",
      isValidReading: isValidReading(readingSessionStats()),
      quizAvailable: true,
    })
  ) {
    return false;
  }
  try {
    const questions = await fetchComprehensionQuizQuestions();
    if (!questions) return false;
    comprehensionQuizAvailable.value = true;
    openComprehensionQuizSheet(questions);
    return true;
  } catch (e) {
    console.error("Failed to load comprehension quiz:", e);
    return false;
  }
}

async function offerComprehensionRetake() {
  clearComprehensionRevisit();
  let questions = null;
  if (comprehensionQuizAvailable.value) {
    try {
      questions = await fetchComprehensionQuizQuestions();
    } catch (e) {
      console.error("Failed to load comprehension quiz:", e);
    }
  } else {
    questions = await refreshComprehensionQuizAvailability();
  }
  if (
    !shouldOfferComprehensionRetake({
      status: savedReadingStatus.value,
      quizAvailable: Boolean(questions?.length),
    })
  ) {
    return false;
  }
  openComprehensionQuizSheet(questions, { retake: true });
  return true;
}

function dismissComprehensionRetake() {
  showComprehensionQuiz.value = false;
  comprehensionRetakeMode.value = false;
  comprehensionAnswers.value = {};
  comprehensionCurrentIndex.value = 0;
  comprehensionQuizPhase.value = "answering";
  comprehensionResult.value = null;
}

async function finishComprehensionRetake() {
  showComprehensionQuiz.value = false;
  comprehensionRetakeMode.value = false;
  await persistReadingProgress({
    scrollPct: computeScrollPct(articleBodyRef.value),
    completed: true,
    comprehension: comprehensionResult.value,
  });
  await loadSavedReadingStatus();
  const result = comprehensionResult.value;
  if (result && !result.skipped && result.score === result.total && result.total > 0) {
    showWordToast(t("news.comprehensionRetakePerfect"));
  }
}

async function tryShowCompletionSummary() {
  if (showCompletionSummary.value || showComprehensionQuiz.value) return true;
  if (!article.value?.rewritten_body) return false;
  const scrollPct = computeScrollPct(articleBodyRef.value);
  const completed = isReadingComplete(scrollPct, userMarkedComplete.value);
  if (!completed) return false;
  summaryMode.value = "complete";
  if (await offerComprehensionQuiz()) return true;
  showCompletionSummary.value = true;
  void loadPostReadingContext();
  return true;
}

async function tryShowCheckpointSummary() {
  if (showCompletionSummary.value) return true;
  if (!article.value?.rewritten_body) return false;
  const scrollPct = computeScrollPct(articleBodyRef.value);
  if (
    !shouldShowCheckpointSummary(
      scrollPct,
      readingSessionStats(),
      userMarkedComplete.value,
    )
  ) {
    return false;
  }
  await persistReadingProgress({ scrollPct, completed: false });
  summaryMode.value = "checkpoint";
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
  clearComprehensionRevisit();
  if (microReviewOpen.value) {
    collapseMicroReview();
    return;
  }
  if (showComprehensionQuiz.value) {
    if (comprehensionRetakeMode.value) {
      dismissComprehensionRetake();
    } else {
      await skipComprehensionQuiz();
    }
    return;
  }
  if (showCompletionSummary.value) {
    dismissCompletionSummary();
    return;
  }
  if (await tryShowCompletionSummary()) return;
  if (await tryShowCheckpointSummary()) return;
  const scrollPct = computeScrollPct(articleBodyRef.value);
  if (wordsUnknownSet.value.size > 0 && !microReviewCompleted.value) {
    savePendingVocabIfNeeded();
  }
  if (article.value?.rewritten_body && scrollPct > 0) {
    await persistReadingProgress({ scrollPct, completed: false });
    if (!isValidReading(readingSessionStats())) {
      saveReadingProgressToast(scrollPct);
    }
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

.rewrite-stale-banner {
  flex-shrink: 0;
  margin: 0 16px 8px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: rgba(255, 152, 0, 0.1);
  border: 1px solid rgba(255, 152, 0, 0.35);
}

.rewrite-stale-text {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--text);
}

.rewrite-stale-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-stale-refresh {
  border: none;
  border-radius: 999px;
  padding: 8px 14px;
  background: var(--orange);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
}

.btn-stale-dismiss {
  border: none;
  border-radius: 999px;
  padding: 8px 14px;
  background: transparent;
  color: var(--text-light);
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
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

.evidence-highlight {
  background: var(--comprehension-evidence-bg, rgba(255, 193, 7, 0.35));
  border-radius: 4px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.para-original.is-reading {
  background: rgba(28, 176, 246, 0.1);
  border-left: 3px solid var(--blue);
  padding-left: 10px;
  margin-left: -10px;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  transition: background var(--transition);
}

.listen-along-unavailable {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--text-light);
  text-align: center;
  line-height: 1.4;
}

.comprehension-revisit-strip {
  flex-shrink: 0;
  padding: 8px 16px;
  font-size: 12px;
  color: var(--text-secondary);
  background: rgba(255, 193, 7, 0.12);
  border-top: 1px solid rgba(255, 193, 7, 0.25);
  text-align: center;
}

.comprehension-retake-chip,
.comprehension-revisit-chip {
  display: block;
  width: 100%;
  margin-bottom: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  cursor: pointer;
}

.comprehension-retake-chip {
  border: 1px solid rgba(124, 58, 237, 0.35);
  background: var(--purple-bg);
  color: var(--purple);
}

.comprehension-revisit-chip {
  border: 1px solid rgba(255, 193, 7, 0.45);
  background: rgba(255, 193, 7, 0.12);
  color: #9a6700;
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
.article-text .para-original {
  margin-bottom: 12px;
  overflow-wrap: break-word;
}

.bilingual .para-original {
  margin-bottom: 4px;
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

.comprehension-banner {
  margin: 12px 0 0;
  padding: 12px 16px;
  background: var(--green-bg, #e8f8ef);
  color: var(--green-hover, #1f8a4c);
  border-radius: var(--radius-md);
  font-weight: 700;
  font-size: 14px;
}

.comprehension-quiz {
  text-align: left;
}

.comprehension-subtitle,
.comprehension-progress {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--text-lighter);
}

.comprehension-prompt {
  margin: 16px 0 0;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.45;
  color: var(--text);
}

.comprehension-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
}

.comprehension-option {
  width: 100%;
  padding: 14px 16px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  font-size: 15px;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}

.comprehension-option.selected {
  border-color: var(--green);
  background: var(--green-bg, #e8f8ef);
}

.comprehension-results {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
}

.comprehension-result-card {
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--surface-alt, #f7f7f8);
}

.comprehension-result-card.wrong {
  background: #fff4f4;
  border: 1px solid #f5c2c2;
}

.comprehension-result-prompt {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.4;
}

.comprehension-result-label {
  margin: 10px 0 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-lighter);
}

.comprehension-evidence {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  color: var(--text);
}

.comprehension-explanation {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-light);
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
