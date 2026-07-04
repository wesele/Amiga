<template>
  <div class="grammar-point-page">
    <header class="grammar-header">
      <button class="close-btn" :aria-label="t('common.back')" @click="exitPoint">&times;</button>
      <div class="header-center">
        <span class="kind-badge">{{ t("path.grammarPoints") }}</span>
        <p class="unit-label">{{ content?.unit_title_native }}</p>
      </div>
      <div class="header-spacer" />
    </header>

    <div v-if="loading" class="center-state">{{ t("path.loading") }}</div>
    <div v-else-if="error" class="center-state">
      <p>{{ error }}</p>
      <button class="action-btn secondary" @click="load">{{ t("common.retry") }}</button>
    </div>

    <template v-else-if="content && pointText">
      <main class="point-body">
        <section class="point-card">
          <span class="point-num">{{ pointIdx + 1 }}</span>
          <h1>{{ pointText }}</h1>
        </section>

        <section class="explain-card">
          <p v-if="loadingPoint" class="detail-loading">{{ t("path.explainLoading") }}</p>
          <template v-else-if="pointError">
            <p class="detail-error">{{ pointError }}</p>
            <button type="button" class="retry-link" @click="loadExplanation">
              {{ t("path.explainRetry") }}
            </button>
          </template>
          <div v-else class="detail-body">{{ explanation }}</div>
        </section>
      </main>

      <footer class="point-footer">
        <button
          class="action-btn secondary prev-btn"
          :disabled="isFirstPoint"
          @click="goPrevious"
        >
          {{ t("path.previousGrammar") }}
        </button>
        <button class="action-btn primary next-btn" @click="goNext">
          {{ nextLabel }}
        </button>
      </footer>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import {
  explainGrammarPoint,
  getGrammarExplanationCached,
  getTeachingContent,
} from "@/shared/api.js";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import { promiseWithTimeout } from "@/shared/promiseTimeout.js";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const targetLangStore = useTargetLangStore();

const loading = ref(true);
const error = ref("");
const content = ref(null);
const explanation = ref("");
const pointError = ref("");
const loadingPoint = ref(false);
const userMeta = ref({ nativeLang: "zh", targetLang: "es", cefr: "A1" });
let explainSeq = 0;

const pointIdx = computed(() => {
  const idx = Number(route.params.pointIdx);
  return Number.isFinite(idx) && idx >= 0 ? Math.floor(idx) : 0;
});

const pointText = computed(() => content.value?.grammar_points?.[pointIdx.value] || "");
const pointCount = computed(() => content.value?.grammar_points?.length || 0);
const isFirstPoint = computed(() => pointIdx.value <= 0);
const isLastPoint = computed(() => pointIdx.value >= pointCount.value - 1);
const nextLabel = computed(() => (isLastPoint.value ? t("path.continuePath") : t("path.nextGrammar")));

function formatInvokeError(err) {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err.message === "string" && err.message) return err.message;
  return String(err);
}

function exitPoint() {
  router.replace({ name: "path-teaching", params: { nodeId: route.params.nodeId } });
}

function goToPoint(idx) {
  router.replace({
    name: "path-grammar-point",
    params: { nodeId: route.params.nodeId, pointIdx: idx },
  });
}

function goPrevious() {
  if (isFirstPoint.value) return;
  goToPoint(pointIdx.value - 1);
}

function goNext() {
  if (isLastPoint.value) {
    exitPoint();
    return;
  }
  goToPoint(pointIdx.value + 1);
}

async function loadExplanation() {
  const c = content.value;
  const point = pointText.value;
  if (!c || !point) return;

  const seq = ++explainSeq;
  loadingPoint.value = true;
  pointError.value = "";
  explanation.value = "";
  try {
    const cached = await getGrammarExplanationCached(
      userMeta.value.cefr,
      c.unit_id,
      point,
    );
    if (seq !== explainSeq) return;
    if (cached) {
      explanation.value = cached;
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
    explanation.value = text;
  } catch (e) {
    if (seq !== explainSeq) return;
    pointError.value = formatInvokeError(e);
  } finally {
    if (seq === explainSeq) loadingPoint.value = false;
  }
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const { user, targetLang, cefr } = await loadLearningContext({ targetLangStore });
    userMeta.value = { nativeLang: user.native_language, targetLang, cefr };
    content.value = await getTeachingContent(
      user.native_language,
      targetLang,
      cefr,
      route.params.nodeId,
    );
    if (!pointText.value) throw new Error(t("path.grammarPoints"));
    await loadExplanation();
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

watch(pointIdx, async () => {
  if (!loading.value && content.value) {
    await loadExplanation();
  }
});

onMounted(load);
</script>

<style scoped>
.grammar-point-page {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #f3e8ff 0%, var(--bg) 180px);
}

.grammar-header {
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
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;
}

.header-center {
  text-align: center;
}

.kind-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 999px;
  background: #f3e8ff;
  color: #7c3aed;
  font-size: 12px;
  font-weight: 700;
}

.unit-label {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-light);
  font-weight: 600;
}

.point-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 16px 24px;
}

.point-card,
.explain-card {
  padding: 18px;
  border-radius: var(--radius-md);
  background: var(--white);
  border: 2px solid var(--border);
  box-shadow: 0 4px 0 var(--border);
}

.point-card {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.point-num {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #ce82ff;
  color: var(--white);
  font-weight: 800;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.point-card h1 {
  margin: 0;
  font-size: 18px;
  line-height: 1.45;
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
  font-size: 15px;
  line-height: 1.7;
  color: var(--text);
  white-space: pre-wrap;
}

.point-footer {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
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

.action-btn.secondary {
  background: var(--white);
  color: var(--text);
  border: 2px solid var(--border);
  box-shadow: 0 4px 0 var(--border);
}

.action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}
</style>
