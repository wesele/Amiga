<template>
  <div class="news-list">
    <header class="list-header">
      <div class="header-top">
        <span class="today-label">{{ formattedDate }}</span>
        <button class="refresh-btn" :disabled="loading" @click="onRefresh">
          <svg :class="{ spinning: loading }" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M17.65 6.35A7.96 7.96 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
          </svg>
        </button>
      </div>
      <h1 class="page-title">今日热搜</h1>
    </header>

    <!-- Loading skeleton -->
    <div v-if="loading && articles.length === 0" class="skeleton-list">
      <div v-for="i in 3" :key="i" class="skeleton-card" />
    </div>

    <!-- Article cards -->
    <div v-if="!loading || articles.length > 0" class="article-list">
      <button
        v-for="article in articles"
        :key="article.id"
        class="article-card"
        @click="openArticle(article.id)"
      >
        <div class="card-rank" :class="'rank-' + article.hot_rank">
          {{ article.hot_rank }}
        </div>
        <div class="card-body">
          <h3 class="card-title">{{ article.original_title }}</h3>
          <div class="card-meta">
            <span v-if="article.rewritten_body" class="badge-rewritten">AI 已改写</span>
            <span v-else class="badge-raw">原文</span>
            <span class="card-source">{{ formatSource(article.source) }}</span>
          </div>
        </div>
      </button>
    </div>

    <!-- Empty state -->
    <div v-if="!loading && articles.length === 0" class="empty-state">
      <div class="empty-icon">📰</div>
      <p>暂无新闻</p>
      <button class="btn-secondary" @click="onRefresh">点击刷新</button>
    </div>

    <!-- Loading overlay for refresh -->
    <div v-if="loading && articles.length > 0" class="loading-bar">刷新中…</div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { getArticles, fetchNews } from "@/shared/api.js";

const router = useRouter();
const articles = ref([]);
const loading = ref(false);

const formattedDate = computed(() => {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
});

onMounted(async () => {
  await loadArticles();
  // Auto-fetch if no articles
  if (articles.value.length === 0) {
    await onRefresh();
  }
});

async function loadArticles() {
  try {
    articles.value = await getArticles("CN");
  } catch (e) {
    console.error("Failed to load articles:", e);
    articles.value = [];
  }
}

async function onRefresh() {
  loading.value = true;
  try {
    await fetchNews("CN", "es");
    await loadArticles();
  } catch (e) {
    console.error("Failed to fetch news:", e);
  } finally {
    loading.value = false;
  }
}

function openArticle(id) {
  router.push(`/news/${id}`);
}

function formatSource(source) {
  if (!source || source === "sample") return "示例";
  try {
    const url = new URL(source);
    return url.hostname.replace("feeds.", "").replace("www.", "");
  } catch {
    return source?.slice(0, 20) || "";
  }
}
</script>

<style scoped>
.news-list {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: var(--bg);
}

.list-header {
  padding: 20px 20px 12px;
  background: var(--surface);
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.today-label {
  font-size: 12px;
  color: var(--text-lighter);
  font-weight: 500;
}

.refresh-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: var(--surface-variant);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-light);
  transition: all var(--transition);
}

.refresh-btn:hover {
  background: var(--green-bg);
  color: var(--green);
}

.refresh-btn:disabled {
  opacity: 0.5;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.page-title {
  font-size: 24px;
  font-weight: 800;
}

/* Skeleton */
.skeleton-list {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-card {
  height: 100px;
  border-radius: var(--radius-md);
  background: linear-gradient(
    90deg,
    var(--surface-variant) 25%,
    var(--bg) 50%,
    var(--surface-variant) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* Article cards */
.article-list {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.article-card {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  background: var(--surface);
  border: none;
  border-radius: var(--radius-md);
  padding: 16px;
  text-align: left;
  cursor: pointer;
  transition: all var(--transition);
  box-shadow: var(--shadow);
  width: 100%;
  font-family: inherit;
}

.article-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-lg);
}

.article-card:active {
  transform: scale(0.98);
}

.card-rank {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 800;
  flex-shrink: 0;
}

.rank-1 {
  background: var(--orange-bg);
  color: var(--orange);
}

.rank-2 {
  background: var(--blue-bg);
  color: var(--blue);
}

.rank-3 {
  background: var(--purple-bg);
  color: var(--purple);
}

.card-body {
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  margin-bottom: 8px;
  color: var(--text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.badge-rewritten {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--green-bg);
  color: var(--green);
}

.badge-raw {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--surface-variant);
  color: var(--text-lighter);
}

.card-source {
  font-size: 11px;
  color: var(--text-lighter);
}

/* Empty state */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-lighter);
  padding: 60px 0;
}

.empty-icon {
  font-size: 48px;
}

.btn-secondary {
  padding: 10px 24px;
  border-radius: var(--radius-md);
  background: var(--surface);
  border: 1.5px solid var(--border);
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all var(--transition);
}

.btn-secondary:hover {
  border-color: var(--green);
  color: var(--green);
}

.loading-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--green);
  animation: loadingBar 1.5s ease-in-out infinite;
  z-index: 200;
  text-align: center;
  color: #fff;
  font-size: 11px;
  line-height: 20px;
}

@keyframes loadingBar {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
