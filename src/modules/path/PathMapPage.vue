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

    <p v-if="nodeActionHint" class="node-action-hint" role="status">{{ nodeActionHint }}</p>

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

    <div v-else-if="curriculum" ref="pathScroll" class="path-scroll">
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
            :class="[laneClass(idx), { 'is-current': section.current }]"
          >
            <div class="step-body">
              <button
                type="button"
                class="path-node"
                :class="nodeClass(section)"
                :aria-disabled="isNodeDisabled(section) ? 'true' : 'false'"
                :aria-label="nodeLabel(section)"
                @click="startNode(section)"
              >
                <span class="node-inner">
                  <span class="node-icon">{{ nodeIcon(section) }}</span>
                </span>
                <span v-if="section.current" class="node-pulse" />
              </button>

              <div class="node-caption">
                <span v-if="showKindLabel(section)" class="caption-kind">{{ kindLabel(section) }}</span>
                <span class="caption-title">{{ section.title_native }}</span>
                <span v-if="section.kind === 'practice' && section.stars > 0" class="caption-stars">
                  {{ "★".repeat(section.stars) }}
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
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from "vue";
import { CEFR_LEVELS, learningCefrLevels } from "@/shared/constants.js";
import { useRouter } from "vue-router";
import PageHeader from "@/shared/components/PageHeader.vue";
import { useI18n } from "@/shared/i18n";
import { getPathCurriculum } from "@/shared/backend/path.js";
import { getCurrentUser, updateLearningGoalCefr } from "@/shared/backend/user.js";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { loadLearningContext } from "@/shared/learningContext.js";

const UNIT_HUES = [145, 198, 262, 32, 12, 210];
const LANE_X = { left: 22, center: 50, right: 78 };
const CONNECTOR_HEIGHT = 40;

const router = useRouter();
const { t } = useI18n();
const targetLangStore = useTargetLangStore();

const loading = ref(true);
const error = ref("");
const curriculum = ref(null);
const currentCefr = ref("A1");
const levelSwitching = ref(false);
const showLevelPicker = ref(false);
const pathScroll = ref(null);
const nodeActionHint = ref("");
const learningLevels = computed(() => learningCefrLevels(targetLangStore.code));

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

function startNode(section) {
  if (isNodeDisabled(section)) {
    // Give remote users an explicit reason instead of a silent no-op.
    if (section.locked) {
      nodeActionHint.value = t("path.nodeLocked");
    } else if (section.kind === "practice" && section.question_count === 0) {
      nodeActionHint.value = t("path.nodeEmpty");
    }
    return;
  }
  nodeActionHint.value = "";
  if (section.kind === "grammar" || section.kind === "vocab") {
    router.push({ name: "path-teaching", params: { nodeId: section.id } });
    return;
  }
  router.push({ name: "path-lesson", params: { sectionId: section.id } });
}

async function scrollToCurrentNode() {
  await nextTick();
  const scroller = pathScroll.value;
  if (!scroller || curriculum.value?.status !== "active") return;
  const currentStep = scroller.querySelector(".path-step.is-current");
  if (!currentStep) return;
  requestAnimationFrame(() => {
    const scrollerRect = scroller.getBoundingClientRect();
    const stepRect = currentStep.getBoundingClientRect();
    const stepTop = scroller.scrollTop + stepRect.top - scrollerRect.top;
    const top = stepTop - scroller.clientHeight * 0.42 + currentStep.clientHeight / 2;
    scroller.scrollTo({ top: Math.max(0, top), behavior: "auto" });
  });
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
    curriculum.value = await getPathCurriculum(user.native_language, targetLang, cefr);
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
    await scrollToCurrentNode();
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
    const user = await getCurrentUser();
    curriculum.value = await getPathCurriculum(user.native_language, targetLang, level);
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    levelSwitching.value = false;
    await scrollToCurrentNode();
  }
}

async function pickLevel(level) {
  showLevelPicker.value = false;
  await onSwitchLevel(level);
}

onMounted(load);
</script>

<style scoped>
.path-map {
  height: 100%;
  min-height: 0;
  background: linear-gradient(180deg, #b8e6ff 0%, #d8f4e8 35%, #eef8f0 100%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header-text {
  min-width: 0;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.page-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-light);
  font-weight: 600;
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

html[data-app-mode="tv"] .level-overlay {
  align-items: center;
  padding: 24px;
}

.level-sheet {
  width: 100%;
  max-width: 400px;
  background: var(--white);
  border-radius: 20px 20px 16px 16px;
  padding: 20px 16px 12px;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.12);
}

html[data-app-mode="tv"] .level-sheet {
  max-width: 520px;
  border-radius: 20px;
  padding: 28px 24px 20px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
}

html[data-app-mode="tv"] .level-sheet-option {
  min-height: 64px;
  font-size: 18px;
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

.node-action-hint {
  margin: 0;
  padding: 10px 16px;
  text-align: center;
  font-size: 14px;
  font-weight: 700;
  color: var(--orange-hover, #c2410c);
  background: var(--orange-bg, #fff7ed);
  border-bottom: 1px solid var(--border);
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
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 0 40px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.path-scroll::-webkit-scrollbar {
  display: none;
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
  margin-left: max(0px, calc(22% - 56px));
}

.path-step.lane-center .step-body {
  align-self: center;
}

.path-step.lane-right .step-body {
  align-self: flex-end;
  margin-right: max(0px, calc(22% - 56px));
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

html[data-app-mode="tv"] .path-node {
  width: 88px;
  height: 88px;
}

html[data-app-mode="tv"] .step-body {
  width: 140px;
}

html[data-app-mode="tv"] .node-inner {
  font-size: 28px;
  border-width: 5px;
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

.path-node:not([aria-disabled="true"]):active .node-inner {
  transform: translateY(4px);
  box-shadow: 0 2px 0 #46a302;
}

.path-node.grammar:not([aria-disabled="true"]):active .node-inner {
  box-shadow: 0 2px 0 #a855f7;
}

.path-node.vocab:not([aria-disabled="true"]):active .node-inner {
  box-shadow: 0 2px 0 #1899d6;
}

/* Locked/empty nodes stay focusable + clickable so TV remotes can surface
   nodeActionHint; navigation is still blocked inside startNode(). */
.path-node[aria-disabled="true"] {
  cursor: not-allowed;
}

.path-node[aria-disabled="true"] .node-inner {
  opacity: 0.85;
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
</style>
