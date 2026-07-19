<template>
  <div class="vocab-page" :class="{ 'tv-content-pane': isTvMode }">
    <!-- Stats overview -->
    <template v-if="!drilledLevel">
      <header class="page-header overview-header">
        <button
          class="back-btn"
          type="button"
          :tabindex="isTvMode ? -1 : undefined"
          :aria-label="t('common.back')"
          @click="backToLearn"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
        </button>
        <h1 class="page-title">{{ t('vocab.title') }}</h1>
      </header>

      <div v-if="loading" class="loading-center">
        <div class="spinner" />
      </div>

      <div v-else-if="error" class="empty-state">{{ error }}</div>

      <template v-else>
        <div class="level-cards">
          <button
            v-for="s in stats"
            :key="s.level"
            class="level-card"
            :data-level="s.level"
            @click="enterLevel(s.level)"
          >
            <div class="card-top">
              <span class="card-level">{{ s.level }}</span>
              <span class="card-percent">{{ s.total > 0 ? Math.round(s.mastered / s.total * 100) : 0 }}%</span>
            </div>
            <div class="card-bar">
              <div class="card-bar-fill" :style="{ width: s.total > 0 ? (s.mastered / s.total * 100) + '%' : '0%' }" />
            </div>
            <div class="card-stats-row">
              <span class="stat-dot dot-mastered" />{{ s.mastered }}
              <span class="stat-dot dot-seen" />{{ s.seen }}
              <span class="stat-dot dot-unseen" />{{ s.unseen }}
            </div>
          </button>
        </div>

        <div v-if="stats.length === 0" class="empty-state">
          {{ noVocabMessage }}
        </div>
      </template>
    </template>

    <!-- Word list per level -->
    <template v-else>
      <header class="page-header detail-header">
        <button class="back-btn" type="button" :tabindex="isTvMode ? -1 : undefined" @click="exitLevel">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
        </button>
        <h1 class="page-title">{{ drilledLevel }}</h1>
        <div class="detail-total">{{ t('vocab.words', { n: filteredWords.length }) }}</div>
        <button class="reset-btn" @click="resetLevel" :title="t('vocab.reset')">{{ t('vocab.reset') }}</button>
      </header>

      <div class="status-tabs">
        <button
          v-for="tab in statusTabs"
          :key="tab.value"
          class="status-tab"
          :class="{ active: activeStatus === tab.value }"
          @click="activeStatus = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="word-scroll">
        <div class="word-paragraph" v-if="filteredWords.length > 0">
          <template v-for="(w, idx) in filteredWords" :key="w.id">
            <span
              class="word-chip word"
              :class="chipClass(w.mastery)"
              :tabindex="isTvMode ? 0 : undefined"
              @click="onWordTap(w)"
              @keydown.enter.prevent="onWordTap(w)"
              @keydown.space.prevent="onWordTap(w)"
            >{{ w.word }}</span><template v-if="idx < filteredWords.length - 1">, </template>
          </template>
        </div>
        <div v-else class="empty-state">
          {{ noWordsInStatus }}
        </div>
      </div>

      <!-- Word popup -->
      <Transition name="popup">
        <WordPopup
          v-if="selectedWord"
          :word="selectedWord.word"
          :context="selectedWord.word"
          :source-lang="userLang"
          :native-lang="locale"
          @close="selectedWord = null"
          @known="onKnown"
          @unknown="onUnknown"
        />
      </Transition>
    </template>

    <ConfirmDialog
      :show="showResetDialog"
      :message="t('vocab.resetConfirm', { level: drilledLevel })"
      :confirmText="t('vocab.reset')"
      danger
      @confirm="confirmReset"
      @cancel="showResetDialog = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import { isTvMode } from "@/shared/appMode.js";
import { getCurrentUser } from "@/shared/backend/user.js";
import {
  getUserVocabByLevel,
  getUserVocabStatsByLevel,
  resetUserVocabByLevel,
  updateWordMastery,
} from "@/shared/backend/vocabulary.js";
import { useI18n } from "@/shared/i18n";
import { useTargetLangStore, TARGET_LANG_CHANGED } from "@/stores/targetLang.js";
import { eventBus } from "@/shared/eventBus.js";
import { displayLang } from "@/shared/constants.js";
import WordPopup from "@/shared/components/WordPopup.vue";
import ConfirmDialog from "@/shared/components/ConfirmDialog.vue";
import { focusElement, focusableElements, pickPreferredContentFocus } from "@/app/tvRemoteNavigation.js";

const { t, locale } = useI18n();
const router = useRouter();
const targetLangStore = useTargetLangStore();
const loading = ref(true);
const error = ref("");
const stats = ref([]);
const words = ref([]);
const drilledLevel = ref("");
const activeStatus = ref("all");
const userLang = computed(() => targetLangStore.code || "es");
const userId = ref("");
const selectedWord = ref(null);
const showResetDialog = ref(false);
let unsubscribe = null;
const handleAndroidBackInPage = () => {
  if (!drilledLevel.value) return null;
  exitLevel();
  return "navigated";
};

const statusTabs = computed(() => [
  { label: t("vocab.tabs.all"), value: "all" },
  { label: t("vocab.tabs.unseen"), value: "unseen" },
  { label: t("vocab.tabs.seen"), value: "seen" },
  { label: t("vocab.tabs.mastered"), value: "mastered" },
]);

const noVocabMessage = computed(() => {
  return t("vocab.noData", { lang: langDisplayName(userLang.value) });
});

const noWordsInStatus = computed(() => {
  return t("vocab.emptyStatus");
});

const filteredWords = computed(() => {
  return words.value.filter(w => {
    const m = w.mastery;
    switch (activeStatus.value) {
      case "unseen": return m === undefined || m === null;
      case "seen": return m === 1;
      case "mastered": return m >= 2;
      default: return true;
    }
  });
});

function langDisplayName(code) {
  return displayLang(code, locale.value);
}

function chipClass(mastery) {
  if (mastery === undefined || mastery === null) return "chip-unseen";
  if (mastery >= 2) return "chip-mastered";
  if (mastery === 1) return "chip-seen";
  return "chip-unseen";
}

function enterLevel(level) {
  drilledLevel.value = level;
  activeStatus.value = "all";
  loadWords(level);
}

function exitLevel() {
  const exitedLevel = drilledLevel.value;
  drilledLevel.value = "";
  words.value = [];
  selectedWord.value = null;

  if (isTvMode && exitedLevel) {
    nextTick(() => {
      const cards = document.querySelectorAll(".level-card");
      const targetCard = Array.from(cards).find(
        (c) => c.getAttribute("data-level") === exitedLevel,
      );
      if (targetCard) {
        focusElement(targetCard);
      } else {
        const preferred = pickPreferredContentFocus(focusableElements());
        if (preferred) focusElement(preferred);
      }
    });
  }
}

function backToLearn() {
  router.replace({ name: "learn" });
}

function syncAndroidBackHook() {
  if (typeof window === "undefined") return;
  if (drilledLevel.value) {
    window.__amigaGoBackInPage = handleAndroidBackInPage;
    return;
  }
  if (window.__amigaGoBackInPage === handleAndroidBackInPage) {
    delete window.__amigaGoBackInPage;
  }
}

async function loadWords(level) {
  if (!level) return;
  try {
    words.value = await getUserVocabByLevel(userId.value, userLang.value, level);
    if (isTvMode) {
      nextTick(() => {
        const preferred = pickPreferredContentFocus(focusableElements());
        if (preferred) {
          focusElement(preferred);
        }
      });
    }
  } catch (e) {
    words.value = [];
  }
}

async function loadStats() {
  try {
    stats.value = await getUserVocabStatsByLevel(userId.value, userLang.value);
  } catch (e) {
    error.value = t("common.fail");
  }
}

function onWordTap(w) {
  selectedWord.value = w;
}

async function onKnown() {
  if (!selectedWord.value) return;
  const w = selectedWord.value;
  const mastery = w.mastery === undefined || w.mastery === null ? 1 : w.mastery;
  try {
    await updateWordMastery(userId.value, w.id, 2, "vocab_review");
    w.mastery = 2;
  } catch (_) {}
  selectedWord.value = null;
}

async function onUnknown() {
  if (!selectedWord.value) return;
  const w = selectedWord.value;
  try {
    await updateWordMastery(userId.value, w.id, 1, "vocab_review");
    w.mastery = 1;
  } catch (_) {}
  selectedWord.value = null;
}

function resetLevel() {
  showResetDialog.value = true;
}

async function confirmReset() {
  showResetDialog.value = false;
  try {
    await resetUserVocabByLevel(userId.value, userLang.value, drilledLevel.value);
    await loadWords(drilledLevel.value);
    await loadStats();
  } catch (_) {}
}

onMounted(async () => {
  loading.value = true;
  error.value = "";
  try {
    const user = await getCurrentUser();
    userId.value = user.id;
    await targetLangStore.load();
    await loadStats();
  } catch (e) {
    error.value = t("common.fail");
  } finally {
    loading.value = false;
  }
  unsubscribe = eventBus.on(TARGET_LANG_CHANGED, async () => {
    drilledLevel.value = "";
    words.value = [];
    await loadStats();
  });
  syncAndroidBackHook();
});

onBeforeUnmount(() => {
  if (unsubscribe) unsubscribe();
  if (typeof window !== "undefined" && window.__amigaGoBackInPage === handleAndroidBackInPage) {
    delete window.__amigaGoBackInPage;
  }
});

// React to the user changing the learning language elsewhere (Profile page).
watch(userLang, async () => {
  drilledLevel.value = "";
  words.value = [];
  await loadStats();
});

watch(drilledLevel, () => {
  syncAndroidBackHook();
});
</script>

<style scoped>
.vocab-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface);
}

.page-header {
  padding: 16px 20px 12px;
  flex-shrink: 0;
}

.overview-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.detail-total {
  font-size: 13px;
  color: var(--text-lighter);
  font-weight: 500;
  margin-left: auto;
}

.reset-btn {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border: 1.5px solid var(--red);
  border-radius: 12px;
  background: transparent;
  color: var(--red);
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
  white-space: nowrap;
}

.reset-btn:hover {
  background: var(--red-bg);
}

.back-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background var(--transition);
}

.back-btn:hover {
  background: var(--surface-variant);
}

.page-title {
  font-size: 22px;
  font-weight: 800;
  margin: 0;
  color: var(--text);
}

.loading-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--green);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-lighter);
  font-size: 14px;
  padding: 40px;
  text-align: center;
}

/* Level cards */
.level-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 20px 20px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.level-card {
  display: block;
  width: 100%;
  padding: 16px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  cursor: pointer;
  transition: all var(--transition);
  text-align: left;
  font-family: inherit;
}

.level-card:hover {
  border-color: var(--green);
  background: var(--green-bg);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.card-level {
  font-size: 18px;
  font-weight: 800;
  color: var(--text);
}

.card-percent {
  font-size: 15px;
  font-weight: 700;
  color: var(--green);
}

.card-bar {
  width: 100%;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 8px;
}

.card-bar-fill {
  height: 100%;
  background: var(--green);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.card-stats-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-lighter);
  font-weight: 500;
}

.stat-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.stat-dot:not(:first-child) {
  margin-left: 4px;
}

.dot-unseen { background: var(--border); }
.dot-seen { background: var(--blue); }
.dot-mastered { background: var(--green); }

/* Status tabs */
.status-tabs {
  display: flex;
  gap: 6px;
  padding: 0 20px 12px;
  overflow-x: auto;
  flex-shrink: 0;
}

.status-tab {
  padding: 6px 14px;
  border: 1.5px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
  color: var(--text-light);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition);
  white-space: nowrap;
  font-family: inherit;
}

.status-tab.active {
  border-color: var(--green);
  background: var(--green-bg);
  color: var(--green);
}

/* Word paragraph */
.word-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 20px 20px;
}

.word-paragraph {
  font-size: 17px;
  line-height: 2.4;
  color: var(--text);
  user-select: text;
}

.word-chip {
  cursor: pointer;
  padding: 2px 1px;
  border-radius: 3px;
  transition: background 0.1s;
}

.word-chip:hover {
  background: var(--purple-bg);
}

.chip-unseen { color: var(--text); }
.chip-seen { color: var(--blue); font-weight: 600; }
.chip-mastered { color: var(--green); font-weight: 700; }

/* Popup transition */
.popup-enter-active,
.popup-leave-active {
  transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
}
.popup-enter-from,
.popup-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* TV: tight inline focus — never scale or use the global 5px outer ring. */
html[data-app-mode="tv"] .word:focus-visible {
  outline: 2px solid var(--green);
  outline-offset: 1px;
  background: var(--green-bg);
  border-radius: 4px;
}
</style>
