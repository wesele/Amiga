<template>
  <div class="speaking-summary">
    <PageHeader :title="t('speaking.summaryTitle')" variant="news" :back-label="t('common.back')" />

    <div v-if="loading" class="state-box">{{ t('speaking.summaryLoading') }}</div>
    <div v-else-if="error" class="state-box error">
      <p>{{ error }}</p>
      <button class="btn-secondary" @click="load">{{ t('common.retry') }}</button>
    </div>
    <div v-else class="summary-body">
      <!-- 1. Performance Overview Card -->
      <section class="metrics-grid">
        <div class="metric-card">
          <span class="metric-value">{{ snapshot?.turnCount ?? 0 }}</span>
          <span class="metric-label">{{ t('speaking.summaryTurns') }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-value">
            {{ snapshot?.completedGoalsCount ?? 0 }}/{{ snapshot?.totalGoalsCount ?? 3 }}
          </span>
          <span class="metric-label">{{ t('speaking.summaryGoals') }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-value">
            {{ snapshot?.averageScore ? snapshot.averageScore : '--' }}
          </span>
          <span class="metric-label">{{ t('speaking.summaryAvgScore') }}</span>
        </div>
      </section>

      <!-- 2. Idiomatic Expression Review Cards -->
      <section v-if="snapshot?.coachingItems?.length" class="coaching-section">
        <h3 class="section-title">{{ t('speaking.summaryCoachingTitle') }}</h3>
        <div class="coaching-review-list">
          <div
            v-for="(item, idx) in snapshot.coachingItems"
            :key="idx"
            class="coaching-card"
          >
            <div v-if="item.youSaid" class="card-said">
              <span class="label-said">{{ t('speaking.youSaid') }}:</span>
              <span class="text-said">“{{ item.youSaid }}”</span>
            </div>

            <div v-if="item.betterExpression" class="card-better">
              <span class="text-better">
                💡 {{ t('speaking.betterWay') }}: {{ item.betterExpression }}
              </span>
              <button
                class="speaker-btn"
                :title="t('speaking.replay')"
                @click="playPhrase(item.betterExpression)"
              >
                🔊
              </button>
            </div>

            <p v-if="item.tipNative" class="card-tip">{{ item.tipNative }}</p>
          </div>
        </div>
      </section>

      <!-- 3. AI Tutor Summary Card -->
      <section v-if="summary" class="summary-section">
        <h3 class="section-title">{{ t('speaking.summaryTutorTitle') }}</h3>
        <div class="summary-card">{{ summary }}</div>
      </section>

      <!-- 4. Primary Button -->
      <button class="btn-primary" @click="goHome">{{ t('speaking.backToTopics') }}</button>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "@/shared/components/PageHeader.vue";
import { useI18n } from "@/shared/i18n";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { speakingFinish } from "@/shared/api.js";
import { speakText, stopSpeech } from "@/shared/speechTts.js";
import { getLiveSessionSnapshot } from "./liveSessionCache.js";

defineProps({
  topicId: { type: String, required: false },
});

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const targetLangStore = useTargetLangStore();

const loading = ref(true);
const error = ref("");
const summary = ref("");
const snapshot = ref(null);

const targetLang = computed(() => targetLangStore.code || "es");

onMounted(load);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const sessionId = route.query.sessionId;
    if (!sessionId) throw new Error(t("speaking.missingSession"));

    snapshot.value = getLiveSessionSnapshot(sessionId);
    summary.value = await speakingFinish(String(sessionId));
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

function playPhrase(phrase) {
  if (!phrase) return;
  speakText(phrase, targetLang.value);
}

function goHome() {
  stopSpeech();
  router.push({ name: "speaking" });
}
</script>

<style scoped>
.speaking-summary {
  min-height: 100%;
  background: var(--bg);
  padding-bottom: 32px;
}

.state-box {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-light);
}

.state-box.error {
  color: var(--red);
}

.summary-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 1. Metrics Grid */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.metric-card {
  padding: 12px 8px;
  border-radius: var(--radius-md);
  background: var(--white);
  border: 1px solid var(--border);
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.metric-value {
  display: block;
  font-size: 18px;
  font-weight: 700;
  color: #10b981;
}

.metric-label {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-light);
  line-height: 1.25;
}

/* Section Title */
.section-title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0.2px;
}

/* 2. Coaching Review List */
.coaching-section {
  display: flex;
  flex-direction: column;
}

.coaching-review-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.coaching-card {
  padding: 12px;
  border-radius: var(--radius-md);
  background: var(--white);
  border: 1px solid #cbd5e1;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.card-said {
  font-size: 13px;
  color: var(--text-light);
  margin-bottom: 6px;
}

.label-said {
  font-weight: 600;
  margin-right: 4px;
}

.text-said {
  font-style: italic;
}

.card-better {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #0f766e;
}

.text-better {
  flex: 1;
}

.speaker-btn {
  border: none;
  background: #f1f5f9;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  cursor: pointer;
  flex-shrink: 0;
}

.card-tip {
  margin: 6px 0 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

/* 3. AI Tutor Summary */
.summary-section {
  display: flex;
  flex-direction: column;
}

.summary-card {
  padding: 14px 16px;
  border-radius: var(--radius-md);
  background: var(--white);
  border: 1px solid var(--border);
  white-space: pre-wrap;
  line-height: 1.6;
  font-size: 14px;
  color: var(--text);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

/* 4. Primary Button */
.btn-primary {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--green);
  color: var(--white);
  font-size: 16px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.25);
  margin-top: 8px;
}

.btn-secondary {
  margin-top: 12px;
  padding: 10px 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--white);
  font-family: inherit;
  cursor: pointer;
}
</style>
