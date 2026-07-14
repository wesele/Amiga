<template>
  <div class="story-page">
    <PageHeader :title="t('soulmate.storyTitle')" />
    <div v-if="loading" class="state-block">{{ t("app.loading") }}</div>
    <div v-else-if="error" class="state-block error">{{ error }}</div>
    <main v-else-if="episode" class="story-content">
      <div class="story-meta">{{ t("soulmate.day", { day: episode.day_number }) }}</div>
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
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import PageHeader from "@/shared/components/PageHeader.vue";
import WordPopup from "@/shared/components/WordPopup.vue";
import { tokenizeArticleText } from "@/shared/articleText.js";
import { useI18n, getLocale } from "@/shared/i18n";
import { loadLearningContext } from "@/shared/learningContext.js";
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

onMounted(async () => {
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
.story-meta { color: #d9366e; font-size: 12px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
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
</style>
