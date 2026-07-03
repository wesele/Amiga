<template>
  <div class="teaching-page" :class="content?.kind">
    <header class="teach-header">
      <button class="close-btn" :aria-label="t('common.back')" @click="exitTeaching">✕</button>
      <div class="header-center">
        <span class="kind-badge">{{ kindLabel }}</span>
        <p class="unit-label">{{ content?.unit_title_native }}</p>
      </div>
      <div class="header-spacer" />
    </header>

    <div v-if="loading" class="center-state">{{ t("path.loading") }}</div>
    <div v-else-if="error" class="center-state">
      <p>{{ error }}</p>
      <button class="action-btn secondary" @click="load">{{ t("common.retry") }}</button>
    </div>

    <template v-else-if="completionResult">
      <div class="teach-summary">
        <h2 class="summary-title">{{ summaryTitle }}</h2>
        <p v-if="completionResult.streak_extended" class="streak-banner">
          {{ t("path.streakExtended", { n: completionResult.streak_current }) }}
        </p>
        <p v-if="completionResult.daily_goal_just_met" class="daily-goal-banner">
          {{
            t("path.dailyGoalMetCelebration", {
              done: completionResult.daily_goal_lessons_today,
              total: completionResult.daily_goal_target,
            })
          }}
        </p>
        <p v-else-if="showDailyGoalNudge" class="daily-goal-banner is-nudge">
          {{
            t("path.dailyGoalRemaining", {
              remaining: dailyGoalRemaining,
              done: completionResult.daily_goal_lessons_today,
              total: completionResult.daily_goal_target,
            })
          }}
        </p>
        <p v-if="completionResult.weekly_goal_just_met" class="weekly-goal-banner">
          {{
            t("path.weeklyGoalMetCelebration", {
              done: completionResult.weekly_goal_active_days,
              total: completionResult.weekly_goal_target_days,
            })
          }}
        </p>
        <p v-if="completionResult.level_upgraded" class="level-up-banner">
          🎓 {{ t("path.levelUp", { level: completionResult.new_cefr_level }) }}
        </p>
        <section v-if="content?.kind === 'vocab' && summaryWords.length" class="summary-words">
          <p class="summary-words-hint">{{ t("path.teachingComplete.vocabWordsHint") }}</p>
          <p v-if="vocabMasterySummary" class="vocab-mastery-summary">{{ vocabMasterySummary }}</p>
          <div class="summary-word-chips">
            <span v-for="w in summaryWords" :key="w.word" class="summary-word-chip">{{ w.word }}</span>
          </div>
        </section>
        <section v-if="teachingPlan" class="next-steps-panel">
          <p class="next-steps-eyebrow">{{ t("path.nextStep.title") }}</p>
          <div class="next-steps-primary">
            <span class="next-steps-icon" aria-hidden="true">{{ teachingPlan.primary.icon }}</span>
            <div class="next-steps-copy">
              <p class="next-steps-primary-title">{{ stepTitle(teachingPlan.primary) }}</p>
              <p
                v-if="teachingPlan.primary.subtitleKey"
                class="next-steps-primary-sub"
              >
                {{ stepSubtitle(teachingPlan.primary) }}
              </p>
            </div>
          </div>
          <div v-if="teachingPlan.secondary.length" class="next-steps-queue">
            <p class="next-steps-queue-title">
              {{ t("path.nextStep.queueTitle", { n: teachingPlan.secondary.length }) }}
            </p>
            <button
              v-for="step in teachingPlan.secondary"
              :key="step.id"
              type="button"
              class="next-steps-queue-item"
              :disabled="!step.route && !step.contactAction"
              @click="goToTeachingStep(step)"
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
      </div>
      <footer class="teach-footer">
        <template v-if="teachingPlan">
          <button
            class="action-btn primary"
            :disabled="openingAiPractice"
            @click="goToTeachingStep(teachingPlan.primary)"
          >
            {{ stepContinueLabel(teachingPlan.primary) }}
          </button>
          <button class="action-btn secondary" @click="exitTeaching">
            {{ t("path.teachingComplete.later") }}
          </button>
        </template>
        <button v-else class="action-btn primary" @click="exitTeaching">
          {{ t("path.backToPath") }}
        </button>
      </footer>
    </template>

    <template v-else-if="content">
      <div class="teach-body">
        <div class="goal-card">
          <h2>{{ t("path.unitGoal") }}</h2>
          <p>{{ content.goal_native }}</p>
        </div>

        <template v-if="content.kind === 'grammar'">
          <section class="teach-section">
            <h3>{{ t("path.grammarPoints") }}</h3>
            <p class="grammar-hint">{{ t("path.tapGrammarToExpand") }}</p>
            <ul class="point-list">
              <li
                v-for="(point, idx) in content.grammar_points"
                :key="idx"
                class="point-item"
                :class="{ expanded: expandedPoint === idx, loading: loadingPoint === idx }"
              >
                <button type="button" class="point-btn" @click="onGrammarPointClick(idx, point)">
                  <span class="point-num">{{ idx + 1 }}</span>
                  <span class="point-text">{{ point }}</span>
                  <span class="point-chevron">{{ expandedPoint === idx ? "▾" : "▸" }}</span>
                </button>
                <div v-if="expandedPoint === idx" class="point-detail">
                  <p v-if="loadingPoint === idx" class="detail-loading">{{ t("path.explainLoading") }}</p>
                  <template v-else-if="pointErrors[idx]">
                    <p class="detail-error">{{ pointErrors[idx] }}</p>
                    <button type="button" class="retry-link" @click="onGrammarPointClick(idx, point)">
                      {{ t("path.explainRetry") }}
                    </button>
                  </template>
                  <div v-else-if="explanations[idx]" class="detail-body">{{ explanations[idx] }}</div>
                </div>
              </li>
            </ul>
          </section>
          <section v-if="content.scenarios.length" class="teach-section">
            <h3>{{ t("path.scenarios") }}</h3>
            <div class="scenario-chips">
              <span v-for="(s, idx) in content.scenarios" :key="idx" class="scenario-chip">{{ s }}</span>
            </div>
          </section>
        </template>

        <template v-else-if="content.kind === 'vocab'">
          <section class="teach-section">
            <h3>{{ t("path.vocabIntro") }}</h3>
            <p class="vocab-hint">{{ t("path.tapToReveal") }}</p>
            <div
              class="mastery-legend"
              role="note"
              :aria-label="t('path.vocabMasteryLegend')"
            >
              <span class="legend-item">
                <span class="legend-dot unseen" aria-hidden="true" />
                {{ t("path.masteryUnseen") }}
              </span>
              <span class="legend-item">
                <span class="legend-dot seen" aria-hidden="true" />
                {{ t("path.masterySeen") }}
              </span>
              <span class="legend-item">
                <span class="legend-dot mastered" aria-hidden="true" />
                {{ t("path.masteryMastered") }}
              </span>
            </div>
            <div v-if="teachingWords.length > 0" class="word-grid">
              <button
                v-for="(w, idx) in teachingWords"
                :key="w.word + idx"
                type="button"
                class="word-chip"
                :class="chipClass(w.mastery)"
                :aria-label="`${w.word}, ${masteryLabel(w.mastery)}`"
                @click="onWordTap(w)"
              >
                {{ w.word }}
                <span v-if="w.mastery >= 2" class="chip-check" aria-hidden="true">✓</span>
              </button>
            </div>
            <div v-else class="empty-vocab">{{ t("path.noVocabWords") }}</div>
          </section>
        </template>
      </div>

      <button
        v-if="content.kind === 'vocab' && sessionMarkedUnknown.length > 0 && !microReviewOpen"
        type="button"
        class="teaching-review-cta"
        @click="reopenMicroReview"
      >
        {{ t("path.microReviewCta", { n: sessionMarkedUnknown.length }) }}
      </button>

      <MicroReviewSheet
        v-if="content.kind === 'vocab'"
        sheet-class="is-teaching"
        :open="microReviewOpen"
        :card="microReviewCard"
        :session-count="sessionMarkedUnknown.length"
        :index="microReviewIndex"
        :queue-length="microReviewQueue.length"
        :definition="microReviewDefinition"
        :context-label="t('path.microReviewFromUnit')"
        :context-text="content.unit_title_native"
        :card-mode="microReviewCardMode"
        :revealed="microReviewRevealed"
        :cloze-parts="microReviewClozeParts"
        :cloze-aria-text="microReviewClozeAria"
        :flipped="microReviewFlipped"
        :swipe-enabled="microReviewSwipeEnabled"
        :swipe-dragging="microReviewSwipeDragging"
        :swipe-style="microReviewSwipeStyle"
        :rating-ack="microReviewRatingAck"
        :acting="microReviewActing"
        :speech-language="userMeta.targetLang"
        title-key="path.microReviewTitle"
        hint-key="path.microReviewHint"
        continue-key="path.microReviewContinue"
        later-key="path.microReviewLater"
        @card-click="onMicroReviewCardClick"
        @reveal="onMicroReviewReveal"
        @swipe-down="onMicroReviewSwipeDown"
        @swipe-move="onMicroReviewSwipeMove"
        @swipe-up="onMicroReviewSwipeUp"
        @swipe-cancel="onMicroReviewSwipeCancel"
        @continue="collapseMicroReview"
        @later="dismissMicroReview"
      />

      <footer class="teach-footer">
        <button class="action-btn primary" :disabled="submitting" @click="finishTeaching">
          {{ t("path.continuePath") }}
        </button>
      </footer>
    </template>

    <Transition name="popup">
      <div v-if="wordToast" class="word-toast">{{ wordToast }}</div>
    </Transition>

    <Transition name="popup">
      <WordPopup
        v-if="selectedWord"
        :word="selectedWord.word"
        :context="selectedWord.word"
        :source-lang="userMeta.targetLang"
        :native-lang="userMeta.nativeLang"
        @close="selectedWord = null"
        @known="onKnown"
        @unknown="onUnknown"
        :always-show-actions="true"
      />
    </Transition>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { getLocale } from "@/shared/i18n";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import {
  completeTeachingNode,
  explainGrammarPoint,
  getArticles,
  getArticlesReadingStatus,
  getGrammarExplanationCached,
  getTeachingContent,
  getUnknownWords,
  getUserVocabByLevel,
  updateWordMastery,
} from "@/shared/api.js";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import { pathRouteWithCurrentFocus } from "./pathMapScroll.js";
import {
  dailyGoalLessonsRemaining,
  shouldShowDailyGoalNudge,
} from "./dailyGoalNudge.js";
import {
  buildFocusArea,
  focusAreaTypeKey,
  loadQuestionTypeStats,
  pairStatsKey,
} from "@/modules/learn/questionTypeStats.js";
import { VOCAB_REVIEW_LIMIT } from "@/modules/learn/vocabReviewCard.js";
import {
  buildStatusMap,
  countUnreadArticles,
} from "@/modules/news/newsReadingStatus.js";
import { mergeArticlesWithStatus } from "@/modules/news/lessonArticleMatch.js";
import { buildPairKey } from "./lessonInFlight.js";
import { saveRecentLessonWords } from "./recentLessonWords.js";
import { openAiContact } from "@/modules/ai-chat/openAiContact.js";
import { countDueForPair } from "./mistakeReviewStore.js";
import {
  buildPostTeachingPlan,
  isAiPracticeStep,
  isGrammarAiPracticeStep,
  primaryTeachingStepRoute,
  TEACHING_STEP_IDS,
} from "./postTeachingPlan.js";
import { saveGrammarPracticePayload } from "./grammarAiPractice.js";
import { continueRouteAfterSection } from "./lessonContinue.js";
import { promiseWithTimeout } from "@/shared/promiseTimeout.js";
import WordPopup from "@/shared/components/WordPopup.vue";
import MicroReviewSheet from "@/modules/vocab/MicroReviewSheet.vue";
import { buildTeachingMicroReviewQueue } from "@/modules/vocab/microReviewQueue.js";
import { useMicroReviewCard } from "@/modules/vocab/useMicroReviewCard.js";
import { vocabDefinition } from "@/modules/vocab/vocabReviewSession.js";
import {
  buildClozeContextParts,
  clozeAriaLabel,
  resolveVocabCardMode,
} from "@/modules/vocab/vocabRecallMode.js";
import {
  microReviewNudgeCopy,
  shouldOfferMicroReview,
} from "@/shared/microReview.js";
import {
  playVocabRatingFeedback,
  vocabRatingAckKind,
  waitVocabRatingAck,
} from "@/modules/vocab/vocabRatingFeedback.js";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const targetLangStore = useTargetLangStore();

const loading = ref(true);
const error = ref("");
const submitting = ref(false);
const content = ref(null);
const completionResult = ref(null);
const teachingPlan = ref(null);
const teachingWords = ref([]);
const initialMastery = ref(new Map());
const sessionMarkedUnknown = ref([]);
const dueMistakesAtStart = ref(0);
const dueVocabAtStart = ref(0);
const focusAreaAtStart = ref(null);
const newsUnreadCount = ref(0);
const articlesForMatch = ref([]);
const openingAiPractice = ref(false);
const selectedWord = ref(null);
const userId = ref("");
const userMeta = ref({ nativeLang: "zh", targetLang: "es", cefr: "A1" });
const expandedPoint = ref(null);
const loadingPoint = ref(null);
const explanations = ref({});
const pointErrors = ref({});
const wordToast = ref("");
let wordToastTimer = null;
const microReviewQueue = ref([]);
const microReviewIndex = ref(0);
const microReviewOpen = ref(false);
const microReviewDismissed = ref(false);
const microReviewCompleted = ref(false);
const microReviewCollapsed = ref(false);

function getMicroReviewCardMode() {
  const card = microReviewQueue.value[microReviewIndex.value];
  return resolveVocabCardMode(card, {
    index: microReviewIndex.value,
    sessionContextMap: new Map(),
    mastery: card?.mastery,
    readingSessionMode: false,
    nativeLang: getLocale(),
  });
}

const {
  flipped: microReviewFlipped,
  revealed: microReviewRevealed,
  acting: microReviewActing,
  ratingAck: microReviewRatingAck,
  swipeDragging: microReviewSwipeDragging,
  swipeEnabled: microReviewSwipeEnabled,
  swipeStyle: microReviewSwipeStyle,
  resetCard: resetMicroReviewCard,
  revealAnswer: revealMicroReviewAnswer,
  onCardClick: flipMicroReviewCard,
  onSwipeDown: onMicroReviewSwipeDown,
  onSwipeMove: onMicroReviewSwipeMove,
  onSwipeUp: onMicroReviewSwipeUpRaw,
  onSwipeCancel: onMicroReviewSwipeCancel,
} = useMicroReviewCard({ cardMode: getMicroReviewCardMode });
let explainSeq = 0;

function formatInvokeError(err) {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err.message === "string" && err.message) return err.message;
  return String(err);
}

const kindLabel = computed(() => {
  if (content.value?.kind === "vocab") return t("path.nodeVocab");
  return t("path.nodeGrammar");
});

const summaryTitle = computed(() => {
  if (content.value?.kind === "vocab") return t("path.teachingComplete.vocabTitle");
  return t("path.teachingComplete.grammarTitle");
});

const summaryWords = computed(() => teachingWords.value.slice(0, 5));

const vocabMasterySummary = computed(() => {
  if (content.value?.kind !== "vocab" || !completionResult.value) return "";
  let newlySeen = 0;
  let newlyMastered = 0;
  for (const w of teachingWords.value) {
    const initial = initialMastery.value.get(w.word.toLowerCase());
    if (w.mastery === 1 && (initial === null || initial === undefined)) newlySeen += 1;
    if (w.mastery === 2 && initial !== 2) newlyMastered += 1;
  }
  const parts = [];
  if (newlySeen > 0) {
    parts.push(t("path.teachingComplete.vocabNewlySeen", { n: newlySeen }));
  }
  if (newlyMastered > 0) {
    parts.push(t("path.teachingComplete.vocabNewlyMastered", { n: newlyMastered }));
  }
  return parts.join(" · ");
});

const dailyGoalRemaining = computed(() =>
  dailyGoalLessonsRemaining(completionResult.value),
);

const showDailyGoalNudge = computed(() =>
  shouldShowDailyGoalNudge(completionResult.value),
);

const microReviewCard = computed(() => microReviewQueue.value[microReviewIndex.value] ?? null);

const microReviewDefinition = computed(() =>
  vocabDefinition(microReviewCard.value, getLocale()),
);

const microReviewCardMode = computed(() => getMicroReviewCardMode());

const microReviewClozeParts = computed(() =>
  buildClozeContextParts(
    microReviewCard.value?.example || "",
    microReviewCard.value?.word,
  ),
);

const microReviewClozeAria = computed(() =>
  clozeAriaLabel(
    microReviewCard.value?.example || "",
    microReviewCard.value?.word,
    t("vocab.recallBlankAria"),
  ),
);

function showWordToast(msg) {
  if (!msg) return;
  wordToast.value = msg;
  if (wordToastTimer) clearTimeout(wordToastTimer);
  wordToastTimer = setTimeout(() => {
    wordToast.value = "";
    wordToastTimer = null;
  }, 2500);
}

function onMicroReviewSwipeUp(event) {
  const mastery = onMicroReviewSwipeUpRaw(event);
  if (mastery != null) void rateMicroReviewCard(mastery);
}

function onMicroReviewCardClick() {
  if (!microReviewCard.value) return;
  flipMicroReviewCard();
}

function onMicroReviewReveal() {
  revealMicroReviewAnswer();
}

function prepareMicroReviewQueue() {
  microReviewQueue.value = buildTeachingMicroReviewQueue(
    sessionMarkedUnknown.value,
    teachingWords.value,
  );
}

function maybeOpenMicroReview() {
  if (
    content.value?.kind !== "vocab" ||
    microReviewOpen.value ||
    microReviewCollapsed.value ||
    !shouldOfferMicroReview({
      sessionWordCount: sessionMarkedUnknown.value.length,
      sheetDismissed: microReviewDismissed.value,
      sheetCompleted: microReviewCompleted.value,
    })
  ) {
    return;
  }
  prepareMicroReviewQueue();
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
  microReviewDismissed.value = true;
  microReviewOpen.value = false;
}

function reopenMicroReview() {
  microReviewDismissed.value = false;
  microReviewCollapsed.value = false;
  prepareMicroReviewQueue();
  if (!microReviewQueue.value.length) return;
  microReviewIndex.value = 0;
  microReviewOpen.value = true;
  resetMicroReviewCard();
}

async function rateMicroReviewCard(mastery) {
  const card = microReviewCard.value;
  if (!card?.id || microReviewActing.value) return;
  microReviewActing.value = true;
  microReviewRatingAck.value = vocabRatingAckKind(mastery);
  playVocabRatingFeedback(mastery);
  try {
    await waitVocabRatingAck();
    await updateWordMastery(userId.value, card.id, mastery, "path_vocab");
    const match = teachingWords.value.find(
      (w) => w.word.toLowerCase() === card.word.toLowerCase(),
    );
    if (match) match.mastery = mastery;
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
    showWordToast(t("news.microReviewComplete", { n: reviewedCount }));
    return;
  }
  microReviewIndex.value = nextIndex;
  resetMicroReviewCard();
}

async function onGrammarPointClick(idx, point) {
  if (expandedPoint.value === idx && !pointErrors.value[idx]) {
    expandedPoint.value = null;
    return;
  }
  expandedPoint.value = idx;
  if (explanations.value[idx]) {
    pointErrors.value = { ...pointErrors.value, [idx]: "" };
    return;
  }

  const seq = ++explainSeq;
  loadingPoint.value = idx;
  pointErrors.value = { ...pointErrors.value, [idx]: "" };
  try {
    const c = content.value;
    const cached = await getGrammarExplanationCached(
      userMeta.value.cefr,
      c.unit_id,
      point,
    );
    if (seq !== explainSeq) return;
    if (cached) {
      explanations.value = { ...explanations.value, [idx]: cached };
      return;
    }

    const res = await promiseWithTimeout(
      explainGrammarPoint(
        userMeta.value.cefr,
        userMeta.value.targetLang,
        c.unit_id,
        point,
        c.unit_title_native,
        c.goal_native,
      ),
      120000,
      t("path.explainTimeout"),
    );
    if (seq !== explainSeq) return;
    const text = res?.explanation;
    if (!text) throw new Error(t("path.explainEmpty"));
    explanations.value = { ...explanations.value, [idx]: text };
  } catch (e) {
    if (seq !== explainSeq) return;
    pointErrors.value = {
      ...pointErrors.value,
      [idx]: formatInvokeError(e),
    };
  } finally {
    if (seq === explainSeq) loadingPoint.value = null;
  }
}

function chipClass(mastery) {
  if (mastery === undefined || mastery === null) return "chip-unseen";
  if (mastery >= 2) return "chip-mastered";
  if (mastery === 1) return "chip-seen";
  return "chip-unseen";
}

function masteryLabel(mastery) {
  if (mastery === undefined || mastery === null) return t("path.masteryUnseen");
  if (mastery >= 2) return t("path.masteryMastered");
  if (mastery === 1) return t("path.masterySeen");
  return t("path.masteryUnseen");
}

function onWordTap(w) {
  selectedWord.value = w;
}

async function loadTeachingWords(words, targetLang, cefr) {
  if (!words?.length) {
    teachingWords.value = [];
    return;
  }
  let masteryByWord = new Map();
  try {
    const vocab = await getUserVocabByLevel(userId.value, targetLang, cefr);
    masteryByWord = new Map(
      vocab.map((v) => [v.word.toLowerCase(), { id: v.id, mastery: v.mastery }]),
    );
  } catch (_) {}
  const masterySnapshot = new Map();
  teachingWords.value = words.map((item) => {
    const match = masteryByWord.get(item.word.toLowerCase());
    const mastery = match?.mastery ?? null;
    masterySnapshot.set(item.word.toLowerCase(), mastery);
    return {
      word: item.word,
      id: match?.id ?? null,
      mastery,
      definition_zh: item.definition_zh,
      definition_es: item.definition_es,
    };
  });
  initialMastery.value = masterySnapshot;
  sessionMarkedUnknown.value = [];
  microReviewQueue.value = [];
  microReviewIndex.value = 0;
  microReviewOpen.value = false;
  microReviewDismissed.value = false;
  microReviewCompleted.value = false;
  microReviewCollapsed.value = false;
}

async function onKnown() {
  if (!selectedWord.value?.id) {
    selectedWord.value = null;
    return;
  }
  const w = selectedWord.value;
  try {
    await updateWordMastery(userId.value, w.id, 2, "path_vocab");
    w.mastery = 2;
  } catch (_) {}
  selectedWord.value = null;
}

async function onUnknown() {
  if (!selectedWord.value?.id) {
    selectedWord.value = null;
    return;
  }
  const w = selectedWord.value;
  try {
    await updateWordMastery(userId.value, w.id, 1, "path_vocab");
    w.mastery = 1;
    if (!sessionMarkedUnknown.value.includes(w.word)) {
      sessionMarkedUnknown.value.push(w.word);
    }
    const nudge = microReviewNudgeCopy(
      sessionMarkedUnknown.value.length,
      t,
      "path.microReviewNudge",
    );
    if (nudge) showWordToast(nudge);
    maybeOpenMicroReview();
  } catch (_) {}
  selectedWord.value = null;
}

function exitTeaching() {
  router.replace(pathRouteWithCurrentFocus());
}

function stepTitle(step) {
  if (!step) return "";
  const params = { ...(step.titleParams ?? {}) };
  if (step.id === TEACHING_STEP_IDS.NEXT_NODE && params.kindKey) {
    params.kind = t(params.kindKey);
    delete params.kindKey;
  }
  if (step.id === TEACHING_STEP_IDS.FOCUS_AREA && params.typeId) {
    params.type = t(focusAreaTypeKey(params.typeId));
    delete params.typeId;
  }
  return t(step.titleKey, params);
}

function stepSubtitle(step) {
  if (!step?.subtitleKey) return "";
  const params = { ...(step.subtitleParams ?? {}) };
  if (step.id === TEACHING_STEP_IDS.FOCUS_AREA && params.typeId) {
    params.type = t(focusAreaTypeKey(params.typeId));
    delete params.typeId;
  }
  return t(step.subtitleKey, params);
}

function stepContinueLabel(step) {
  if (!step?.continueKey) return t("path.backToPath");
  return t(step.continueKey, step.continueParams ?? {});
}

async function goToTeachingStep(step) {
  if (!step) return;
  if (isGrammarAiPracticeStep(step)) {
    openingAiPractice.value = true;
    try {
      const practiceContext = step.practiceContext;
      if (!practiceContext) return;
      saveGrammarPracticePayload(practiceContext);
      const continueRoute = continueRouteAfterSection(completionResult.value);
      await openAiContact(
        router,
        { name: t("chat.amiga"), contactType: "amiga" },
        {
          targetLang: userMeta.value.targetLang,
          starterId: "grammar-practice",
          starterParams: {
            from: "grammar",
            ...(continueRoute ? { returnRoute: continueRoute } : {}),
          },
        },
      );
    } finally {
      openingAiPractice.value = false;
    }
    return;
  }
  if (isAiPracticeStep(step)) {
    openingAiPractice.value = true;
    try {
      await openAiContact(
        router,
        { name: t("chat.amiga"), contactType: "amiga" },
        {
          targetLang: userMeta.value.targetLang,
          starterId: "reviewed-words",
          starterParams: {
            words: (step.sessionWords ?? sessionMarkedUnknown.value).join(", "),
            from: "vocab",
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
  } else {
    router.replace(primaryTeachingStepRoute(teachingPlan.value));
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

async function loadNewsUnread() {
  try {
    const articles = await getArticles(regionForLang(userMeta.value.targetLang));
    if (!articles.length) {
      newsUnreadCount.value = 0;
      articlesForMatch.value = [];
      return;
    }
    const ids = articles.map((article) => article.id).filter((id) => id != null);
    const rows = await getArticlesReadingStatus(userId.value, ids);
    const map = buildStatusMap(rows);
    newsUnreadCount.value = countUnreadArticles(map, articles);
    articlesForMatch.value = mergeArticlesWithStatus(articles, map);
  } catch {
    newsUnreadCount.value = 0;
    articlesForMatch.value = [];
  }
}

async function loadPostTeachingContext() {
  const pairKey = pairStatsKey(userMeta.value.nativeLang, userMeta.value.targetLang);
  dueMistakesAtStart.value = countDueForPair(pairKey);
  focusAreaAtStart.value = buildFocusArea(loadQuestionTypeStats(pairKey));
  try {
    const words = await getUnknownWords(
      userId.value,
      userMeta.value.cefr,
      VOCAB_REVIEW_LIMIT,
      userMeta.value.targetLang,
    );
    dueVocabAtStart.value = Array.isArray(words) ? words.length : 0;
  } catch {
    dueVocabAtStart.value = 0;
  }
  await loadNewsUnread();
  teachingPlan.value = buildPostTeachingPlan({
    result: completionResult.value,
    completedSectionId: route.params.nodeId,
    dueMistakesAtStart: dueMistakesAtStart.value,
    dueVocabAtStart: dueVocabAtStart.value,
    focusArea: focusAreaAtStart.value,
    unitTitle: content.value?.unit_title_native ?? "",
    sessionUnknownWords: sessionMarkedUnknown.value,
    microReviewCompleted: microReviewCompleted.value,
    newsUnreadCount: newsUnreadCount.value,
    localHour: new Date().getHours(),
    isVocabLesson: content.value?.kind === "vocab",
    lessonWords: teachingWords.value.map((item) => item.word).filter(Boolean),
    articles: articlesForMatch.value,
    kind: content.value?.kind ?? null,
    grammarPoints: content.value?.grammar_points ?? [],
    scenarios: content.value?.scenarios ?? [],
    targetLang: userMeta.value.targetLang,
  });
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const { user, targetLang, cefr } = await loadLearningContext({ targetLangStore });
    userId.value = user.id;
    userMeta.value = { nativeLang: user.native_language, targetLang, cefr };
    content.value = await getTeachingContent(
      user.native_language,
      targetLang,
      cefr,
      route.params.nodeId,
    );
    selectedWord.value = null;
    await loadTeachingWords(content.value?.words, targetLang, cefr);
    expandedPoint.value = null;
    loadingPoint.value = null;
    explanations.value = {};
    pointErrors.value = {};
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

async function finishTeaching() {
  submitting.value = true;
  try {
    completionResult.value = await completeTeachingNode(
      userMeta.value.nativeLang,
      userMeta.value.targetLang,
      userMeta.value.cefr,
      route.params.nodeId,
    );
    await loadPostTeachingContext();
    if (content.value?.kind === "vocab") {
      const words = teachingWords.value.map((item) => item.word).filter(Boolean);
      if (words.length >= 2) {
        saveRecentLessonWords({
          words,
          sectionId: route.params.nodeId,
          sectionTitle: content.value?.title_native ?? "",
          pairKey: buildPairKey(
            userMeta.value.nativeLang,
            userMeta.value.targetLang,
            userMeta.value.cefr,
          ),
        });
      }
    }
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.teaching-page {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #ddf4ff 0%, var(--bg) 180px);
}

.teaching-page.grammar {
  background: linear-gradient(180deg, #f3e8ff 0%, var(--bg) 180px);
}

.teaching-page.vocab {
  background: linear-gradient(180deg, #ddf4ff 0%, var(--bg) 180px);
}

.teach-header {
  display: grid;
  grid-template-columns: 40px 1fr 40px;
  align-items: center;
  padding: 12px 16px;
  background: var(--white);
  border-bottom: 1px solid var(--border);
}

.close-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: var(--gray-light);
  font-size: 18px;
  cursor: pointer;
}

.header-center {
  text-align: center;
}

.kind-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--blue-bg);
  color: var(--blue-hover);
  font-size: 12px;
  font-weight: 700;
}

.teaching-page.grammar .kind-badge {
  background: #f3e8ff;
  color: #7c3aed;
}

.unit-label {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-light);
  font-weight: 600;
}

.teach-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 16px 24px;
}

.goal-card {
  padding: 18px;
  border-radius: var(--radius-md);
  background: var(--white);
  border: 2px solid var(--border);
  box-shadow: 0 4px 0 var(--border);
  margin-bottom: 20px;
}

.goal-card h2 {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--text-light);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.goal-card p {
  margin: 0;
  font-size: 16px;
  line-height: 1.55;
  font-weight: 600;
}

.teach-section + .teach-section {
  margin-top: 24px;
}

.teach-section h3 {
  margin: 0 0 12px;
  font-size: 17px;
  font-weight: 700;
}

.grammar-hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--text-light);
}

.point-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.point-item {
  background: var(--white);
  border-radius: var(--radius-md);
  border: 2px solid var(--border);
  box-shadow: 0 3px 0 var(--border);
  overflow: hidden;
  transition: border-color var(--transition), box-shadow var(--transition);
}

.point-item.expanded {
  border-color: #ce82ff;
  box-shadow: 0 3px 0 #a855f7;
}

.point-item.loading {
  opacity: 0.92;
}

.point-btn {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.point-btn:active {
  background: rgba(206, 130, 255, 0.08);
}

.point-num {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #ce82ff;
  color: var(--white);
  font-weight: 800;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.point-text {
  flex: 1;
  font-size: 15px;
  line-height: 1.5;
  font-weight: 600;
}

.point-chevron {
  flex-shrink: 0;
  color: var(--text-light);
  font-size: 14px;
  margin-top: 2px;
}

.point-detail {
  padding: 0 14px 14px 54px;
}

.detail-loading,
.detail-error {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}

.detail-loading {
  color: var(--text-light);
}

.detail-error {
  color: var(--red);
}

.retry-link {
  margin-top: 8px;
  padding: 0;
  border: none;
  background: none;
  color: var(--blue-hover);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
}

.detail-body {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: var(--text);
  white-space: pre-wrap;
}

.scenario-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.scenario-chip {
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: var(--white);
  border: 2px solid var(--border);
  font-size: 14px;
  line-height: 1.4;
}

.vocab-hint {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--text-light);
}

.mastery-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  margin: 0 0 14px;
  font-size: 12px;
  color: var(--text-light);
  font-weight: 600;
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

.legend-dot.unseen {
  background: var(--text-light);
}

.legend-dot.seen {
  background: var(--blue);
}

.legend-dot.mastered {
  background: var(--green);
}

.word-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.word-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
  border-radius: 999px;
  border: 2px solid var(--border);
  background: var(--white);
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s;
}

.word-chip:active {
  transform: scale(0.98);
}

.chip-unseen {
  color: var(--text);
  border-color: var(--border);
  background: var(--white);
}

.chip-seen {
  color: var(--blue);
  border-color: var(--blue);
  background: var(--blue-bg);
}

.chip-mastered {
  color: var(--green);
  border-color: var(--green);
  background: var(--green-bg);
}

.chip-check {
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
}

.empty-vocab {
  font-size: 14px;
  color: var(--text-light);
  text-align: center;
  padding: 24px 0;
}

.popup-enter-active,
.popup-leave-active {
  transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
}
.popup-enter-from,
.popup-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.teaching-review-cta {
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

.teach-footer {
  padding: 16px 20px calc(16px + var(--safe-bottom));
  background: var(--white);
  border-top: 1px solid var(--border);
}

.center-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-light);
  padding: 24px;
}

.action-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: var(--radius-md);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

.action-btn.primary {
  background: var(--green);
  color: var(--white);
  box-shadow: 0 4px 0 var(--green-hover);
}

.action-btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

.action-btn.secondary {
  background: var(--white);
  color: var(--text);
  border: 2px solid var(--border);
}

.teach-summary {
  flex: 1;
  overflow-y: auto;
  padding: 32px 20px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.summary-title {
  margin: 0 0 16px;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.3;
}

.streak-banner {
  margin: 8px 0 0;
  padding: 12px 16px;
  background: var(--orange-bg);
  border-radius: var(--radius-md);
  font-size: 15px;
  font-weight: 700;
  color: var(--orange);
  width: 100%;
  max-width: 360px;
}

.daily-goal-banner {
  margin: 8px 0 0;
  padding: 12px 16px;
  background: var(--green-bg);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 600;
  color: var(--green-hover);
  width: 100%;
  max-width: 360px;
}

.daily-goal-banner.is-nudge {
  background: linear-gradient(135deg, #fff8e6 0%, #ffefcc 100%);
  color: #8a6200;
  border: 1px solid #e6b84d;
}

.weekly-goal-banner {
  margin: 8px 0 0;
  padding: 12px 16px;
  background: var(--blue-bg);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 600;
  color: var(--blue-hover);
  width: 100%;
  max-width: 360px;
}

.level-up-banner {
  margin: 8px 0 0;
  padding: 12px 16px;
  background: var(--orange-bg);
  border-radius: var(--radius-md);
  font-size: 15px;
  font-weight: 700;
  color: var(--orange);
  width: 100%;
  max-width: 360px;
}

.summary-words {
  margin-top: 24px;
  width: 100%;
  max-width: 360px;
}

.summary-words-hint {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--text-light);
  font-weight: 600;
}

.summary-word-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.summary-word-chip {
  display: inline-flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 999px;
  background: var(--white);
  border: 2px solid var(--border);
  font-size: 15px;
  font-weight: 600;
}

.vocab-mastery-summary {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--blue-hover);
  font-weight: 600;
}

.next-steps-panel {
  width: 100%;
  max-width: 360px;
  margin: 20px 0 0;
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
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.next-steps-queue-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.next-steps-queue-item + .next-steps-queue-item {
  border-top: 1px solid rgba(88, 204, 2, 0.15);
}

.next-steps-queue-icon {
  font-size: 20px;
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
  font-weight: 700;
  color: var(--text);
  line-height: 1.3;
}

.next-steps-queue-item-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-light);
  line-height: 1.4;
}

.teach-footer .action-btn.secondary {
  margin-top: 10px;
}
</style>