<template>
  <div class="reading-list">
    <PageHeader :title="t('reading.title')" variant="news" :back-label="t('common.back')" />

    <div v-if="error" class="error-container">
      <p class="error-text">{{ error }}</p>
      <button class="btn-secondary" @click="init">{{ t('reading.retry') }}</button>
    </div>

    <div v-else-if="loading" class="skeleton-list">
      <div v-for="i in 3" :key="i" class="skeleton-card" />
    </div>

    <div v-else-if="articles.length === 0" class="empty-state">
      <p>{{ t('reading.emptyList') }}</p>
      <button class="btn-secondary" @click="init">{{ t('common.retry') }}</button>
    </div>

    <div v-else class="article-list">
      <div
        v-for="article in articles"
        :key="article.id"
        class="article-card"
        role="button"
        tabindex="0"
        @click="openArticle(article.id)"
        @keydown.enter="openArticle(article.id)"
      >
        <div class="card-header">
          <h3 class="card-title">{{ article.title }}</h3>
          <span class="card-date">
            <span class="date-weekday" :class="weekdayClass(article)">{{ formatWeekday(article) }}</span>
            <span class="date-day">{{ formatDate(article) }}</span>
          </span>
        </div>
        <div class="card-meta">
          <span class="badge-level">{{ article.cefr_level }}</span>
          <span class="badge-slot" :class="article.slot.toLowerCase()">
            {{ article.slot === 'AM' ? t('reading.slotAm') : t('reading.slotPm') }}
          </span>
          <span class="badge-status" :class="article.status">
            {{ statusLabel(article.status) }}
          </span>
          <span v-if="article.test_total_count != null" class="badge-score">
            {{ t('reading.testScore') }}: {{ article.test_correct_count }}/{{ article.test_total_count }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { getReadingArticles, ensureReadingArticle } from "@/shared/api.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import PageHeader from "@/shared/components/PageHeader.vue";

const { t } = useI18n();
const router = useRouter();
const targetLangStore = useTargetLangStore();

const articles = ref([]);
const loading = ref(true);
const error = ref("");

onMounted(async () => {
  await init();
});

function statusLabel(status) {
  switch (status) {
    case "unread": return t("reading.statusUnread");
    case "read": return t("reading.statusRead");
    case "completed": return t("reading.statusCompleted");
    default: return status;
  }
}

function parseLocalDate(localDate) {
  const [year, month, day] = String(localDate || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatWeekday(article) {
  const date = parseLocalDate(article.local_date);
  if (!date) return "";
  const weekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return t(`weekday.${weekdayKeys[date.getDay()]}`);
}

function weekdayClass(article) {
  const date = parseLocalDate(article.local_date);
  if (!date) return "";
  const day = date.getDay();
  const classMap = ["weekday-sun", "weekday-mon", "weekday-tue", "weekday-wed", "weekday-thu", "weekday-fri", "weekday-sat"];
  return classMap[day];
}

function formatDate(article) {
  return article.local_date || "";
}

async function init() {
  loading.value = true;
  error.value = "";
  try {
    const ctx = await loadLearningContext({ targetLangStore, fallbackToFirstGoal: true, loadGoals: true });
    if (ctx.user?.id && ctx.targetLang) {
      // Ensure today's article exists (handles generation if needed)
      try {
        await ensureReadingArticle(ctx.user.id, ctx.targetLang, ctx.cefr, ctx.nativeLang);
      } catch (e) {
        console.error("Failed to ensure reading article:", e);
        // Non-fatal: user can still see old articles and tap retry
        if (articles.value.length === 0) {
          error.value = t("reading.generatingFail");
        }
      }
      articles.value = await getReadingArticles(ctx.user.id, ctx.targetLang);
    }
  } catch (e) {
    console.error("Failed to load reading list:", e);
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

function openArticle(id) {
  router.push(`/learn/reading/${id}`);
}
</script>

<style scoped>
.reading-list {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: var(--bg);
}

.error-container {
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.error-text {
  color: var(--text-lighter);
  text-align: center;
  font-size: 14px;
}

.skeleton-list {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-card {
  height: 90px;
  border-radius: var(--radius-md);
  background: linear-gradient(90deg, var(--surface) 25%, var(--surface-variant) 50%, var(--surface) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.empty-state {
  padding: 48px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-lighter);
}

.article-list {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.article-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "title date"
    "meta date";
  column-gap: 10px;
  row-gap: 8px;
  padding: 14px;
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition), box-shadow var(--transition);
}

.article-card:hover {
  background: var(--green-bg);
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
}

.card-header {
  display: contents;
}

.card-title {
  grid-area: title;
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  min-width: 0;
  color: var(--text);
  overflow-wrap: anywhere;
}

.card-date {
  grid-area: date;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-end;
  white-space: nowrap;
}

.date-weekday {
  font-size: 18px;
  font-weight: 800;
  line-height: 1;
  color: var(--text);
}

.date-weekday.weekday-sun {
  color: #e74c3c;
}

.date-weekday.weekday-mon {
  color: #e67e22;
}

.date-weekday.weekday-tue {
  color: #f1c40f;
}

.date-weekday.weekday-wed {
  color: #2ecc71;
}

.date-weekday.weekday-thu {
  color: #3498db;
}

.date-weekday.weekday-fri {
  color: #9b59b6;
}

.date-weekday.weekday-sat {
  color: #1abc9c;
}

.date-day {
  font-size: 11px;
  font-weight: 500;
  line-height: 1.1;
  color: var(--text-lighter);
}

.card-meta {
  grid-area: meta;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.badge-level, .badge-slot, .badge-status, .badge-score {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  line-height: 1.4;
}

.badge-level {
  background: var(--surface-variant);
  color: var(--text-light);
}

.badge-slot.am {
  background: #fff3cd;
  color: #856404;
}

.badge-slot.pm {
  background: #cce5ff;
  color: #004085;
}

.badge-status.unread {
  background: var(--surface-variant);
  color: var(--text-lighter);
}

.badge-status.read {
  background: var(--green-bg);
  color: var(--green);
}

.badge-status.completed {
  background: #d4edda;
  color: #155724;
}

.badge-score {
  background: #e8dfff;
  color: #5a3ea1;
}

.btn-secondary {
  padding: 10px 20px;
  border: 1px solid var(--border);
  background: var(--white);
  border-radius: var(--radius-md);
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
}
</style>
