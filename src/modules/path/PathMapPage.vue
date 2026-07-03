<template>
  <div class="path-map">
    <PageHeader
      variant="path"
      :back-label="t('common.back')"
      @back="goBack"
    >
      <template #title>
        <div class="header-text">
          <h1 class="page-title">{{ t("path.title") }}</h1>
          <p v-if="curriculum?.status === 'active'" class="page-sub">
            {{ t("path.progress", { done: curriculum.completed_sections, total: curriculum.total_sections }) }}
            · ⭐ {{ curriculum.total_stars }}
            <span v-if="learningStreak?.current > 0" class="streak-pill">
              🔥 {{ t("path.streakDays", { n: learningStreak.current }) }}
            </span>
          </p>
        </div>
      </template>
      <template #actions>
        <button
          type="button"
          class="level-btn"
          :disabled="levelSwitching"
          :aria-label="t('path.selectLevel')"
          @click="showLevelPicker = true"
        >
          <span class="level-btn-label">{{ currentCefr }}</span>
          <span class="level-btn-chevron">▾</span>
        </button>
      </template>
    </PageHeader>

    <Teleport to="body">
      <div v-if="showLevelPicker" class="level-overlay" @click.self="showLevelPicker = false">
        <div class="level-sheet">
          <h3 class="level-sheet-title">{{ t("path.selectLevel") }}</h3>
          <div class="level-sheet-options">
            <button
              v-for="lvl in learningLevels"
              :key="lvl"
              type="button"
              class="level-sheet-option"
              :class="{ active: currentCefr === lvl }"
              :disabled="levelSwitching"
              @click="pickLevel(lvl)"
            >
              <span class="level-sheet-name">{{ t(`wizard.levels.${lvl}`) }}</span>
              <span class="level-sheet-code">{{ lvl }}</span>
              <span v-if="currentCefr === lvl" class="level-sheet-check">✓</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <div v-if="loading" class="loading-state">{{ t("path.loading") }}</div>

    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
      <button class="retry-btn" @click="load">{{ t("common.retry") }}</button>
    </div>

    <div v-else-if="curriculum?.status === 'unsupported'" class="empty-state">
      <span class="empty-emoji">🛤️</span>
      <h2>{{ t("path.unsupportedTitle") }}</h2>
      <p>{{ t("path.unsupportedDesc") }}</p>
    </div>

    <div v-else-if="curriculum?.status === 'level_complete'" class="empty-state">
      <span class="empty-emoji">🎓</span>
      <h2>{{ t("path.levelCompleteTitle", { level: completedLevelLabel }) }}</h2>
      <p>{{ t("path.levelCompleteDesc") }}</p>
    </div>

    <div v-else-if="curriculum" ref="pathScrollEl" class="path-scroll">
      <div
        v-for="(unit, uIdx) in curriculum.units"
        :key="unit.id"
        class="unit-block"
        :style="{ '--unit-hue': unitHue(uIdx) }"
      >
        <div class="unit-guide">
          <div class="guide-book">📘</div>
          <div class="guide-text">
            <span class="guide-label">{{ t("path.unitLabel", { id: unit.id }) }}</span>
            <h2 class="guide-title">{{ unit.title_native }}</h2>
            <p class="guide-sub">{{ unit.title_target }}</p>
          </div>
        </div>

        <div class="path-lane">
          <div
            v-for="(section, idx) in unit.sections"
            :key="section.id"
            class="path-step"
            :id="currentSectionDomId(section)"
            :class="[
              laneClass(idx),
              {
                'is-current': section.current,
                'is-highlighted': highlightedSectionId === section.id,
                'is-celebrating': celebratingSectionId === section.id,
              },
            ]"
          >
            <div class="step-body">
              <button
                type="button"
                class="path-node"
                :class="nodeClass(section)"
                :disabled="isNodeDisabled(section)"
                :aria-label="nodeLabel(section)"
                @click="openBriefing(unit, section)"
              >
                <span class="node-inner">
                  <span class="node-icon">{{ nodeIcon(section) }}</span>
                </span>
                <span v-if="section.current" class="node-pulse" />
              </button>

              <div class="node-caption">
                <span v-if="showKindLabel(section)" class="caption-kind">{{ kindLabel(section) }}</span>
                <span class="caption-title">{{ section.title_native }}</span>
                <span
                  v-if="celebrationStarsFor(section)"
                  class="caption-stars"
                  :class="{ 'star-cascade': celebratingSectionId === section.id }"
                >
                  {{ celebrationStarsFor(section) }}
                </span>
              </div>
            </div>

            <svg
              v-if="idx < unit.sections.length - 1"
              class="path-connector"
              viewBox="0 0 100 40"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path :d="connectorPath(idx, idx + 1)" class="connector-line" />
            </svg>
          </div>
        </div>
      </div>
      <div class="path-end-cap" />
    </div>

    <Teleport to="body">
      <div
        v-if="briefingContext"
        class="briefing-overlay"
        @click.self="closeBriefing"
      >
        <div
          ref="briefingSheetEl"
          class="briefing-sheet"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="briefingTitleId"
        >
          <div class="briefing-handle" aria-hidden="true" />

          <header class="briefing-header">
            <span class="briefing-kind">{{ t(sectionKindKey(briefingContext.section.kind)) }}</span>
            <h2 :id="briefingTitleId" class="briefing-title">{{ briefingContext.section.title_native }}</h2>
            <p v-if="briefingContext.section.title_target" class="briefing-subtitle">
              {{ briefingContext.section.title_target }}
            </p>
            <p class="briefing-unit">{{ briefingContext.unit.title_native }}</p>
          </header>

          <div class="briefing-body">
            <template v-if="briefingContext.section.kind === 'practice'">
              <p class="briefing-stat">
                {{
                  t("path.briefingPracticeStats", {
                    n: briefingContext.section.question_count,
                    min: estimatePracticeMinutes(briefingContext.section.question_count),
                  })
                }}
              </p>
              <div class="briefing-stars">
                <template v-if="briefingStar.mode === 'unpassed'">
                  <p>{{ t("path.briefingPassLine") }}</p>
                </template>
                <template v-else>
                  <p class="briefing-star-row">
                    <span class="briefing-star-icons">{{ "★".repeat(briefingStar.stars) }}</span>
                    <span>{{ t("path.briefingStars", { stars: briefingStar.stars }) }}</span>
                  </p>
                  <p v-if="briefingStar.bestScore > 0">
                    {{ t("path.briefingBestScore", { score: briefingStar.bestScore }) }}
                  </p>
                </template>
              </div>
              <p class="briefing-trust">{{ t("path.briefingTrustHint") }}</p>

              <section v-if="briefingInFlight" class="briefing-in-flight">
                <p class="briefing-in-flight-title">{{ t("path.briefingInFlightTitle") }}</p>
                <p class="briefing-in-flight-progress">
                  {{
                    t("path.briefingInFlightProgress", {
                      current: briefingInFlight.current,
                      total: briefingInFlight.total,
                    })
                  }}
                </p>
                <p v-if="briefingInFlight.comboCount > 0" class="briefing-in-flight-combo">
                  {{ t("path.briefingInFlightCombo", { n: briefingInFlight.comboCount }) }}
                </p>
                <div class="briefing-in-flight-bar" aria-hidden="true">
                  <div
                    class="briefing-in-flight-fill"
                    :style="{
                      width:
                        Math.round((briefingInFlight.current / briefingInFlight.total) * 100) +
                        '%',
                    }"
                  />
                </div>
              </section>

              <section v-if="briefingPrepLoading" class="briefing-prep">
                <p class="briefing-prep-title">{{ t("path.briefingPrepTitle") }}</p>
                <div class="briefing-skeleton" />
                <div class="briefing-skeleton short" />
              </section>

              <section
                v-else-if="briefingPrepChips.grammarPoints.length || briefingPrepChips.words.length"
                class="briefing-prep"
              >
                <p class="briefing-prep-title">{{ t("path.briefingPrepTitle") }}</p>
                <ul v-if="briefingPrepChips.grammarPoints.length" class="briefing-point-list">
                  <li v-for="(point, idx) in briefingPrepChips.grammarPoints" :key="idx">{{ point }}</li>
                </ul>
                <div v-if="briefingPrepChips.words.length" class="briefing-chip-row">
                  <span v-for="word in briefingPrepChips.words" :key="word" class="briefing-chip">{{ word }}</span>
                </div>
              </section>

              <section v-for="prep in unfinishedPrep" :key="prep.id" class="briefing-suggest">
                <p>{{ t("path.briefingPrepSuggest", { kind: t(sectionKindKey(prep.kind)) }) }}</p>
                <button type="button" class="briefing-prep-btn" @click="goToPrep(prep)">
                  {{ t("path.briefingPrepAction") }}
                </button>
              </section>
            </template>

            <template v-else-if="briefingContext.section.kind === 'grammar'">
              <p>{{ t("path.briefingGrammarHint") }}</p>
              <p class="briefing-stat">{{ t("path.briefingGrammarDuration") }}</p>
              <p v-if="briefingContext.section.stars > 0" class="briefing-done">✓ {{ t("path.briefingStars", { stars: briefingContext.section.stars }) }}</p>
            </template>

            <template v-else-if="briefingContext.section.kind === 'vocab'">
              <p>{{ t("path.briefingVocabHint", { n: briefingContext.section.question_count }) }}</p>
              <p v-if="briefingContext.section.stars > 0" class="briefing-done">✓ {{ t("path.briefingStars", { stars: briefingContext.section.stars }) }}</p>
            </template>
          </div>

          <footer class="briefing-footer">
            <button
              ref="briefingStartBtn"
              type="button"
              class="briefing-start-btn"
              @click="confirmBriefing"
            >
              {{ briefingPrimaryLabel }}
            </button>
            <button
              v-if="briefingInFlight"
              type="button"
              class="briefing-restart-btn"
              @click="requestRestartBriefing"
            >
              {{ t("path.briefingRestart") }}
            </button>
            <button type="button" class="briefing-cancel-btn" @click="closeBriefing">
              {{ t("path.briefingCancel") }}
            </button>
          </footer>
        </div>
      </div>
    </Teleport>

    <ConfirmDialog
      :show="showRestartConfirm"
      :message="t('path.lessonRestartConfirm')"
      @confirm="confirmRestartBriefing"
      @cancel="showRestartConfirm = false"
    />

    <Teleport to="body">
      <Transition name="celebration-toast-fade">
        <div v-if="showCelebrationToast && celebrationToast" class="celebration-toast">
          <p class="celebration-toast-main">{{ celebrationToast.main }}</p>
          <p v-if="celebrationToast.sub" class="celebration-toast-sub">{{ celebrationToast.sub }}</p>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="jump-fab">
        <div v-if="showJumpFab" class="jump-current-bar">
          <button type="button" class="jump-current-btn" @click="onJumpCurrentClick">
            <span class="jump-current-icon" aria-hidden="true">▶</span>
            <span class="jump-current-copy">
              <span class="jump-current-label">{{ t("path.continueCurrent") }}</span>
              <span v-if="continueCurrentSub" class="jump-current-sub">{{ continueCurrentSub }}</span>
            </span>
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { CEFR_LEVELS, CEFR_LEVEL_CHANGED, LEARNING_CEFR_LEVELS } from "@/shared/constants.js";
import { eventBus } from "@/shared/eventBus.js";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "@/shared/components/PageHeader.vue";
import ConfirmDialog from "@/shared/components/ConfirmDialog.vue";
import { useI18n } from "@/shared/i18n";
import {
  getPathCurriculum,
  getCurrentUser,
  getLearningStreak,
  getTeachingContent,
  updateLearningGoalCefr,
} from "@/shared/api.js";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import {
  canResumeSection,
  findCurrentSection,
  pathSectionRoute,
  sectionKindKey,
} from "@/modules/learn/pathResume.js";
import {
  currentSectionDomId,
  PATH_FOCUS_QUERY,
  shouldShowJumpToCurrent,
} from "./pathMapScroll.js";
import {
  CELEBRATE_QUERY,
  CELEBRATION_DURATION_MS,
  celebrationToastCopy,
  findSectionUnit,
  isUnitJustCompleted,
  parseCelebrationQuery,
} from "./pathCompletionCelebration.js";
import {
  briefingStarDisplay,
  estimatePracticeMinutes,
  findUnfinishedPrepSections,
  isBriefingEligible,
  prepBriefingChips,
  prepTeachingNodeId,
  shouldShowNodeBriefing,
} from "./pathNodeBriefing.js";
import {
  buildPairKey,
  clearLessonInFlight,
  practiceInFlightSummary,
} from "./lessonInFlight.js";

const UNIT_HUES = [145, 198, 262, 32, 12, 210];
const LANE_X = { left: 22, center: 50, right: 78 };
const CONNECTOR_HEIGHT = 40;

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const targetLangStore = useTargetLangStore();

const loading = ref(true);
const error = ref("");
const curriculum = ref(null);
const learningStreak = ref(null);
const currentCefr = ref("A1");
const levelSwitching = ref(false);
const showLevelPicker = ref(false);
const learningLevels = LEARNING_CEFR_LEVELS;
const pathScrollEl = ref(null);
const currentVisible = ref(true);
const highlightedSectionId = ref(null);
const celebratingSectionId = ref(null);
const celebrationContext = ref(null);
const showCelebrationToast = ref(false);
const briefingContext = ref(null);
const briefingPrep = ref(null);
const briefingPrepLoading = ref(false);
const briefingSheetEl = ref(null);
const briefingStartBtn = ref(null);
const lessonPairKey = ref("");
const showRestartConfirm = ref(false);

let currentObserver = null;
let highlightTimer = null;
let celebrationTimer = null;
let celebrationScrollTimer = null;
let briefingPrepRequest = 0;

const briefingTitleId = "path-briefing-title";

const briefingStar = computed(() =>
  briefingStarDisplay(briefingContext.value?.section),
);

const unfinishedPrep = computed(() => {
  const ctx = briefingContext.value;
  if (!ctx) return [];
  return findUnfinishedPrepSections(ctx.unit, ctx.section);
});

const briefingPrepChips = computed(() => prepBriefingChips(briefingPrep.value));

const briefingInFlight = computed(() => {
  const section = briefingContext.value?.section;
  if (!section || section.kind !== "practice" || !lessonPairKey.value) return null;
  return practiceInFlightSummary(
    lessonPairKey.value,
    section.id,
    section.question_count,
  );
});

const briefingPrimaryLabel = computed(() =>
  briefingInFlight.value ? t("path.briefingResume") : t("path.briefingStart"),
);

const currentTarget = computed(() => findCurrentSection(curriculum.value));

const celebrationToast = computed(() => {
  const payload = celebrationContext.value;
  if (!payload) return null;
  const found = findSectionUnit(curriculum.value, payload.sectionId);
  return celebrationToastCopy(payload, t, {
    sectionTitle: found?.section?.title_native ?? "",
    kindLabel: found?.section ? t(sectionKindKey(found.section.kind)) : "",
  });
});

const showJumpFab = computed(
  () =>
    !showCelebrationToast.value &&
    shouldShowJumpToCurrent({
      hasCurrent: !!currentTarget.value,
      currentVisible: currentVisible.value,
      curriculumActive: curriculum.value?.status === "active",
    }),
);

const continueCurrentSub = computed(() => {
  const section = currentTarget.value?.section;
  if (!section) return "";
  return t("path.continueCurrentSub", {
    kind: t(sectionKindKey(section.kind)),
    title: section.title_native,
  });
});

const completedLevelLabel = computed(() => {
  const current = curriculum.value?.cefr;
  if (!current) return "";
  const idx = CEFR_LEVELS.indexOf(current);
  return idx > 0 ? CEFR_LEVELS[idx - 1] : current;
});

function unitHue(idx) {
  return UNIT_HUES[idx % UNIT_HUES.length];
}

function laneKey(idx) {
  return ["left", "center", "right"][idx % 3];
}

function laneClass(idx) {
  return `lane-${laneKey(idx)}`;
}

function connectorPath(fromIdx, toIdx) {
  const x1 = LANE_X[laneKey(fromIdx)];
  const x2 = LANE_X[laneKey(toIdx)];
  const mid = CONNECTOR_HEIGHT / 2;
  return `M ${x1} 0 C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${CONNECTOR_HEIGHT}`;
}

function nodeClass(section) {
  return {
    locked: section.locked,
    completed: section.stars > 0,
    current: section.current,
    empty: section.kind === "practice" && section.question_count === 0,
    grammar: section.kind === "grammar",
    vocab: section.kind === "vocab",
    practice: section.kind === "practice",
  };
}

function kindLabel(section) {
  if (section.kind === "grammar") return t("path.nodeGrammar");
  if (section.kind === "vocab") return t("path.nodeVocab");
  return t("path.nodePractice");
}

function showKindLabel(section) {
  return kindLabel(section) !== section.title_native;
}

function celebrationStarsFor(section) {
  if (celebratingSectionId.value === section.id && celebrationContext.value?.stars > 0) {
    return "★".repeat(celebrationContext.value.stars);
  }
  if (section.kind === "practice" && section.stars > 0) {
    return "★".repeat(section.stars);
  }
  return "";
}

function nodeIcon(section) {
  if (section.locked) return "🔒";
  if (section.kind === "grammar") return section.stars > 0 ? "✓" : "📖";
  if (section.kind === "vocab") return section.stars > 0 ? "✓" : "🃏";
  if (section.stars > 0) return "★";
  return "●";
}

function nodeLabel(section) {
  return `${kindLabel(section)}: ${section.title_native}`;
}

function isNodeDisabled(section) {
  if (section.locked) return true;
  if (section.kind === "practice") return section.question_count === 0;
  return false;
}

function goBack() {
  router.replace({ name: "learn" });
}

function launchSection(section) {
  router.push(pathSectionRoute(section));
}

function openBriefing(unit, section) {
  if (!shouldShowNodeBriefing() || !isBriefingEligible(section)) return;
  briefingContext.value = { unit, section };
  briefingPrep.value = null;
  window.addEventListener("keydown", onBriefingKeydown);
  if (section.kind === "practice") {
    loadBriefingPrep(section);
  }
  nextTick(() => briefingStartBtn.value?.focus());
}

function closeBriefing() {
  briefingContext.value = null;
  briefingPrep.value = null;
  briefingPrepLoading.value = false;
  briefingPrepRequest += 1;
  window.removeEventListener("keydown", onBriefingKeydown);
}

function confirmBriefing() {
  const section = briefingContext.value?.section;
  if (!section) return;
  closeBriefing();
  launchSection(section);
}

function requestRestartBriefing() {
  if (!briefingInFlight.value) return;
  showRestartConfirm.value = true;
}

function confirmRestartBriefing() {
  const section = briefingContext.value?.section;
  showRestartConfirm.value = false;
  if (!section || !lessonPairKey.value) return;
  clearLessonInFlight(lessonPairKey.value, section.id);
  closeBriefing();
  launchSection(section);
}

function goToPrep(prepSection) {
  closeBriefing();
  launchSection(prepSection);
}

function onBriefingKeydown(event) {
  if (event.key !== "Escape") return;
  event.preventDefault();
  closeBriefing();
}

async function loadBriefingPrep(section) {
  const requestId = ++briefingPrepRequest;
  briefingPrepLoading.value = true;
  briefingPrep.value = null;
  try {
    const grammarId = prepTeachingNodeId(section.id, "GRAMMAR");
    const vocabId = prepTeachingNodeId(section.id, "VOCAB");
    const { user, targetLang, cefr } = await loadLearningContext({
      targetLangStore,
      cefrFallback: currentCefr.value || "A1",
    });
    const [grammarContent, vocabContent] = await Promise.all([
      grammarId
        ? getTeachingContent(user.native_language, targetLang, cefr, grammarId).catch(() => null)
        : null,
      vocabId
        ? getTeachingContent(user.native_language, targetLang, cefr, vocabId).catch(() => null)
        : null,
    ]);
    if (requestId !== briefingPrepRequest) return;
    briefingPrep.value = {
      grammar_points: grammarContent?.grammar_points ?? [],
      words: vocabContent?.words ?? [],
      goal_native: grammarContent?.goal_native ?? null,
    };
  } catch {
    if (requestId !== briefingPrepRequest) return;
    briefingPrep.value = null;
  } finally {
    if (requestId === briefingPrepRequest) {
      briefingPrepLoading.value = false;
    }
  }
}

function disconnectCurrentObserver() {
  currentObserver?.disconnect();
  currentObserver = null;
}

async function setupCurrentObserver() {
  disconnectCurrentObserver();
  await nextTick();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const scrollEl = pathScrollEl.value;
  const section = currentTarget.value?.section;
  const domId = currentSectionDomId(section);
  if (!scrollEl || !domId) {
    currentVisible.value = false;
    return;
  }

  const el = scrollEl.querySelector(`#${CSS.escape(domId)}`);
  if (!el) {
    currentVisible.value = false;
    return;
  }

  currentObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (!entry) return;
      currentVisible.value =
        entry.isIntersecting && entry.intersectionRatio >= 0.35;
    },
    { root: scrollEl, threshold: [0, 0.35, 1] },
  );
  currentObserver.observe(el);
}

function flashCurrentHighlight(sectionId) {
  if (!sectionId) return;
  highlightedSectionId.value = sectionId;
  if (highlightTimer) clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    highlightedSectionId.value = null;
    highlightTimer = null;
  }, 300);
}

async function scrollToSection(sectionId, { smooth = true } = {}) {
  if (!sectionId || curriculum.value?.status !== "active") return;

  await nextTick();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const scrollEl = pathScrollEl.value;
  const domId = `path-node-${sectionId}`;
  const el =
    scrollEl?.querySelector(`#${CSS.escape(domId)}`) ?? document.getElementById(domId);
  if (!el) return;

  el.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
}

async function scrollToCurrentSection({ smooth = true } = {}) {
  const section = currentTarget.value?.section;
  const domId = currentSectionDomId(section);
  if (!domId || curriculum.value?.status !== "active") return;

  await nextTick();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const scrollEl = pathScrollEl.value;
  const el =
    scrollEl?.querySelector(`#${CSS.escape(domId)}`) ?? document.getElementById(domId);
  if (!el) return;

  el.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
  flashCurrentHighlight(section.id);
}

function clearCelebrationTimers() {
  if (celebrationTimer) {
    clearTimeout(celebrationTimer);
    celebrationTimer = null;
  }
  if (celebrationScrollTimer) {
    clearTimeout(celebrationScrollTimer);
    celebrationScrollTimer = null;
  }
}

function clearCelebrationState() {
  celebratingSectionId.value = null;
  celebrationContext.value = null;
  showCelebrationToast.value = false;
}

async function runCelebrationIfNeeded() {
  const payload = parseCelebrationQuery(route.query);
  if (!payload || curriculum.value?.status !== "active") return false;

  const found = findSectionUnit(curriculum.value, payload.sectionId);
  if (found && isUnitJustCompleted(curriculum.value, payload.sectionId)) {
    payload.unitComplete = true;
    payload.unitTitle = found.unit.title_native;
  }

  clearCelebrationTimers();
  celebrationContext.value = payload;
  celebratingSectionId.value = payload.sectionId;
  showCelebrationToast.value = true;

  await scrollToSection(payload.sectionId, { smooth: true });

  const currentId = currentTarget.value?.section?.id;
  if (currentId && currentId !== payload.sectionId) {
    celebrationScrollTimer = setTimeout(() => {
      scrollToCurrentSection({ smooth: true });
      celebrationScrollTimer = null;
    }, 600);
  }

  router.replace({ name: "path" });

  celebrationTimer = setTimeout(() => {
    clearCelebrationState();
    if (currentId) {
      flashCurrentHighlight(currentId);
    }
    celebrationTimer = null;
  }, CELEBRATION_DURATION_MS);

  await setupCurrentObserver();
  return true;
}

async function focusCurrentOnMap() {
  await setupCurrentObserver();
  await scrollToCurrentSection({ smooth: true });
}

function onJumpCurrentClick() {
  const section = currentTarget.value?.section;
  if (!section) return;
  if (canResumeSection(section)) {
    router.push(pathSectionRoute(section));
    return;
  }
  scrollToCurrentSection({ smooth: true });
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const { user, targetLang, cefr } = await loadLearningContext({
      targetLangStore,
      cefrFallback: currentCefr.value || "A1",
    });
    currentCefr.value = cefr;
    lessonPairKey.value = buildPairKey(user.native_language, targetLang, cefr);
    curriculum.value = await getPathCurriculum(user.native_language, targetLang, cefr);
    learningStreak.value = await getLearningStreak(user.id);
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
  await nextTick();
  if (curriculum.value?.status === "active") {
    const celebrated = await runCelebrationIfNeeded();
    if (!celebrated && currentTarget.value) {
      await focusCurrentOnMap();
    } else if (!celebrated) {
      currentVisible.value = false;
      disconnectCurrentObserver();
    }
  } else {
    currentVisible.value = false;
    disconnectCurrentObserver();
  }
}

async function onSwitchLevel(level) {
  if (levelSwitching.value || level === currentCefr.value) return;
  const targetLang = targetLangStore.code || (await targetLangStore.load());
  if (!targetLang) return;
  levelSwitching.value = true;
  error.value = "";
  try {
    await updateLearningGoalCefr(targetLang, level);
    currentCefr.value = level;
    eventBus.emit(CEFR_LEVEL_CHANGED, { cefr: level });
    const user = await getCurrentUser();
    curriculum.value = await getPathCurriculum(user.native_language, targetLang, level);
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    levelSwitching.value = false;
  }
  await nextTick();
  if (curriculum.value?.status === "active" && currentTarget.value) {
    await focusCurrentOnMap();
  } else {
    currentVisible.value = false;
    disconnectCurrentObserver();
  }
}

async function pickLevel(level) {
  showLevelPicker.value = false;
  await onSwitchLevel(level);
}

watch(
  () => route.query.focus,
  async (focus) => {
    if (focus !== PATH_FOCUS_QUERY || loading.value || !curriculum.value) return;
    if (route.query[CELEBRATE_QUERY]) return;
    await focusCurrentOnMap();
    router.replace({ name: "path" });
  },
);

watch(
  () => route.query[CELEBRATE_QUERY],
  async (celebrate) => {
    if (!celebrate || loading.value || !curriculum.value) return;
    await runCelebrationIfNeeded();
  },
);

onMounted(load);
onActivated(async () => {
  if (!loading.value && curriculum.value?.status === "active") {
    const celebrated = await runCelebrationIfNeeded();
    if (!celebrated && currentTarget.value) {
      await focusCurrentOnMap();
    }
  }
});
onBeforeUnmount(() => {
  disconnectCurrentObserver();
  if (highlightTimer) clearTimeout(highlightTimer);
  clearCelebrationTimers();
  window.removeEventListener("keydown", onBriefingKeydown);
});
</script>

<style scoped>
.path-map {
  min-height: 100%;
  background: linear-gradient(180deg, #b8e6ff 0%, #d8f4e8 35%, #eef8f0 100%);
  display: flex;
  flex-direction: column;
}

.header-text {
  min-width: 0;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.page-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-light);
  font-weight: 600;
}

.streak-pill {
  margin-left: 4px;
  color: var(--orange-hover);
}

.level-btn {
  grid-row: 1 / 3;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  align-self: center;
  justify-self: end;
  padding: 6px 10px;
  border: 2px solid var(--green);
  border-radius: 999px;
  background: var(--green-bg);
  color: var(--green-hover);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  min-width: 0;
  font-family: inherit;
  flex-shrink: 0;
}

.level-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.level-btn-chevron {
  font-size: 11px;
  opacity: 0.8;
}

.level-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
  padding: 0 16px calc(16px + var(--safe-bottom));
}

.level-sheet {
  width: 100%;
  max-width: 400px;
  background: var(--white);
  border-radius: 20px 20px 16px 16px;
  padding: 20px 16px 12px;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.12);
}

.level-sheet-title {
  margin: 0 0 12px;
  font-size: 17px;
  font-weight: 700;
  text-align: center;
}

.level-sheet-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.level-sheet-option {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 14px 16px;
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--white);
  font-family: inherit;
  cursor: pointer;
  text-align: left;
}

.level-sheet-option.active {
  border-color: var(--green);
  background: var(--green-bg);
}

.level-sheet-option:disabled {
  opacity: 0.6;
  cursor: wait;
}

.level-sheet-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.level-sheet-code {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-light);
}

.level-sheet-check {
  font-weight: 800;
  color: var(--green-hover);
}

.loading-state,
.error-state,
.empty-state {
  padding: 40px 24px;
  text-align: center;
  color: var(--text-light);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding-top: 60px;
}

.empty-emoji {
  font-size: 56px;
}

.empty-state h2 {
  margin: 0;
  font-size: 20px;
  color: var(--text);
}

.retry-btn {
  margin-top: 12px;
  padding: 10px 20px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--green);
  color: var(--white);
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 0 var(--green-hover);
}

.path-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0 40px;
}

.unit-block {
  margin-bottom: 8px;
}

.unit-guide {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 16px 16px 24px;
  padding: 16px 18px;
  border-radius: 16px;
  background: linear-gradient(
    135deg,
    hsl(var(--unit-hue) 80% 88%) 0%,
    hsl(var(--unit-hue) 70% 78%) 100%
  );
  border: 3px solid hsl(var(--unit-hue) 55% 62%);
  box-shadow: 0 6px 0 hsl(var(--unit-hue) 45% 52%);
}

.guide-book {
  font-size: 36px;
  line-height: 1;
  flex-shrink: 0;
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.15));
}

.guide-text {
  flex: 1;
  min-width: 0;
}

.guide-label {
  display: block;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.45);
}

.guide-title {
  margin: 4px 0 0;
  font-size: 17px;
  font-weight: 800;
  color: rgba(0, 0, 0, 0.82);
  line-height: 1.25;
}

.guide-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.5);
  font-weight: 600;
  overflow-wrap: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.path-lane {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0 24px;
}

.path-step {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  padding: 4px 0 0;
}

.path-connector {
  display: block;
  width: 100%;
  height: 40px;
  margin: 2px 0 8px;
  flex-shrink: 0;
  pointer-events: none;
}

.connector-line {
  fill: none;
  stroke: var(--green);
  stroke-width: 7;
  stroke-linecap: round;
}

.path-step.lane-left .step-body {
  align-self: flex-start;
  margin-left: 14%;
}

.path-step.lane-center .step-body {
  align-self: center;
}

.path-step.lane-right .step-body {
  align-self: flex-end;
  margin-right: 14%;
}

.step-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  position: relative;
  z-index: 1;
  width: 112px;
}

.path-node {
  position: relative;
  width: 68px;
  height: 68px;
  border: none;
  border-radius: 50%;
  padding: 0;
  cursor: pointer;
  background: transparent;
}

.node-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 4px solid rgba(255, 255, 255, 0.9);
  font-size: 22px;
  font-weight: 800;
  transition: transform 0.15s ease;
}

.path-node.grammar .node-inner {
  background: linear-gradient(180deg, #e9d5ff 0%, #ce82ff 100%);
  box-shadow: 0 6px 0 #a855f7;
  color: #4c1d95;
}

.path-node.vocab .node-inner {
  background: linear-gradient(180deg, #7dd3fc 0%, #1cb0f6 100%);
  box-shadow: 0 6px 0 #1899d6;
  color: var(--white);
}

.path-node.practice .node-inner {
  background: linear-gradient(180deg, #7ee028 0%, #58cc02 100%);
  box-shadow: 0 6px 0 #46a302;
  color: var(--white);
}

.path-node.completed .node-inner {
  background: linear-gradient(180deg, #fde68a 0%, #fbbf24 100%);
  box-shadow: 0 6px 0 #d97706;
  color: #78350f;
}

.path-node.locked .node-inner {
  background: linear-gradient(180deg, #e5e7eb 0%, #d1d5db 100%);
  box-shadow: 0 6px 0 #9ca3af;
  color: #6b7280;
  opacity: 0.85;
}

.path-node.current .node-inner {
  transform: scale(1.06);
}

.node-pulse {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 3px solid var(--green);
  animation: pulse-ring 1.6s ease-out infinite;
  pointer-events: none;
}

@keyframes pulse-ring {
  0% { transform: scale(0.95); opacity: 0.9; }
  70% { transform: scale(1.15); opacity: 0; }
  100% { transform: scale(1.15); opacity: 0; }
}

.path-node:not(:disabled):active .node-inner {
  transform: translateY(4px);
  box-shadow: 0 2px 0 #46a302;
}

.path-node.grammar:not(:disabled):active .node-inner {
  box-shadow: 0 2px 0 #a855f7;
}

.path-node.vocab:not(:disabled):active .node-inner {
  box-shadow: 0 2px 0 #1899d6;
}

.path-node:disabled {
  cursor: not-allowed;
}

.node-caption {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 100%;
  text-align: center;
}

.caption-kind {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.4);
}

.caption-title {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
  color: rgba(0, 0, 0, 0.75);
}

.caption-stars {
  font-size: 12px;
  color: #d97706;
  letter-spacing: 1px;
}

.path-end-cap {
  height: 48px;
}

.path-step.is-current .caption-title {
  color: var(--green-hover);
}

.path-step.is-highlighted .path-node.current .node-inner {
  animation: highlight-pop 0.3s ease;
}

.path-step.is-celebrating .path-node.completed .node-inner {
  animation: celebrate-pop 1.8s ease;
  box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.35), 0 0 24px rgba(251, 191, 36, 0.45);
}

.caption-stars.star-cascade {
  display: inline-block;
  animation: star-cascade 0.75s ease forwards;
}

@keyframes celebrate-pop {
  0% { transform: scale(1); }
  20% { transform: scale(1.12); }
  45% { transform: scale(1.06); }
  100% { transform: scale(1); }
}

@keyframes star-cascade {
  0% { opacity: 0; transform: scale(0.4); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes highlight-pop {
  0% { transform: scale(1.12); }
  100% { transform: scale(1.06); }
}

.celebration-toast {
  position: fixed;
  top: calc(var(--safe-top) + 12px);
  left: 16px;
  right: 16px;
  z-index: 950;
  max-width: 448px;
  margin: 0 auto;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, #fff7e6 0%, #fff 55%);
  box-shadow: 0 6px 24px rgba(217, 119, 6, 0.18);
  text-align: center;
}

.celebration-toast-main {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: #b45309;
}

.celebration-toast-sub {
  margin: 4px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.55);
}

.celebration-toast-fade-enter-active,
.celebration-toast-fade-leave-active {
  transition: opacity 0.35s ease, transform 0.35s ease;
}

.celebration-toast-fade-enter-from,
.celebration-toast-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.jump-current-bar {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: calc(var(--safe-bottom) + 56px);
  z-index: 900;
  max-width: 448px;
  margin: 0 auto;
}

.jump-current-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 16px;
  border: none;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.14);
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  backdrop-filter: blur(8px);
}

.jump-current-btn:active {
  transform: translateY(1px);
}

.jump-current-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--green-hover);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}

.jump-current-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.jump-current-label {
  font-size: 14px;
  font-weight: 800;
  color: var(--text);
}

.jump-current-sub {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-light);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.jump-fab-enter-active,
.jump-fab-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.jump-fab-enter-from,
.jump-fab-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.briefing-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
  padding: 0 16px calc(16px + var(--safe-bottom));
}

.briefing-sheet {
  width: 100%;
  max-width: 400px;
  max-height: min(78vh, 640px);
  overflow-y: auto;
  background: var(--white);
  border-radius: 20px 20px 16px 16px;
  padding: 12px 16px calc(12px + var(--safe-bottom));
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.12);
}

.briefing-handle {
  width: 40px;
  height: 4px;
  margin: 0 auto 12px;
  border-radius: 999px;
  background: var(--border);
}

.briefing-header {
  text-align: center;
  margin-bottom: 14px;
}

.briefing-kind {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--green-bg);
  color: var(--green-hover);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.briefing-title {
  margin: 10px 0 0;
  font-size: 18px;
  font-weight: 800;
  color: var(--text);
  line-height: 1.3;
}

.briefing-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-light);
  font-weight: 600;
}

.briefing-unit {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-light);
  font-weight: 600;
}

.briefing-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 14px;
  color: var(--text);
  line-height: 1.45;
}

.briefing-stat {
  margin: 0;
  font-weight: 700;
  color: var(--green-hover);
}

.briefing-stars {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--green-bg);
  font-size: 13px;
  font-weight: 600;
}

.briefing-star-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px;
}

.briefing-star-icons {
  color: #d97706;
  letter-spacing: 1px;
}

.briefing-trust {
  margin: 0;
  font-size: 12px;
  color: var(--text-light);
  font-weight: 600;
}

.briefing-prep {
  padding: 10px 0 4px;
  border-top: 1px solid var(--border);
}

.briefing-prep-title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-light);
}

.briefing-point-list {
  margin: 0 0 8px;
  padding-left: 18px;
  font-size: 13px;
}

.briefing-point-list li + li {
  margin-top: 4px;
}

.briefing-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.briefing-chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: #e0f2fe;
  color: #0369a1;
  font-size: 12px;
  font-weight: 700;
}

.briefing-skeleton {
  height: 14px;
  border-radius: 6px;
  background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
  background-size: 200% 100%;
  animation: briefing-shimmer 1.2s ease infinite;
}

.briefing-skeleton.short {
  width: 65%;
  margin-top: 8px;
}

@keyframes briefing-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.briefing-suggest {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: #fff7ed;
  font-size: 13px;
  font-weight: 600;
}

.briefing-prep-btn {
  align-self: flex-start;
  padding: 8px 14px;
  border: 2px solid #f97316;
  border-radius: var(--radius-sm);
  background: var(--white);
  color: #c2410c;
  font-family: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.briefing-done {
  margin: 0;
  font-weight: 700;
  color: var(--green-hover);
}

.briefing-in-flight {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: #ecfdf5;
}

.briefing-in-flight-title {
  margin: 0;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #047857;
}

.briefing-in-flight-progress {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  color: #065f46;
}

.briefing-in-flight-combo {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #b45309;
}

.briefing-in-flight-bar {
  height: 6px;
  border-radius: 999px;
  background: #d1fae5;
  overflow: hidden;
}

.briefing-in-flight-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--green);
  transition: width 0.2s ease;
}

.briefing-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.briefing-start-btn {
  width: 100%;
  padding: 14px 16px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--green);
  color: var(--white);
  font-family: inherit;
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 0 var(--green-hover);
}

.briefing-start-btn:active {
  transform: translateY(2px);
  box-shadow: 0 2px 0 var(--green-hover);
}

.briefing-restart-btn {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--white);
  color: var(--text);
  font-family: inherit;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.briefing-cancel-btn {
  width: 100%;
  padding: 12px 16px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-light);
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
</style>