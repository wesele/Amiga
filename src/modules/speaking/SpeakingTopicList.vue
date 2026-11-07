<template>
  <div class="speaking-list">
    <PageHeader :title="t('speaking.title')" variant="news" :back-label="t('common.back')" />

    <div v-if="error" class="error-box">
      <p>{{ error }}</p>
      <button class="btn-secondary" @click="load">{{ t('common.retry') }}</button>
    </div>

    <div v-else-if="loading" class="loading-box">{{ t('speaking.loading') }}</div>

    <div v-else class="topic-list">
      <!-- Gemini 3.8 Live Banner -->
      <section class="live-banner">
        <div class="live-badge-row">
          <span class="live-pulse-dot" />
          <span class="live-badge-text">{{ t('speaking.liveBadge') }}</span>
        </div>
        <p class="live-subtitle">{{ t('speaking.topicSubtitle') }}</p>
      </section>

      <!-- Topic Cards -->
      <button
        v-for="topic in topics"
        :key="topic.id"
        class="topic-card"
        :class="{ featured: topic.id === 'free-talk' }"
        @click="openTopic(topic.id)"
      >
        <div class="topic-header">
          <div class="topic-title-group">
            <span class="topic-title">{{ topicLabel(topic.id) }}</span>
            <span v-if="topic.id === 'free-talk'" class="featured-tag">★</span>
          </div>
          <div class="topic-meta">
            <span class="voice-pill">🎙️ {{ topic.voice || 'Aoede' }}</span>
            <span class="topic-badge">{{ topic.cefr }}</span>
          </div>
        </div>

        <p class="topic-scene">{{ topicScene(topic.id) }}</p>

        <div v-if="topicGoals(topic.id).length" class="topic-goals">
          <span
            v-for="(goal, idx) in topicGoals(topic.id)"
            :key="idx"
            class="goal-pill"
          >
            {{ goal }}
          </span>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import PageHeader from "@/shared/components/PageHeader.vue";
import { useI18n } from "@/shared/i18n";
import { speakingListTopics } from "@/shared/api.js";

const { t } = useI18n();
const router = useRouter();
const topics = ref([]);
const loading = ref(true);
const error = ref("");

onMounted(load);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    topics.value = await speakingListTopics();
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

function topicLabel(id) {
  const key = `speaking.topics.${id}`;
  const label = t(key);
  return label === key ? id : label;
}

function topicScene(id) {
  const key = `speaking.scenes.${id}`;
  const label = t(key);
  return label === key ? "" : label;
}

function topicGoal(id, gKey) {
  const key = `speaking.goals.${id}.${gKey}`;
  const label = t(key);
  return label === key ? "" : label;
}

function topicGoals(id) {
  return ["g1", "g2", "g3"].map((g) => topicGoal(id, g)).filter(Boolean);
}

function openTopic(id) {
  router.push({ name: "speaking-dialogue", params: { topicId: id } });
}
</script>

<style scoped>
.speaking-list {
  min-height: 100%;
  background: var(--bg);
}

.topic-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px 24px;
}

/* Gemini 3.8 Live Banner */
.live-banner {
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(16, 185, 129, 0.1));
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.live-badge-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.live-pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  animation: pulse-ring 1.8s infinite;
}

@keyframes pulse-ring {
  0% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
  }
}

.live-badge-text {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0.2px;
}

.live-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-light);
  line-height: 1.4;
}

/* Topic Cards */
.topic-card {
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--white);
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

.topic-card:active {
  background: var(--green-bg);
  transform: scale(0.99);
}

.topic-card.featured {
  border-color: rgba(16, 185, 129, 0.45);
  background: linear-gradient(180deg, #f6fbf8 0%, var(--white) 100%);
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.08);
}

.topic-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.topic-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.topic-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
}

.featured-tag {
  color: #10b981;
  font-size: 12px;
  font-weight: 700;
}

.topic-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.voice-pill {
  padding: 3px 8px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
  font-size: 11px;
  font-weight: 600;
}

.topic-badge {
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--green-bg);
  color: var(--green);
  font-size: 11px;
  font-weight: 700;
}

.topic-scene {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-light);
  line-height: 1.4;
}

.topic-goals {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.goal-pill {
  font-size: 11px;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 3px 8px;
  line-height: 1.3;
}

.error-box,
.loading-box {
  padding: 24px 16px;
  text-align: center;
  color: var(--text-light);
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
