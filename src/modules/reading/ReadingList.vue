<template>
  <div class="reading-list" :class="{ 'tv-content-pane': isTvLayoutMode }">
    <PageHeader :title="t('reading.title')" variant="news" :back-label="t('common.back')" />

    <div v-if="error" class="error-container">
      <p class="error-text">{{ error }}</p>
      <button class="btn-secondary" @click="init">{{ t('reading.retry') }}</button>
    </div>

    <div v-else-if="loading" class="skeleton-list">
      <div class="skeleton-card" />
      <div class="skeleton-card small" />
    </div>

    <div v-else class="content-container">
      <!-- AI Daily Article Section -->
      <section class="section-block">
        <div class="section-header">
          <h2 class="section-title">{{ t('reading.currentAiArticle') }}</h2>
        </div>

        <div v-if="currentArticle" class="ai-card-wrapper">
          <div
            class="article-card ai-card"
            :class="{ 'is-generating': isFinishing }"
            :role="isFinishing ? undefined : 'button'"
            :tabindex="isFinishing ? undefined : 0"
            @click="!isFinishing && openArticle(currentArticle.id)"
            @keydown.enter="!isFinishing && openArticle(currentArticle.id)"
          >
            <div class="card-header">
              <h3 class="card-title">{{ currentArticle.title }}</h3>
              <span class="card-date">
                <span class="date-weekday" :class="weekdayClass(currentArticle)">{{ formatWeekday(currentArticle) }}</span>
                <span class="date-day">{{ formatDate(currentArticle) }}</span>
              </span>
            </div>
            <div class="card-meta">
              <span class="badge-level">{{ currentArticle.cefr_level }}</span>
              <span class="badge-slot" :class="currentArticle.slot?.toLowerCase()">
                {{ currentArticle.slot === 'AM' ? t('reading.slotAm') : t('reading.slotPm') }}
              </span>
              <span class="badge-status" :class="currentArticle.status">
                {{ statusLabel(currentArticle.status) }}
              </span>
              <span
                v-if="currentArticle.test_total_count != null"
                class="badge-score score-stars"
                :title="t('reading.testScore') + ': ' + currentArticle.test_correct_count + '/' + currentArticle.test_total_count"
              >
                <span
                  v-for="(s, i) in scoreStars(currentArticle)"
                  :key="i"
                  class="star"
                  :class="'star-' + s"
                >
                  <span class="star-base">★</span><span class="star-fill">★</span>
                </span>
              </span>
            </div>

            <div v-if="isFinishing" class="card-overlay">
              <span class="generation-spinner" aria-hidden="true" />
              <span>{{ t('reading.generatingArticle') }}</span>
            </div>
          </div>

          <div class="action-aside">
            <button
              class="btn-finish"
              :disabled="isFinishing"
              :title="t('reading.finishReading')"
              @click.stop="handleFinishReading"
            >
              <span v-if="!isFinishing">{{ t('reading.finishReading') }}</span>
              <span v-else class="btn-spinner" />
            </button>
          </div>
        </div>

        <div v-else class="empty-ai-card">
          <p class="empty-hint">{{ t('reading.emptyList') }}</p>
          <button class="btn-primary" :disabled="isGeneratingInitial" @click="handleGenerateInitial">
            <span v-if="!isGeneratingInitial">{{ t('reading.generateInitial') }}</span>
            <span v-else>{{ t('reading.generatingArticle') }}</span>
          </button>
        </div>
      </section>

      <!-- Imported YouTube Articles Section -->
      <section class="section-block">
        <div class="section-header">
          <h2 class="section-title">{{ t('reading.importedSectionTitle') }}</h2>
          <button
            v-if="!isTvLayoutMode"
            class="btn-import-header"
            @click="showImportModal = true"
          >
            + {{ t('reading.importYoutubeBtn') }}
          </button>
        </div>

        <div v-if="(importedArticles?.length || 0) === 0" class="empty-imported">
          <p>{{ t('reading.emptyImported') }}</p>
        </div>

        <div v-else class="imported-list">
          <div
            v-for="item in importedArticles"
            :key="item.id"
            class="imported-card"
            role="button"
            tabindex="0"
            @click="openImportedArticle(item.id)"
            @keydown.enter="openImportedArticle(item.id)"
          >
            <div class="imported-icon">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="#ff0000">
                <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
              </svg>
            </div>
            <div class="imported-info">
              <h4 class="imported-title">{{ item.title }}</h4>
              <div class="imported-meta">
                <span v-if="item.channel" class="meta-channel">{{ item.channel }}</span>
                <span v-if="item.duration_sec" class="meta-duration">⏱ {{ formatDuration(item.duration_sec) }}</span>
                <span v-if="item.created_at" class="meta-time">{{ formatTime(item.created_at) }}</span>
              </div>
            </div>
            <button
              class="btn-delete"
              :title="t('reading.deleteBtn')"
              @click.stop="promptDeleteImported(item)"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
            </button>
          </div>
        </div>
      </section>
    </div>

    <!-- Confirm Delete Imported Dialog -->
    <ConfirmDialog
      :show="!!deleteTarget"
      :title="t('reading.deleteImportedTitle')"
      :message="t('reading.deleteImportedMessage')"
      :confirm-text="t('reading.deleteBtn')"
      @confirm="confirmDeleteImported"
      @cancel="deleteTarget = null"
    />

    <!-- YouTube Import Modal -->
    <YoutubeImportModal
      :show="showImportModal"
      :user-id="learningContext?.user?.id"
      :target-lang="learningContext?.targetLang"
      :cefr-level="learningContext?.cefr"
      @close="showImportModal = false"
      @imported="onImportedSuccess"
    />

    <Transition name="popup">
      <div v-if="statusText" class="status-toast">{{ statusText }}</div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import { useTargetLangStore } from "@/stores/targetLang.js";
import {
  getReadingArticles,
  finishAndGenerateNextReadingArticle,
  generateInitialReadingArticle,
  getImportedArticles,
  deleteImportedArticle,
} from "@/shared/backend/reading.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import PageHeader from "@/shared/components/PageHeader.vue";
import ConfirmDialog from "@/shared/components/ConfirmDialog.vue";
import YoutubeImportModal from "./YoutubeImportModal.vue";
import { isTvLayoutMode } from "@/shared/appMode.js";

const { t } = useI18n();
const router = useRouter();
const targetLangStore = useTargetLangStore();

const articles = ref([]);
const importedArticles = ref([]);
const loading = ref(true);
const error = ref("");

const isFinishing = ref(false);
const isGeneratingInitial = ref(false);
const showImportModal = ref(false);
const deleteTarget = ref(null);
const statusText = ref("");

let statusTimer = null;
const learningContext = ref(null);

const currentArticle = computed(() => {
  return articles.value.length > 0 ? articles.value[0] : null;
});

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

function scoreStars(article) {
  const correct = Number(article?.test_correct_count) || 0;
  const fullStars = Math.floor(correct / 2);
  const hasHalf = correct % 2 === 1;
  const stars = [];
  for (let i = 0; i < 5; i++) {
    if (i < fullStars) stars.push("full");
    else if (i === fullStars && hasHalf) stars.push("half");
    else stars.push("empty");
  }
  return stars;
}

function parseLocalDate(localDate) {
  const [year, month, day] = String(localDate || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatWeekday(article) {
  const date = parseLocalDate(article?.local_date);
  if (!date) return "";
  const weekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return t(`weekday.${weekdayKeys[date.getDay()]}`);
}

function weekdayClass(article) {
  const date = parseLocalDate(article?.local_date);
  if (!date) return "";
  const day = date.getDay();
  const classMap = ["weekday-sun", "weekday-mon", "weekday-tue", "weekday-wed", "weekday-thu", "weekday-fri", "weekday-sat"];
  return classMap[day];
}

function formatDate(article) {
  return article?.local_date || "";
}

function formatDuration(sec) {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function formatTime(iso) {
  if (!iso) return "";
  try {
    return iso.split("T")[0] || iso.split(" ")[0];
  } catch {
    return iso;
  }
}

function showStatus(text) {
  statusText.value = text;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusText.value = "";
  }, 2500);
}

async function init() {
  loading.value = true;
  error.value = "";
  try {
    learningContext.value = await loadLearningContext({ targetLangStore, fallbackToFirstGoal: true, loadGoals: true });
    if (learningContext.value?.user?.id && learningContext.value?.targetLang) {
      const [aiArts, impArts] = await Promise.all([
        getReadingArticles(learningContext.value.user.id, learningContext.value.targetLang),
        getImportedArticles(learningContext.value.user.id, learningContext.value.targetLang),
      ]);
      // Retain only the latest one
      articles.value = (aiArts || []).slice(0, 1);
      importedArticles.value = impArts || [];
    }
  } catch (e) {
    console.error("Failed to load reading list:", e);
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

async function handleGenerateInitial() {
  if (!learningContext.value?.user?.id || isGeneratingInitial.value) return;
  isGeneratingInitial.value = true;
  try {
    const art = await generateInitialReadingArticle(
      learningContext.value.user.id,
      learningContext.value.targetLang,
      learningContext.value.cefr || "A2",
      learningContext.value.nativeLang || "zh",
    );
    articles.value = [art];
    showStatus(t("reading.articleGenerated"));
  } catch (e) {
    console.error("Failed to generate initial reading article:", e);
    showStatus(e?.message || t("reading.generatingFail"));
  } finally {
    isGeneratingInitial.value = false;
  }
}

async function handleFinishReading() {
  if (!currentArticle.value || isFinishing.value) return;
  isFinishing.value = true;
  try {
    const nextArt = await finishAndGenerateNextReadingArticle(
      currentArticle.value.id,
      learningContext.value?.cefr || "A2",
      learningContext.value?.nativeLang || "zh",
    );
    articles.value = [nextArt];
    showStatus(t("reading.articleGenerated"));
  } catch (e) {
    console.error("Failed to finish and generate next article:", e);
    showStatus(e?.message || t("reading.generatingFail"));
  } finally {
    isFinishing.value = false;
  }
}

function openArticle(id) {
  router.push(`/learn/reading/${id}`);
}

function openImportedArticle(id) {
  router.push({
    path: `/learn/reading/${id}`,
    query: { type: "imported" },
  });
}

function promptDeleteImported(item) {
  deleteTarget.value = item;
}

async function confirmDeleteImported() {
  const item = deleteTarget.value;
  if (!item) return;
  deleteTarget.value = null;
  try {
    await deleteImportedArticle(item.id);
    importedArticles.value = importedArticles.value.filter((a) => a.id !== item.id);
    showStatus(t("reading.deleteSuccess"));
  } catch (e) {
    console.error("Failed to delete imported article:", e);
    showStatus(e?.message || String(e));
  }
}

async function onImportedSuccess() {
  if (learningContext.value?.user?.id && learningContext.value?.targetLang) {
    try {
      importedArticles.value = await getImportedArticles(
        learningContext.value.user.id,
        learningContext.value.targetLang,
      );
    } catch (e) {
      console.warn("Could not refresh imported list:", e);
    }
  }
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
  gap: 16px;
}

.skeleton-card {
  height: 96px;
  border-radius: var(--radius-md);
  background: linear-gradient(90deg, var(--surface) 25%, var(--surface-variant) 50%, var(--surface) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

.skeleton-card.small {
  height: 72px;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.content-container {
  padding: 12px 16px 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.section-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-light);
  letter-spacing: 0.5px;
}

.btn-import-header {
  padding: 4px 10px;
  background: #ff0000;
  color: #fff;
  border: none;
  border-radius: var(--radius-sm, 6px);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-import-header:hover {
  opacity: 0.9;
}

.ai-card-wrapper {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.ai-card {
  flex: 1;
}

.article-card {
  position: relative;
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
  transition: background var(--transition), box-shadow var(--transition), border-color var(--transition);
  touch-action: manipulation;
  user-select: none;
}

.article-card:hover {
  background: var(--green-bg);
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
}

.action-aside {
  display: flex;
  align-items: stretch;
}

.btn-finish {
  padding: 0 16px;
  background: var(--green, #2ecc71);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  transition: background 0.2s, opacity 0.2s;
}

.btn-finish:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-finish:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.empty-ai-card {
  padding: 24px 16px;
  background: var(--white);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.empty-hint {
  margin: 0;
  font-size: 13px;
  color: var(--text-lighter);
}

.card-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: inherit;
  background: rgba(255, 255, 255, 0.88);
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  z-index: 2;
}

.generation-spinner {
  width: 14px;
  height: 14px;
  margin-right: 8px;
  border: 2px solid var(--border);
  border-top-color: var(--green);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
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

.date-weekday.weekday-sun { color: #e74c3c; }
.date-weekday.weekday-mon { color: #e67e22; }
.date-weekday.weekday-tue { color: #f1c40f; }
.date-weekday.weekday-wed { color: #2ecc71; }
.date-weekday.weekday-thu { color: #3498db; }
.date-weekday.weekday-fri { color: #9b59b6; }
.date-weekday.weekday-sat { color: #1abc9c; }

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
  background: #fff4d6;
  color: #9a7400;
}

.score-stars {
  display: inline-flex;
  gap: 1px;
  letter-spacing: 0;
}

.star {
  position: relative;
  display: inline-block;
  width: 1em;
  line-height: 1;
}

.star-base { color: #e6e0c8; }
.star-fill {
  position: absolute;
  left: 0;
  top: 0;
  color: #f5b301;
  overflow: hidden;
  white-space: nowrap;
}
.star-full .star-fill { width: 100%; }
.star-half .star-fill { width: 50%; }
.star-empty .star-fill { width: 0; }

/* Imported List */
.empty-imported {
  padding: 20px 16px;
  text-align: center;
  color: var(--text-lighter);
  font-size: 13px;
  background: var(--white);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
}

.imported-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.imported-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition), box-shadow var(--transition);
}

.imported-card:hover {
  background: var(--surface, #f9f9f9);
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.imported-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.imported-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.imported-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.imported-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-lighter);
}

.btn-delete {
  background: none;
  border: none;
  color: var(--text-lighter);
  padding: 6px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s, background 0.2s;
}

.btn-delete:hover {
  color: #e74c3c;
  background: #fde8e8;
}

.btn-primary, .btn-secondary {
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-weight: 600;
  cursor: pointer;
  font-size: 13px;
}

.btn-primary {
  background: var(--green);
  color: #fff;
  border-color: var(--green);
}

.btn-secondary {
  background: var(--white);
  color: var(--text);
}

.status-toast {
  position: fixed;
  left: 50%;
  bottom: calc(80px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  max-width: calc(100% - 32px);
  padding: 10px 16px;
  border-radius: 999px;
  background: rgba(30, 30, 30, 0.92);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  z-index: 1100;
  pointer-events: none;
}

.popup-enter-active,
.popup-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.popup-enter-from,
.popup-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
