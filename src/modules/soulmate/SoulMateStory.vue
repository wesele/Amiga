<template>
  <div class="story-page" :class="{ 'tv-content-pane tv-story': isTvLayoutMode }">
    <PageHeader :title="t('soulmate.storyTitle')">
      <template #actions>
        <button
          v-if="episode"
          type="button"
          class="btn-bilingual-header"
          :class="{ active: bilingualMode }"
          :title="bilingualMode ? t('news.original') : t('news.bilingual')"
          @click="toggleBilingual"
        >
          {{ bilingualMode ? t("news.bilingual") : t("news.original") }}
        </button>
      </template>
    </PageHeader>
    <div v-if="loading" class="state-block">{{ t("app.loading") }}</div>
    <div v-else-if="error" class="state-block error">{{ error }}</div>
    <main v-else-if="episode" class="story-content article-body">
      <div class="letter-mark" aria-hidden="true">✉</div>
      <div class="story-meta">{{ t("soulmate.letterFrom") }} · {{ t("soulmate.day", { day: episode.day_number }) }}</div>
      <div class="subject-label">{{ t("soulmate.letterSubject") }}</div>
      <h1>{{ episode.title }}</h1>
      <p v-if="bilingualMode && titleTranslation" class="title-translation">{{ titleTranslation }}</p>
      <p class="teaser">{{ episode.teaser }}</p>
      <p v-if="bilingualMode && teaserTranslation" class="teaser-translation">{{ teaserTranslation }}</p>
      <div class="ornament">✦</div>

      <!-- Original reading mode -->
      <article v-if="!bilingualMode" class="article-text">
        <p v-for="(tokens, paragraphIndex) in bodyParagraphs" :key="paragraphIndex" class="para">
          <template v-for="(token, tokenIndex) in tokens" :key="tokenIndex">
            <span
              v-if="token.isWord"
              class="word"
              :tabindex="isTvLayoutMode ? 0 : undefined"
              @click.stop="onWordTap(token)"
              @keydown.enter.prevent="onWordTap(token)"
              @keydown.space.prevent="onWordTap(token)"
            >{{ token.text }}</span>
            <span v-else>{{ token.text }}</span>
          </template>
        </p>
      </article>

      <!-- Bilingual reading mode -->
      <article v-else-if="translations.length > 0" class="article-text bilingual">
        <template v-for="(tokens, paragraphIndex) in paraTokens" :key="paragraphIndex">
          <p class="para-original">
            <template v-for="(token, tokenIndex) in tokens" :key="tokenIndex">
              <span
                v-if="token.isWord"
                class="word"
                :tabindex="isTvLayoutMode ? 0 : undefined"
                @click.stop="onWordTap(token)"
                @keydown.enter.prevent="onWordTap(token)"
                @keydown.space.prevent="onWordTap(token)"
              >{{ token.text }}</span>
              <span v-else>{{ token.text }}</span>
            </template>
          </p>
          <p
            class="para-translation"
            :tabindex="isTvLayoutMode ? 0 : undefined"
          >{{ translations[paragraphIndex] || "..." }}</p>
        </template>
      </article>

      <div v-else-if="loadingTranslation" class="bilingual-status">
        <p class="translating-text">{{ t("news.translating") }}</p>
      </div>

      <div v-else class="bilingual-status error">
        <p class="error-text">{{ translationError || t("news.bilingualLoadFail") }}</p>
        <button class="retry-btn" type="button" @click="loadBilingual">{{ t("common.retry") }}</button>
      </div>

      <div class="bottom-actions">
        <button
          type="button"
          class="mode-toggle-btn"
          :class="{ active: bilingualMode }"
          @click="toggleBilingual"
        >
          {{ bilingualMode ? t("news.bilingual") : t("news.original") }}
        </button>
        <button class="finish-btn" type="button" :disabled="finishing" @click="finish">
          {{ finishing ? t("soulmate.finishing") : t("soulmate.finishStory") }}
        </button>
      </div>
    </main>

    <Transition name="popup">
      <WordPopup
        v-if="selectedWord"
        :word="selectedWord.text"
        :context="selectedWord.context"
        :source-lang="targetLang"
        :native-lang="getLocale()"
        mode="word"
        @close="selectedWord = null"
        @known="setWordMastery(2)"
        @unknown="setWordMastery(1)"
      />
    </Transition>

    <Transition name="popup">
      <div v-if="selectionText" class="sel-overlay" @click.self="clearSelection">
        <div class="sel-popup">
          <div class="sel-source">{{ selectionText }}</div>
          <div v-if="selectionLoading" class="sel-loading">{{ t("news.translating") }}</div>
          <div v-else-if="selectionResult" class="sel-result">{{ selectionResult }}</div>
          <div v-else-if="selectionError" class="sel-error">{{ selectionError }}</div>
          <button class="sel-close" type="button" @click="clearSelection">×</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import PageHeader from "@/shared/components/PageHeader.vue";
import WordPopup from "@/shared/components/WordPopup.vue";
import { tokenizeArticleText } from "@/shared/articleText.js";
import { isTvLayoutMode } from "@/shared/appMode.js";
import { pushInPageBackHandler } from "@/shared/inPageBack.js";
import { useI18n, getLocale } from "@/shared/i18n";
import { loadLearningContext } from "@/shared/learningContext.js";
import { translateText } from "@/shared/backend/llm.js";
import { useSelectionTranslation } from "@/shared/selectionTranslation.js";
import { getSoulMateEpisode, markSoulMateStoryRead } from "@/shared/backend/soulmate.js";
import {
  addDiscoveredWord,
  lookupWordIds,
  updateWordMastery,
} from "@/shared/backend/vocabulary.js";

const props = defineProps({ episodeId: { type: String, required: true } });
const router = useRouter();
const { t } = useI18n();
const episode = ref(null);
const loading = ref(true);
const finishing = ref(false);
const error = ref("");
const selectedWord = ref(null);
const userId = ref("");
const targetLang = ref("es");

const bilingualMode = ref(false);
const translations = ref([]);
const paraTokens = ref([]);
const titleTranslation = ref("");
const teaserTranslation = ref("");
const loadingTranslation = ref(false);
const translationError = ref("");

/** Paragraph-aware body tokens — same shape as NewsReader / ReadingReader. */
const bodyParagraphs = computed(() => {
  const body = episode.value?.body || "";
  if (!body.trim()) return [];
  const blocks = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const paragraphs = blocks.length > 0 ? blocks : body.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  return paragraphs.map((paragraph) => tokenizeArticleText(paragraph));
});

async function toggleBilingual() {
  bilingualMode.value = !bilingualMode.value;
  if (bilingualMode.value && translations.value.length === 0) {
    await loadBilingual();
  }
}

async function loadBilingual() {
  if (!episode.value) return;
  loadingTranslation.value = true;
  translationError.value = "";
  try {
    const body = episode.value?.body || "";
    const blocks = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const paragraphs = blocks.length > 0 ? blocks : body.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    paraTokens.value = paragraphs.map((p) => tokenizeArticleText(p));
    translations.value = await Promise.all(
      paragraphs.map((paragraph) => translateText(paragraph, targetLang.value, getLocale())),
    );

    const title = episode.value?.title || "";
    if (title) {
      try {
        titleTranslation.value = await translateText(title, targetLang.value, getLocale());
      } catch (_) {
        titleTranslation.value = "";
      }
    }

    const teaser = episode.value?.teaser || "";
    if (teaser) {
      try {
        teaserTranslation.value = await translateText(teaser, targetLang.value, getLocale());
      } catch (_) {
        teaserTranslation.value = "";
      }
    }
  } catch (e) {
    console.error("Failed to load bilingual translation in SoulMateStory:", e);
    translationError.value = typeof e === "string" ? e : (e?.message || t("news.bilingualLoadFail"));
  } finally {
    loadingTranslation.value = false;
  }
}

const {
  selectionText,
  selectionResult,
  selectionLoading,
  selectionError,
  onSelectionChange,
  onPointerUp,
  handleNativeTranslate,
  clearSelection,
  cleanup: cleanupSelectionTranslation,
} = useSelectionTranslation({
  translateText,
  getTargetLang: () => targetLang.value,
  getNativeLang: () => getLocale(),
  t,
});

let releaseSelectionBack = null;

onMounted(async () => {
  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("pointerup", onPointerUp);
  window.__amigaTranslateSelection = handleNativeTranslate;
  // Back closes selection sheet before leaving the letter (matches news/reading).
  releaseSelectionBack = pushInPageBackHandler(() => {
    if (selectionText.value) {
      clearSelection();
      return "navigated";
    }
    return null;
  });
  try {
    const [story, context] = await Promise.all([
      getSoulMateEpisode(props.episodeId),
      loadLearningContext({ fallbackToFirstGoal: true }),
    ]);
    episode.value = story;
    userId.value = context.user?.id || "";
    targetLang.value = context.targetLang;
  } catch (e) {
    error.value = e?.message || t("soulmate.storyLoadFail");
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("selectionchange", onSelectionChange);
  document.removeEventListener("pointerup", onPointerUp);
  if (window.__amigaTranslateSelection === handleNativeTranslate) {
    delete window.__amigaTranslateSelection;
  }
  releaseSelectionBack?.();
  releaseSelectionBack = null;
  cleanupSelectionTranslation();
});

function onWordTap(token) {
  const selection = window.getSelection?.();
  if (selection?.toString().trim()) return;
  selectedWord.value = token;
}

async function setWordMastery(mastery) {
  const word = selectedWord.value;
  selectedWord.value = null;
  if (!word || !userId.value) return;
  try {
    const ids = await lookupWordIds([word.text], targetLang.value);
    const wordId = ids[0] || await addDiscoveredWord(
      userId.value,
      word.text,
      targetLang.value,
      word.context,
    );
    if (ids.length > 0 || mastery > 1) {
      await updateWordMastery(userId.value, wordId, mastery, "soulmate_story");
    }
  } catch (_) {
    // Translation remains usable even when vocabulary tracking is unavailable.
  }
}

async function finish() {
  if (finishing.value) return;
  finishing.value = true;
  try {
    await markSoulMateStoryRead(props.episodeId);
    await router.replace({ name: "soulmate" });
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    finishing.value = false;
  }
}
</script>

<style scoped>
.story-page { min-height: 100%; background: #fffdfb; }
.story-content { max-width: 620px; margin: 0 auto; padding: 28px 25px calc(38px + var(--safe-bottom)); }
.letter-mark { width: 42px; height: 42px; display: grid; place-items: center; margin: 0 0 13px auto; border: 1px solid #f3b5c8; border-radius: 8px; color: #d9366e; font-size: 22px; transform: rotate(3deg); }
.story-meta { color: #d9366e; font-size: 12px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
.subject-label { margin-top: 17px; color: var(--text-lighter); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
.story-content h1 { margin: 8px 0 9px; color: var(--text); font-family: Georgia, serif; font-size: 30px; line-height: 1.18; }
.title-translation { margin: -4px 0 12px; color: var(--text-lighter); font-size: 15px; line-height: 1.45; }
.teaser { margin: 0; color: var(--text-light); font-size: 15px; font-style: italic; line-height: 1.55; }
.teaser-translation { margin: 4px 0 0; color: var(--text-lighter); font-size: 14px; font-style: italic; line-height: 1.45; }
.ornament { margin: 22px 0; color: #ff5d8f; text-align: center; }
.article-text {
  color: var(--text);
  font-family: Georgia, serif;
  font-size: 17px;
  line-height: 1.85;
  overflow-wrap: break-word;
  word-wrap: break-word;
}
.article-text .para { margin: 0 0 18px; }
.article-text.bilingual {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.para-original {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}
.para-translation {
  color: var(--text-lighter);
  font-size: 14px;
  line-height: 1.55;
  margin: 0 0 16px;
  padding-left: 12px;
  border-left: 2px solid var(--border, #eddcd2);
  white-space: pre-wrap;
  overflow-wrap: break-word;
}
html[data-app-mode="tv"] .para-translation {
  font-size: 16px;
  line-height: 1.55;
  border-radius: 6px;
  outline: none;
}
html[data-app-mode="tv"] .para-translation:focus-visible {
  outline: 2px solid #1cb0f6 !important;
  outline-offset: 2px !important;
  box-shadow: none !important;
  transform: none !important;
  background: rgba(28, 176, 246, 0.08);
}
.bilingual-status {
  padding: 24px 0;
  text-align: center;
}
.translating-text {
  color: var(--text-lighter);
  font-size: 14px;
}
.bilingual-status.error {
  color: var(--red);
}
.retry-btn {
  margin-top: 10px;
  padding: 6px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.bottom-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}
.mode-toggle-btn {
  flex: 1;
  min-height: 52px;
  border: 1.5px solid #f3b5c8;
  border-radius: 16px;
  background: #fff;
  color: #d9366e;
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.mode-toggle-btn.active {
  background: #fff0f5;
  border-color: #d9366e;
}
.btn-bilingual-header {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text-light);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.btn-bilingual-header.active {
  border-color: #d9366e;
  color: #d9366e;
  background: #fff0f5;
}
.word {
  cursor: pointer;
  padding: 0 1px;
  border-radius: 3px;
  transition: background 0.1s;
  white-space: normal;
  display: inline;
  user-select: text;
  -webkit-user-select: text;
  -webkit-tap-highlight-color: transparent;
}
.word:hover { background: var(--blue-bg); }
/* TV: tight inline focus — never scale or use the global 5px outer ring. */
.word:focus-visible {
  outline: 2px solid #1cb0f6 !important;
  outline-offset: 0 !important;
  box-shadow: none !important;
  background: var(--blue-bg) !important;
  transform: none !important;
  z-index: 2;
  position: relative;
  border-radius: 3px;
}
.finish-btn {
  flex: 1;
  min-height: 52px;
  margin: 0;
  border: none;
  border-radius: 16px;
  background: #ff5d8f;
  color: #fff;
  font: inherit;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  transition: opacity 0.2s;
}
.finish-btn:disabled { opacity: .65; }
.state-block { min-height: 60vh; display: grid; place-content: center; padding: 24px; color: var(--text-lighter); text-align: center; }
.state-block.error { color: var(--red); }
.sel-overlay { position: fixed; inset: 0; z-index: 220; display: flex; align-items: flex-end; justify-content: center; padding: 16px 16px calc(16px + var(--safe-bottom)); background: rgba(0,0,0,.2); }
.sel-popup { position: relative; width: min(100%, 560px); max-height: 65vh; overflow-y: auto; padding: 20px; box-sizing: border-box; border-radius: 18px; background: var(--surface); box-shadow: 0 18px 50px rgba(0,0,0,.2); }
.sel-source { padding-right: 28px; color: var(--text-light); font-family: Georgia, serif; font-size: 15px; line-height: 1.6; }
.sel-result { margin-top: 14px; color: var(--text); font-size: 16px; line-height: 1.65; }
.sel-loading { margin-top: 14px; color: var(--text-lighter); }
.sel-error { margin-top: 14px; color: var(--red); }
.sel-close { position: absolute; top: 10px; right: 10px; width: 32px; height: 32px; border: 0; border-radius: 50%; background: var(--bg); color: var(--text-light); font-size: 20px; cursor: pointer; }

/* TV: balanced gutters + centered measure (same as news/reading). */
html[data-app-mode="tv"] .story-content.article-body {
  max-width: none;
  margin: 0;
  width: 100%;
  padding: 16px 24px calc(32px + var(--safe-bottom));
  box-sizing: border-box;
}
html[data-app-mode="tv"] .article-text {
  font-size: 22px;
  line-height: 1.75;
  max-width: none;
  margin-inline: 0;
  width: 100%;
}
html[data-app-mode="tv"] .story-content h1 {
  font-size: 28px;
  overflow-wrap: break-word;
  max-width: none;
  margin-inline: 0;
}
.tv-story .mode-toggle-btn,
.tv-story .finish-btn {
  min-height: 56px;
  font-size: 18px;
}
.tv-story .mode-toggle-btn:focus-visible,
.tv-story .finish-btn:focus-visible {
  outline: 3px solid #ff5d8f !important;
  outline-offset: 2px;
  transform: none !important;
}
</style>
