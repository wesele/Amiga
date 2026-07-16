<template>
  <div class="story-page">
    <PageHeader :title="t('soulmate.storyTitle')" />
    <div v-if="loading" class="state-block">{{ t("app.loading") }}</div>
    <div v-else-if="error" class="state-block error">{{ error }}</div>
    <main v-else-if="episode" class="story-content article-body">
      <div class="letter-mark" aria-hidden="true">✉</div>
      <div class="story-meta">{{ t("soulmate.letterFrom") }} · {{ t("soulmate.day", { day: episode.day_number }) }}</div>
      <div class="subject-label">{{ t("soulmate.letterSubject") }}</div>
      <h1>{{ episode.title }}</h1>
      <p class="teaser">{{ episode.teaser }}</p>
      <div class="ornament">✦</div>
      <article>
        <p v-for="(tokens, paragraphIndex) in paragraphTokens" :key="paragraphIndex">
          <template v-for="(token, tokenIndex) in tokens" :key="tokenIndex">
            <span v-if="token.isWord" class="word" @click.stop="onWordTap(token)">{{ token.text }}</span>
            <span v-else>{{ token.text }}</span>
          </template>
        </p>
      </article>
      <button class="finish-btn" type="button" :disabled="finishing" @click="finish">
        {{ finishing ? t("soulmate.finishing") : t("soulmate.finishStory") }}
      </button>
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
const paragraphTokens = computed(() => (
  episode.value?.body
    ?.split(/\n+/)
    .filter(Boolean)
    .map((paragraph) => tokenizeArticleText(paragraph)) || []
));

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

onMounted(async () => {
  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("pointerup", onPointerUp);
  window.__amigaTranslateSelection = handleNativeTranslate;
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
.teaser { margin: 0; color: var(--text-light); font-size: 15px; font-style: italic; line-height: 1.55; }
.ornament { margin: 22px 0; color: #ff5d8f; text-align: center; }
article { color: var(--text); font-family: Georgia, serif; font-size: 17px; line-height: 1.85; }
article p { margin: 0 0 18px; }
.word { cursor: pointer; border-radius: 3px; user-select: text; -webkit-user-select: text; -webkit-tap-highlight-color: transparent; }
.word:hover { background: var(--blue-bg); }
.finish-btn { width: 100%; min-height: 52px; margin-top: 20px; border: none; border-radius: 16px; background: #ff5d8f; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
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
</style>
