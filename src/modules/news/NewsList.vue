<template>
  <div
    class="news-list"
    :class="{ 'tv-content-pane': isTvLayoutMode }"
    @touchstart="onPullStart"
    @touchmove="onPullMove"
    @touchend="onPullEnd"
    @touchcancel="resetPull"
  >
    <PageHeader
      :title="t('news.title')"
      variant="news"
      :back-label="t('common.back')"
    >
      <template #actions>
        <button class="refresh-btn" :disabled="loading" :title="t('news.refresh')" @click="onRefresh">
          <svg :class="{ spinning: loading }" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M17.65 6.35A7.96 7.96 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
          </svg>
        </button>
      </template>
      <template #below>
        <span class="today-label">{{ formattedDate }}</span>
      </template>
    </PageHeader>

    <div
      class="pull-indicator"
      :class="{ visible: pullDistance > 0, ready: pullReady, refreshing: loading }"
      :style="{ height: `${pullDistance}px` }"
      aria-live="polite"
    >
      <svg class="pull-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M12 4v11.17l-3.59-3.58L7 13l5 5 5-5-1.41-1.41L13 15.17V4h-2zm-6 14v2h12v-2H6z"/>
      </svg>
      <span>{{ loading ? t('news.refreshing') : pullReady ? t('news.releaseToRefresh') : t('news.pullToRefresh') }}</span>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading && articles.length === 0" class="skeleton-list">
      <div v-for="i in 3" :key="i" class="skeleton-card" />
    </div>

    <!-- Article cards -->
    <div v-if="!loading || articles.length > 0" class="article-list">
      <div
        v-for="article in articles"
        :key="article.id"
        class="article-card"
        role="button"
        tabindex="0"
        :data-article-id="article.id"
        :data-tv-preferred-focus="isTvLayoutMode && article.id === lastOpenedArticleId ? true : undefined"
        @click="openArticle(article.id)"
        @keydown.enter="openArticle(article.id)"
        @keydown.space.prevent="openArticle(article.id)"
      >
        <div class="card-rank" :class="'rank-' + article.hot_rank">
          {{ article.hot_rank }}
        </div>
        <div class="card-body">
          <h3 class="card-title">{{ article.original_title }}</h3>
          <div class="card-meta">
            <span v-if="article.rewritten_body" class="badge-rewritten">{{ t('news.aiRewritten') }}</span>
            <span v-else class="badge-raw">{{ t('news.raw') }}</span>
            <!-- TV: plain text only — never a focusable/openable source link for remote. -->
            <span
              v-if="article.source && isTvLayoutMode"
              class="card-source"
            >{{ formatSource(article.source) }}</span>
            <a
              v-else-if="article.source"
              class="card-source clickable"
              :href="article.source"
              target="_blank"
              rel="noopener noreferrer"
              :title="article.source"
              @click.stop.prevent="openSourceUrl(article.source)"
            >{{ formatSource(article.source) }}</a>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!loading && articles.length === 0" class="empty-state">
      <div class="empty-icon">📰</div>
      <p>{{ t('news.empty') }}</p>
      <button class="btn-secondary" @click="onRefresh">{{ t('news.clickRefresh') }}</button>
    </div>

    <!-- Loading overlay for refresh -->
    <div v-if="loading && articles.length > 0" class="loading-bar">{{ t('news.refreshing') }}</div>

    <!-- Status toast -->
    <Transition name="popup">
      <div v-if="statusText" class="status-toast">{{ statusText }}</div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from "vue";
import { useRouter } from "vue-router";
import { fetchNews, getArticles } from "@/shared/backend/news.js";
import { getCurrentUser } from "@/shared/backend/user.js";
import PageHeader from "@/shared/components/PageHeader.vue";
import { openSourceUrl } from "./utils.js";
import { useI18n } from "@/shared/i18n";
import { useTargetLangStore, TARGET_LANG_CHANGED } from "@/stores/targetLang.js";
import { eventBus } from "@/shared/eventBus.js";
import { usePullToRefresh } from "./usePullToRefresh.js";
import { isTvLayoutMode } from "@/shared/appMode.js";

const { t, locale } = useI18n();
const router = useRouter();
const targetLangStore = useTargetLangStore();
const articles = ref([]);
const loading = ref(false);
const statusText = ref("");
let statusTimer = null;
let userId = "";

const targetLang = computed(() => targetLangStore.code || "es");
let unsubscribe = null;

const LOCALE_TAGS = { zh: "zh-CN", en: "en-US", es: "es-ES" };

const formattedDate = computed(() => {
  const localeTag = LOCALE_TAGS[locale.value] || locale.value;
  return new Intl.DateTimeFormat(localeTag, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
});

onMounted(async () => {
  try {
    const u = await getCurrentUser();
    userId = u?.id || "";
  } catch (e) { /* dev mode without tauri */ }
  await targetLangStore.load();
  await loadArticles();
  // Auto-fetch if no articles
  if (articles.value.length === 0) {
    await onRefresh();
  }
  // React to language switches from any other page (Profile).
  unsubscribe = eventBus.on(TARGET_LANG_CHANGED, async () => {
    articles.value = [];
    await loadArticles();
    if (articles.value.length === 0) {
      await onRefresh();
    }
  });
});

onBeforeUnmount(() => {
  if (unsubscribe) unsubscribe();
});

async function loadArticles() {
  try {
    // Region is derived from the target language (CN→zh, US/WORLD→en,
    // ES→es) so the user gets the right feed.
    const region = regionForLang(targetLang.value);
    articles.value = await getArticles(region);
  } catch (e) {
    console.error("Failed to load articles:", e);
    articles.value = [];
  }
}

function regionForLang(lang) {
  switch (lang) {
    case "zh": return "CN";
    case "en": return "US";
    case "es": return "ES";
    default: return "CN";
  }
}

function showStatus(msg) {
  statusText.value = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { statusText.value = ""; }, 3000);
}

async function onRefresh() {
  articles.value = [];
  loading.value = true;
  try {
    const result = await fetchNews(regionForLang(targetLang.value), targetLang.value);
    articles.value = result;
    if (result.length > 0) {
      showStatus(t("news.refreshed", { n: result.length }));
    } else {
      showStatus(t("news.noNew"));
    }
  } catch (e) {
    console.error("Failed to fetch news:", e);
    showStatus(t("news.refreshFail"));
    articles.value = [];
  } finally {
    loading.value = false;
  }
}

const lastOpenedArticleId = ref(null);

function openArticle(id) {
  lastOpenedArticleId.value = id;
  router.push(`/news/${id}`);
}

function formatSource(source) {
  if (!source) return "";
  try {
    const url = new URL(source);
    let name = url.hostname.replace("feeds.", "").replace("www.", "");
    const known = { "bbci.co.uk": "BBC", "bbc.com": "BBC", "elpais.com": "El País",
      "rtve.es": "RTVE", "uecdn.es": "El Mundo", "abc.es": "ABC",
      "chinadaily.com.cn": "China Daily", "cgtn.com": "CGTN",
      "npr.org": "NPR", "nytimes.com": "NYT" };
    return known[name] || name;
  } catch {
    return source?.slice(0, 20) || "";
  }
}

const {
  pullDistance,
  pullReady,
  onPullStart,
  onPullMove,
  onPullEnd,
  resetPull,
} = usePullToRefresh({ isRefreshing: loading, refresh: onRefresh });
</script>

<style scoped>
.news-list {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: var(--bg);
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
  outline: none;
}

.article-card:focus-visible {
  z-index: 2;
  outline: 3px solid #1cb0f6 !important;
  outline-offset: -3px;
  box-shadow: var(--shadow-lg), inset 0 0 0 1px rgba(28, 176, 246, 0.22) !important;
  transform: none !important;
  background: var(--green-bg);
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
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.pull-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  overflow: hidden;
  color: var(--text-lighter);
  font-size: 12px;
  font-weight: 600;
  transition: height 0.16s ease;
}

.pull-icon {
  transition: transform 0.16s ease;
}

.pull-indicator.ready {
  color: var(--green);
}

.pull-indicator.ready .pull-icon {
  transform: rotate(180deg);
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
  text-decoration: none;
}

.clickable {
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
}

.clickable:hover {
  color: var(--green);
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

/* Status toast */
.status-toast {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--text);
  color: #fff;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  z-index: 300;
  white-space: nowrap;
  box-shadow: var(--shadow-lg);
}

.refresh-btn:focus-visible {
  outline: 3px solid var(--green);
  outline-offset: 1px;
}

.btn-secondary:focus-visible {
  outline: 3px solid var(--green);
  outline-offset: 1px;
}
</style>
