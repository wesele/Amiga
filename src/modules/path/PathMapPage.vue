<template>
  <div class="path-map">
    <header class="page-header">
      <button class="back-btn" :aria-label="t('common.back')" @click="goBack">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <div class="header-text">
        <h1 class="page-title">{{ t("path.title") }}</h1>
        <p v-if="curriculum?.status === 'active'" class="page-sub">
          {{ t("path.progress", { done: curriculum.completed_sections, total: curriculum.total_sections }) }}
          · ⭐ {{ curriculum.total_stars }}
        </p>
      </div>
      <div class="level-pills">
        <button
          v-for="lvl in learningLevels"
          :key="lvl"
          type="button"
          class="level-pill"
          :class="{ active: currentCefr === lvl }"
          :disabled="levelSwitching"
          @click="onSwitchLevel(lvl)"
        >
          {{ lvl }}
        </button>
      </div>
    </header>

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

    <div v-else-if="curriculum" class="path-scroll">
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
            <div class="connector" v-if="idx > 0" />

            <button
              type="button"
              class="path-node"
              :class="nodeClass(section)"
              :disabled="isNodeDisabled(section)"
              :aria-label="nodeLabel(section)"
              @click="startNode(section)"
            >
              <span class="node-inner">
                <span class="node-icon">{{ nodeIcon(section) }}</span>
              </span>
              <span v-if="section.current" class="node-pulse" />
            </button>

            <div class="node-caption">
              <span class="caption-kind">{{ kindLabel(section) }}</span>
              <span class="caption-title">{{ section.title_native }}</span>
              <span v-if="section.kind === 'practice' && section.stars > 0" class="caption-stars">
                {{ "★".repeat(section.stars) }}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div class="path-end-cap" />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { CEFR_LEVELS, LEARNING_CEFR_LEVELS } from "@/shared/constants.js";
import { useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import {
  getPathCurriculum,
  getCurrentUser,
  getLearningGoals,
  updateLearningGoalCefr,
} from "@/shared/api.js";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { pickLearningGoal } from "@/shared/learningGoal.js";

const UNIT_HUES = [145, 198, 262, 32, 12, 210];

const router = useRouter();
const { t } = useI18n();
const targetLangStore = useTargetLangStore();

const loading = ref(true);
const error = ref("");
const curriculum = ref(null);
const currentCefr = ref("A1");
const levelSwitching = ref(false);
const learningLevels = LEARNING_CEFR_LEVELS;

const completedLevelLabel = computed(() => {
  const current = curriculum.value?.cefr;
  if (!current) return "";
  const idx = CEFR_LEVELS.indexOf(current);
  return idx > 0 ? CEFR_LEVELS[idx - 1] : current;
});

function unitHue(idx) {
  return UNIT_HUES[idx % UNIT_HUES.length];
}

function laneClass(idx) {
  return ["lane-left", "lane-center", "lane-right"][idx % 3];
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
  if (isNodeDisabled(section)) return;
  if (section.kind === "grammar" || section.kind === "vocab") {
    router.push({ name: "path-teaching", params: { nodeId: section.id } });
    return;
  }
  router.push({ name: "path-lesson", params: { sectionId: section.id } });
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const user = await getCurrentUser();
    const targetLang = targetLangStore.code || (await targetLangStore.load());
    const goals = await getLearningGoals(user.id);
    const goal = pickLearningGoal(goals, targetLang);
    const cefr = goal?.cefr_level || currentCefr.value || "A1";
    currentCefr.value = cefr;
    curriculum.value = await getPathCurriculum(user.native_language, targetLang, cefr);
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
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
  }
}

onMounted(load);
</script>

<style scoped>
.path-map {
  min-height: 100%;
  background: linear-gradient(180deg, #b8e6ff 0%, #d8f4e8 35%, #eef8f0 100%);
  display: flex;
  flex-direction: column;
}

.page-header {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  grid-template-rows: auto auto;
  gap: 4px 10px;
  padding: 14px 16px 12px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}

.back-btn {
  grid-row: 1 / 3;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  background: var(--gray-light);
  color: var(--text);
  cursor: pointer;
  border-radius: 12px;
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

.level-pills {
  grid-row: 1 / 3;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-self: center;
}

.level-pill {
  padding: 5px 12px;
  border: 2px solid var(--border);
  border-radius: 999px;
  background: var(--white);
  font-size: 12px;
  font-weight: 800;
  color: var(--text-light);
  cursor: pointer;
  min-width: 44px;
}

.level-pill.active {
  border-color: var(--green);
  background: var(--green-bg);
  color: var(--green-hover);
}

.level-pill:disabled {
  opacity: 0.6;
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
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.15));
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
}

.path-lane {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0 24px;
}

.path-lane::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 32px;
  bottom: 32px;
  width: 14px;
  transform: translateX(-50%);
  background: var(--green);
  border-radius: 8px;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.12);
  z-index: 0;
}

.path-step {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr 72px 1fr;
  align-items: center;
  min-height: 108px;
  padding: 10px 0;
}

.path-step.lane-left .path-node {
  grid-column: 2;
  justify-self: center;
}

.path-step.lane-left .node-caption {
  grid-column: 1;
  text-align: right;
  padding-right: 14px;
}

.path-step.lane-center .path-node {
  grid-column: 2;
  justify-self: center;
}

.path-step.lane-center .node-caption {
  grid-column: 3;
  padding-left: 14px;
}

.path-step.lane-right .path-node {
  grid-column: 2;
  justify-self: center;
}

.path-step.lane-right .node-caption {
  grid-column: 3;
  padding-left: 14px;
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
  gap: 2px;
  min-width: 0;
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