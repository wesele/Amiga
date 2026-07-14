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
        <p v-for="(paragraph, index) in paragraphs" :key="index">{{ paragraph }}</p>
      </article>
      <button class="finish-btn" type="button" :disabled="finishing" @click="finish">
        {{ finishing ? t("soulmate.finishing") : t("soulmate.finishStory") }}
      </button>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import PageHeader from "@/shared/components/PageHeader.vue";
import { useI18n } from "@/shared/i18n";
import { getSoulMateEpisode, markSoulMateStoryRead } from "@/shared/backend/soulmate.js";

const props = defineProps({ episodeId: { type: String, required: true } });
const router = useRouter();
const { t } = useI18n();
const episode = ref(null);
const loading = ref(true);
const finishing = ref(false);
const error = ref("");
const paragraphs = computed(() => episode.value?.body?.split(/\n+/).filter(Boolean) || []);

onMounted(async () => {
  try {
    episode.value = await getSoulMateEpisode(props.episodeId);
  } catch (e) {
    error.value = e?.message || t("soulmate.storyLoadFail");
  } finally {
    loading.value = false;
  }
});

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
.finish-btn { width: 100%; min-height: 52px; margin-top: 20px; border: none; border-radius: 16px; background: #ff5d8f; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
.finish-btn:disabled { opacity: .65; }
.state-block { min-height: 60vh; display: grid; place-content: center; padding: 24px; color: var(--text-lighter); text-align: center; }
.state-block.error { color: var(--red); }
</style>
