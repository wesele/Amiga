<template>
  <div class="speaking-summary">
    <PageHeader :title="t('speaking.summaryTitle')" variant="news" :back-label="t('common.back')" />

    <div v-if="loading" class="state-box">{{ t('speaking.summaryLoading') }}</div>
    <div v-else-if="error" class="state-box error">
      <p>{{ error }}</p>
      <button class="btn-secondary" @click="load">{{ t('common.retry') }}</button>
    </div>
    <div v-else class="summary-body">
      <div class="summary-card">{{ summary }}</div>
      <button class="btn-primary" @click="goHome">{{ t('speaking.backToTopics') }}</button>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "@/shared/components/PageHeader.vue";
import { useI18n } from "@/shared/i18n";
import { speakingFinish } from "@/shared/api.js";

defineProps({
  topicId: { type: String, required: true },
});

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const loading = ref(true);
const error = ref("");
const summary = ref("");

onMounted(load);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const sessionId = route.query.sessionId;
    if (!sessionId) throw new Error(t("speaking.missingSession"));
    summary.value = await speakingFinish(String(sessionId));
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

function goHome() {
  router.push({ name: "speaking" });
}
</script>

<style scoped>
.speaking-summary {
  min-height: 100%;
  background: var(--bg);
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
}

.summary-card {
  padding: 16px;
  border-radius: var(--radius-md);
  background: var(--white);
  border: 1px solid var(--border);
  white-space: pre-wrap;
  line-height: 1.6;
  font-size: 15px;
  color: var(--text);
  margin-bottom: 20px;
}

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
