<template>
  <div class="news-list">
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

    <div v-if="readingSummary" class="reading-summary-banner">
      <p class="reading-summary-text">
        {{ t("news.readingSummary", { n: readingSummary.unknownCount }) }}
      </p>
      <button type="button" class="reading-summary-action" @click="goToVocabReview">
        {{ t("news.readingSummaryAction") }}
      </button>
    </div>

    <div v-else-if="pendingVocabBanner" class="reading-summary-banner">
      <p class="reading-summary-text">
        {{ t("news.pendingVocabBanner", { n: pendingVocabBanner.entries.length }) }}
      </p>
      <button type="button" class="reading-summary-action" @click="goToPendingVocabReview">
        {{ t("news.pendingVocabAction") }}
      </button>
    </div>

    <p v-if="listProgress" class="list-progress-summary">
      {{ t("news.listProgress", listProgress) }}
    </p>

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
        :class="cardStateFor(article).cardClass"
        role="button"
        tabindex="0"
        @click="openArticle(article.id)"
        @keydown.enter="openArticle(article.id)"
        @keydown.space.prevent="openArticle(article.id)"
      >
        <div class="card-rank" :class="'rank-' + article.hot_rank">
          {{ article.hot_rank }}
        </div>
        <div class="card-body">
          <div class="card-title-row">
            <h3 class="card-title">{{ article.original_title }}</h3>
            <span v-if="cardStateFor(article).readBadge" class="badge-read">
              {{ t(`news.${cardStateFor(article).readBadge}`) }}
            </span>
            <span v-else-if="cardStateFor(article).progressLine" class="badge-in-progress">
              {{ t(`news.${cardStateFor(article).progressLine.key}`, { pct: cardStateFor(article).progressLine.pct }) }}
            </span>
          </div>
          <div class="card-meta">
            <span v-if="article.rewritten_body" class="badge-rewritten">{{ t('news.aiRewritten') }}</span>
            <span v-else class="badge-raw">{{ t('news.raw') }}</span>
            <span
              v-if="cardStateFor(article).unknownLine"
              class="badge-unknown-words"
            >
              {{ t(`news.${cardStateFor(article).unknownLine.key}`, { n: cardStateFor(article).unknownLine.n }) }}
            </span>
            <a
              v-if="article.source"
              class="card-source clickable"
              :href="article.source"
              target="_blank"
              rel="noopener noreferrer"
              :title="article.source"
              @click.stop.prevent="openSourceUrl(article.source)"
            >{{ formatSource(article.source) }}</a>
          </div>
          <button
            v-if="cardStateFor(article).showContinueChip"
            type="button"
            class="card-continue-chip"
            @click.stop="openArticle(article.id)"
          >
            {{ t("news.readingContinue") }}
          </button>
          <button
            v-else-if="cardStateFor(article).showReviewChip"
            type="button"
            class="card-review-chip"
            @click.stop="goToArticleReview(article.id)"
          >
            {{ t("news.cardReviewWords") }}
          </button>
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
import { getArticles, fetchNews, getCurrentUser, getArticlesReadingStatus, lookupWordsMastery } from "@/shared/api.js";
import PageHeader from "@/shared/components/PageHeader.vue";
import { openSourceUrl } from "./utils.js";
import { consumeReadingSessionSummary, consumeReadingProgressToast } from "./readingSession.js";
import {
  peekPendingReadingVocab,
  seedReadingSessionFromPending,
  shouldShowPendingVocabBanner,
} from "./pendingReadingVocab.js";
import {
  aggregateListSummary,
  articleCardState,
  buildDueWordKeySet,
  buildStatusMap,
  collectUnknownWordsFromStatusMap,
} from "./newsReadingStatus.js";
import { useI18n } from "@/shared/i18n";
import { useTargetLangStore, TARGET_LANG_CHANGED } from "@/stores/targetLang.js";
import { eventBus } from "@/shared/eventBus.js";

const { t, locale } = useI18n();
const router = useRouter();
const targetLangStore = useTargetLangStore();
const articles = ref([]);
const loading = ref(false);
const statusText = ref("");
const readingSummary = ref(null);
const pendingVocabBanner = ref(null);
const statusMap = ref(new Map());
const dueWordKeys = ref(new Set());
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

const listProgress = computed(() => {
  if (!articles.value.length || !statusMap.value.size) return null;
  const summary = aggregateListSummary(statusMap.value, articles.value);
  if (!summary.readToday && !summary.inProgress && summary.unread === summary.total) return null;
  return summary;
});

function cardStateFor(article) {
  return articleCardState(article, statusMap.value.get(article.id), {
    dueWordKeys: dueWordKeys.value,
  });
}

onMounted(async () => {
  readingSummary.value = consumeReadingSessionSummary();
  const pendingVocab = peekPendingReadingVocab();
  pendingVocabBanner.value = readingSummary.value
    ? null
    : shouldShowPendingVocabBanner(pendingVocab)
      ? pendingVocab
      : null;
  const progressToast = consumeReadingProgressToast();
  if (progressToast?.scrollPct != null) {
    showStatus(t("news.readingProgressSaved", { pct: progressToast.scrollPct }));
  }
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
    const loadedArticles = await getArticles(region);
    articles.value = loadedArticles;
    await loadReadingStatus(loadedArticles);
  } catch (e) {
    console.error("Failed to load articles:", e);
    articles.value = [];
    statusMap.value = new Map();
    dueWordKeys.value = new Set();
  }
}

async function loadReadingStatus(loadedArticles) {
  if (!userId || !loadedArticles?.length) {
    statusMap.value = new Map();
    dueWordKeys.value = new Set();
    return;
  }
  try {
    const ids = loadedArticles.map((article) => article.id).filter((id) => id != null);
    const rows = await getArticlesReadingStatus(userId, ids);
    const map = buildStatusMap(rows);
    statusMap.value = map;

    const unknownWords = collectUnknownWordsFromStatusMap(map);
    if (!unknownWords.length) {
      dueWordKeys.value = new Set();
      return;
    }
    const masteryEntries = await lookupWordsMastery(userId, unknownWords, targetLang.value);
    dueWordKeys.value = buildDueWordKeySet(masteryEntries);
  } catch (e) {
    console.error("Failed to load reading status:", e);
    statusMap.value = new Map();
    dueWordKeys.value = new Set();
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
    await loadReadingStatus(result);
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

function openArticle(id) {
  router.push(`/news/${id}`);
}

function goToVocabReview() {
  readingSummary.value = null;
  router.push({ name: "vocab-review", query: { from: "reading" } });
}

function goToPendingVocabReview() {
  const pending = pendingVocabBanner.value;
  if (!pending) return;
  seedReadingSessionFromPending(pending);
  pendingVocabBanner.value = null;
  const query = { from: "reading" };
  if (pending.articleId != null) {
    query.articleId = String(pending.articleId);
  }
  router.push({ name: "vocab-review", query });
}

function goToArticleReview(articleId) {
  router.push({
    name: "vocab-review",
    query: { from: "reading", articleId: String(articleId) },
  });
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
</script>

<style scoped>
.news-list {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: var(--bg);
}

.reading-summary-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 16px 8px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  background: var(--purple-bg);
  border: 1px solid rgba(124, 58, 237, 0.2);
}

.reading-summary-text {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--purple);
  line-height: 1.35;
  flex: 1;
}

.reading-summary-action {
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  padding: 6px 12px;
  background: var(--purple);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
}

.list-progress-summary {
  margin: 0 16px 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-lighter);
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
  box-shadow: var(--shadow-lg), 0 0 0 2px var(--green);
}

.article-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-lg);
}

.article-card:active {
  transform: scale(0.98);
}

.article-card.is-unread {
  border-left: 3px solid rgba(124, 58, 237, 0.35);
}

.article-card.is-in-progress {
  border-left: 3px solid rgba(88, 204, 2, 0.45);
}

.badge-in-progress {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--green-bg);
  color: var(--green);
  white-space: nowrap;
}

.card-continue-chip {
  margin-top: 8px;
  align-self: flex-end;
  border: none;
  background: transparent;
  color: var(--green);
  font-size: 12px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  padding: 0;
}

.card-continue-chip:hover {
  text-decoration: underline;
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

.card-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  margin: 0;
  color: var(--text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.article-card.is-read .card-title {
  color: var(--text-light);
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

.badge-read {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-lighter);
  white-space: nowrap;
}

.badge-unknown-words {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--purple-bg);
  color: var(--purple);
}

.card-review-chip {
  margin-top: 8px;
  align-self: flex-end;
  border: none;
  background: transparent;
  color: var(--purple);
  font-size: 12px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  padding: 0;
}

.card-review-chip:hover {
  text-decoration: underline;
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
</style>
