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
            <div class="word-grid">
              <button
                v-for="(item, idx) in content.words"
                :key="item.word + idx"
                type="button"
                class="word-card"
                :class="{ revealed: revealed.has(idx) }"
                @click="toggleWord(idx)"
              >
                <span class="word-target">{{ item.word }}</span>
                <span class="word-gloss">
                  {{ item.definition_zh || t("path.noGloss") }}
                </span>
              </button>
            </div>
          </section>
        </template>
      </div>

      <footer class="teach-footer">
        <button class="action-btn primary" :disabled="submitting" @click="finishTeaching">
          {{ t("path.continuePath") }}
        </button>
      </footer>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import {
  completeTeachingNode,
  explainGrammarPoint,
  getCurrentUser,
  getGrammarExplanationCached,
  getLearningGoals,
  getTeachingContent,
} from "@/shared/api.js";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { pickLearningGoal } from "@/shared/learningGoal.js";
import { promiseWithTimeout } from "@/shared/promiseTimeout.js";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const targetLangStore = useTargetLangStore();

const loading = ref(true);
const error = ref("");
const submitting = ref(false);
const content = ref(null);
const revealed = ref(new Set());
const userMeta = ref({ nativeLang: "zh", targetLang: "es", cefr: "A1" });
const expandedPoint = ref(null);
const loadingPoint = ref(null);
const explanations = ref({});
const pointErrors = ref({});
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

function toggleWord(idx) {
  const next = new Set(revealed.value);
  if (next.has(idx)) next.delete(idx);
  else next.add(idx);
  revealed.value = next;
}

function exitTeaching() {
  router.replace({ name: "path" });
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const user = await getCurrentUser();
    const targetLang = targetLangStore.code || (await targetLangStore.load());
    const goals = await getLearningGoals(user.id);
    const goal = pickLearningGoal(goals, targetLang);
    const cefr = goal?.cefr_level || "A1";
    userMeta.value = { nativeLang: user.native_language, targetLang, cefr };
    content.value = await getTeachingContent(
      user.native_language,
      targetLang,
      cefr,
      route.params.nodeId,
    );
    revealed.value = new Set();
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
    await completeTeachingNode(
      userMeta.value.nativeLang,
      userMeta.value.targetLang,
      userMeta.value.cefr,
      route.params.nodeId,
    );
    router.replace({ name: "path" });
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
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--text-light);
}

.word-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.word-card {
  min-height: 88px;
  padding: 14px 12px;
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--white);
  box-shadow: 0 4px 0 var(--border);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}

.word-card:active {
  transform: translateY(2px);
  box-shadow: 0 2px 0 var(--border);
}

.word-card.revealed {
  border-color: var(--blue);
  background: var(--blue-bg);
}

.word-target {
  font-size: 18px;
  font-weight: 800;
  color: var(--text);
}

.word-gloss {
  font-size: 13px;
  color: var(--text-light);
  opacity: 0;
  max-height: 0;
  overflow: hidden;
  transition: opacity 0.2s ease;
}

.word-card.revealed .word-gloss {
  opacity: 1;
  max-height: 40px;
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
</style>