<template>
  <div class="reading-reader">
    <header class="reader-header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <div class="header-info">
        <div class="header-title">{{ article?.title }}</div>
        <div class="header-meta" v-if="article">
          {{ formatDate(article) }} · {{ article.cefr_level }}
        </div>
      </div>
    </header>

    <div v-if="!article" class="loading-center">
      <div class="spinner" />
      <p>{{ t('common.loading') }}</p>
    </div>

    <div v-else class="article-body">
      <div class="article-text">
        {{ article.body }}
      </div>
    </div>

    <div v-if="article" class="bottom-bar">
      <button
        class="btn-test"
        :disabled="testLoading"
        @click="goTest"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
        {{ t('reading.test') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useI18n } from "@/shared/i18n";
import { getReadingArticle, markReadingArticleRead } from "@/shared/api.js";

const { t } = useI18n();
const router = useRouter();
const route = useRoute();

const props = defineProps({ id: [String, Number] });

const article = ref(null);
const testLoading = ref(false);

onMounted(async () => {
  try {
    const art = await getReadingArticle(Number(props.id));
    article.value = art;
    // Mark as read immediately
    await markReadingArticleRead(Number(props.id));
  } catch (e) {
    console.error("Failed to load article:", e);
  }
});

function formatDate(article) {
  const slot = article.slot === "AM" ? t("reading.slotAm") : t("reading.slotPm");
  return `${article.local_date} ${slot}`;
}

function goBack() {
  router.push("/learn/reading");
}

function goTest() {
  if (testLoading.value) return;
  testLoading.value = true;
  router.push(`/learn/reading/${props.id}/test`);
}
</script>

<style scoped>
.reading-reader {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: var(--bg);
}

.reader-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  background: var(--white);
  border-bottom: 1px solid var(--border);
}

.back-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-light);
}

.back-btn:hover {
  background: var(--surface-variant);
}

.header-info {
  flex: 1;
  min-width: 0;
}

.header-title {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--text);
}

.header-meta {
  font-size: 12px;
  color: var(--text-lighter);
  margin-top: 2px;
}

.loading-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  gap: 12px;
  color: var(--text-lighter);
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border);
  border-top-color: var(--green);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.article-body {
  flex: 1;
  padding: 20px 16px;
}

.article-text {
  font-size: 15px;
  line-height: 1.7;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}

.bottom-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: center;
  padding: 12px 16px;
  background: var(--white);
  border-top: 1px solid var(--border);
}

.btn-test {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 28px;
  border: none;
  background: var(--green);
  color: var(--white);
  border-radius: var(--radius-md);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity var(--transition);
}

.btn-test:disabled {
  opacity: 0.5;
  cursor: wait;
}

.btn-test:hover:not(:disabled) {
  opacity: 0.9;
}
</style>
