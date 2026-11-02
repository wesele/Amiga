<template>
  <div class="speaking-list">
    <PageHeader :title="t('speaking.title')" variant="news" :back-label="t('common.back')" />

    <div v-if="error" class="error-box">
      <p>{{ error }}</p>
      <button class="btn-secondary" @click="load">{{ t('common.retry') }}</button>
    </div>

    <div v-else-if="loading" class="loading-box">{{ t('speaking.loading') }}</div>

    <div v-else class="topic-list">
      <button
        v-for="topic in topics"
        :key="topic.id"
        class="topic-card"
        @click="openTopic(topic.id)"
      >
        <div class="topic-main">
          <span class="topic-title">{{ topicLabel(topic.id) }}</span>
          <span class="topic-badge">{{ topic.cefr }}</span>
        </div>
        <p class="topic-scene">{{ topicScene(topic.id) }}</p>
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
  gap: 10px;
  padding: 12px 16px 24px;
}

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
}

.topic-card:active {
  background: var(--green-bg);
}

.topic-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.topic-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
}

.topic-badge {
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--green-bg);
  color: var(--green);
  font-size: 12px;
  font-weight: 700;
}

.topic-scene {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-light);
  line-height: 1.4;
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
