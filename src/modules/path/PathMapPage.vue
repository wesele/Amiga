<template>
  <div class="path-map">
    <header class="page-header">
      <button class="back-btn" :aria-label="t('common.back')" @click="goBack">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <div class="header-text">
        <h1 class="page-title">{{ t("path.title") }}</h1>
        <p v-if="curriculum" class="page-sub">
          {{ t("path.progress", { done: curriculum.completed_sections, total: curriculum.total_sections }) }}
          · ⭐ {{ curriculum.total_stars }}
        </p>
      </div>
    </header>

    <div v-if="loading" class="loading-state">{{ t("path.loading") }}</div>

    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
      <button class="retry-btn" @click="load">{{ t("common.retry") }}</button>
    </div>

    <div v-else-if="curriculum" class="path-scroll">
      <div v-for="unit in curriculum.units" :key="unit.id" class="unit-block">
        <div class="unit-banner">
          <span class="unit-id">{{ unit.id }}</span>
          <div>
            <h2 class="unit-title">{{ unit.title_native }}</h2>
            <p class="unit-sub">{{ unit.title_target }}</p>
          </div>
        </div>

        <div class="path-lane">
          <div
            v-for="(section, idx) in unit.sections"
            :key="section.id"
            class="path-node-wrap"
            :class="[sideClass(idx), { current: section.current }]"
          >
            <button
              type="button"
              class="path-node"
              :class="nodeClass(section)"
              :disabled="section.locked || section.question_count === 0"
              @click="startLesson(section)"
            >
              <span v-if="section.locked" class="node-icon">🔒</span>
              <span v-else-if="section.stars > 0" class="node-icon">⭐</span>
              <span v-else class="node-icon">●</span>
            </button>
            <div class="node-label">
              <span class="node-title">{{ section.title_native }}</span>
              <span v-if="section.stars > 0" class="node-stars">
                {{ "⭐".repeat(section.stars) }}
              </span>
              <span v-else-if="section.question_count === 0" class="node-empty">
                {{ t("path.comingSoon") }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import { getPathCurriculum, getCurrentUser, getLearningGoals } from "@/shared/api.js";
import { useTargetLangStore } from "@/stores/targetLang.js";

const router = useRouter();
const { t } = useI18n();
const targetLangStore = useTargetLangStore();

const loading = ref(true);
const error = ref("");
const curriculum = ref(null);

function sideClass(idx) {
  return idx % 2 === 0 ? "left" : "right";
}

function nodeClass(section) {
  return {
    locked: section.locked,
    completed: section.stars > 0,
    current: section.current,
    empty: section.question_count === 0,
  };
}

function goBack() {
  router.replace({ name: "learn" });
}

function startLesson(section) {
  if (section.locked || section.question_count === 0) return;
  router.push({ name: "path-lesson", params: { sectionId: section.id } });
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const user = await getCurrentUser();
    const targetLang = targetLangStore.code || (await targetLangStore.load());
    const goals = await getLearningGoals(user.id);
    const goal = goals.find((g) => g.target_language === targetLang);
    const cefr = goal?.cefr_level || "A1";
    curriculum.value = await getPathCurriculum(user.native_language, targetLang, cefr);
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.path-map {
  min-height: 100%;
  background: var(--bg);
  display: flex;
  flex-direction: column;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 16px 12px;
  background: var(--white);
  border-bottom: 1px solid var(--border);
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  border-radius: 50%;
}

.header-text {
  flex: 1;
  min-width: 0;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.page-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-light);
}

.loading-state,
.error-state {
  padding: 40px 24px;
  text-align: center;
  color: var(--text-light);
}

.retry-btn {
  margin-top: 12px;
  padding: 10px 20px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--green);
  color: var(--white);
  font-weight: 600;
  cursor: pointer;
}

.path-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px 12px 32px;
}

.unit-block {
  margin-bottom: 28px;
}

.unit-banner {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  margin-bottom: 20px;
  background: var(--white);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  box-shadow: var(--elevation-1);
}

.unit-id {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--green-bg);
  color: var(--green-hover);
  font-weight: 800;
  font-size: 14px;
}

.unit-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.unit-sub {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--text-light);
}

.path-lane {
  display: flex;
  flex-direction: column;
  gap: 18px;
  position: relative;
}

.path-lane::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 24px;
  bottom: 24px;
  width: 4px;
  transform: translateX(-50%);
  background: var(--border);
  border-radius: 2px;
  z-index: 0;
}

.path-node-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
  z-index: 1;
}

.path-node-wrap.left {
  flex-direction: row;
  padding-right: 42%;
}

.path-node-wrap.right {
  flex-direction: row-reverse;
  padding-left: 42%;
}

.path-node {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 3px solid var(--border);
  background: var(--white);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  box-shadow: var(--elevation-2);
  transition: transform var(--transition), border-color var(--transition);
}

.path-node.current {
  border-color: var(--green);
  transform: scale(1.08);
  box-shadow: 0 0 0 4px var(--green-bg);
}

.path-node.completed {
  border-color: var(--orange);
  background: var(--orange-bg);
}

.path-node.locked,
.path-node.empty {
  opacity: 0.55;
  cursor: not-allowed;
}

.path-node:not(:disabled):active {
  transform: scale(0.96);
}

.node-icon {
  font-size: 20px;
  line-height: 1;
}

.node-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.path-node-wrap.right .node-label {
  text-align: right;
}

.node-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
}

.node-stars,
.node-empty {
  font-size: 12px;
  color: var(--text-light);
}
</style>