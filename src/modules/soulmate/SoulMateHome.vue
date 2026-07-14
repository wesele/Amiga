<template>
  <div class="soulmate-home">
    <PageHeader :title="t('soulmate.title')" />

    <div v-if="loading" class="center-state">
      <span class="pulse-heart">♥</span>
      <p>{{ t("soulmate.loadingGreeting") }}</p>
    </div>

    <main v-else-if="home?.world" class="home-content">
      <section class="companion-card">
        <div class="relationship-line">
          <span>{{ stageLabel }}</span>
          <span v-if="home.day_number">{{ t("soulmate.day", { day: home.day_number }) }}</span>
        </div>
        <div class="avatar-halo"><span>{{ avatar }}</span></div>
        <h2>{{ home.world.companion_name }}</h2>
        <p class="greeting">{{ home.greeting }}</p>
      </section>

      <button class="story-action" type="button" :disabled="busy" @click="handleAction">
        <span class="action-icon" v-html="actionIcon" />
        <span>{{ busy ? t("soulmate.preparing") : actionLabel }}</span>
      </button>
      <p v-if="error" class="error-text">{{ error }}</p>

      <div class="story-promise">
        <span>✦</span>
        <p>{{ t("soulmate.storyHint") }}</p>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import PageHeader from "@/shared/components/PageHeader.vue";
import { useI18n } from "@/shared/i18n";
import { loadLearningContext } from "@/shared/learningContext.js";
import { generateSoulMateEpisode, getSoulMateHome } from "@/shared/backend/soulmate.js";

const router = useRouter();
const { t } = useI18n();
const loading = ref(true);
const busy = ref(false);
const error = ref("");
const home = ref(null);
const userId = ref("");

const avatar = computed(() => ({ female: "👩", male: "👨", neutral: "✨" })[home.value?.world?.companion_gender] || "💞");
const stageLabel = computed(() => t(`soulmate.stage${({ new: "New", familiar: "Familiar", trusted: "Trusted", bonded: "Bonded" })[home.value?.world?.relationship_stage] || "New"}`));
const actionLabel = computed(() => ({
  story_available: t("soulmate.todayStory"),
  story_in_progress: t("soulmate.continueStory"),
  story_read: t("soulmate.chat"),
  chat_started: t("soulmate.continueChat"),
})[home.value?.state] || t("soulmate.todayStory"));
const actionIcon = computed(() => home.value?.state === "story_available"
  ? '<svg viewBox="0 0 24 24"><path d="M15 4l5 5L8 21H3v-5L15 4zM13 6l5 5M5 4v4M3 6h4M19 15v4M17 17h4"/></svg>'
  : home.value?.state?.includes("chat") || home.value?.state === "story_read"
    ? '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4V5zM8 9h8M8 12h5"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M6 4h12v16H6zM9 8h6M9 12h6"/></svg>');

onMounted(loadHome);

async function loadHome() {
  loading.value = true;
  error.value = "";
  try {
    const context = await loadLearningContext({ fallbackToFirstGoal: true });
    userId.value = context.user?.id || "";
    home.value = await getSoulMateHome(userId.value);
    if (!home.value?.initialized) await router.replace({ name: "soulmate-setup" });
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

async function handleAction() {
  if (busy.value || !home.value) return;
  error.value = "";
  try {
    if (home.value.state === "story_available") {
      busy.value = true;
      const episode = await generateSoulMateEpisode(userId.value);
      await router.push({ name: "soulmate-story", params: { episodeId: episode.id } });
      return;
    }
    if (home.value.state === "story_in_progress") {
      await router.push({ name: "soulmate-story", params: { episodeId: home.value.episode_id } });
      return;
    }
    await router.push({ name: "soulmate-chat", params: { episodeId: home.value.episode_id } });
  } catch (e) {
    error.value = e?.message || t("soulmate.prepareFail");
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.soulmate-home { min-height: 100%; background: radial-gradient(circle at 50% 15%, #fff4f8 0, var(--bg) 48%); }
.home-content { padding: 24px 24px 40px; }
.center-state { min-height: 55vh; display: grid; place-content: center; justify-items: center; color: var(--text-lighter); }
.pulse-heart { color: #ff5d8f; font-size: 42px; animation: pulse 1.2s infinite; }
@keyframes pulse { 50% { transform: scale(1.15); opacity: .7; } }
.companion-card { text-align: center; padding: 14px 18px 24px; }
.relationship-line { display: flex; justify-content: center; gap: 9px; color: #d9366e; font-size: 12px; font-weight: 800; }
.relationship-line span + span::before { content: "·"; margin-right: 9px; color: var(--text-lighter); }
.avatar-halo { width: 112px; height: 112px; display: grid; place-items: center; margin: 22px auto 13px; border-radius: 50%; background: linear-gradient(145deg, #ffe1ec, #fff); box-shadow: 0 12px 35px rgba(255,93,143,.2); }
.avatar-halo span { font-size: 63px; filter: drop-shadow(0 5px 7px rgba(0,0,0,.08)); }
.companion-card h2 { margin: 0; font-size: 24px; color: var(--text); }
.greeting { min-height: 52px; margin: 15px auto 0; max-width: 330px; color: var(--text); font-size: 16px; line-height: 1.65; }
.story-action { width: 100%; min-height: 58px; display: flex; align-items: center; justify-content: center; gap: 11px; border: none; border-radius: 19px; background: linear-gradient(135deg, #ff5d8f, #f43f78); color: #fff; font: inherit; font-size: 17px; font-weight: 800; box-shadow: 0 9px 22px rgba(244,63,120,.24); cursor: pointer; }
.story-action:disabled { opacity: .68; cursor: wait; }
.action-icon { width: 26px; height: 26px; display: flex; }
.action-icon :deep(svg) { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.story-promise { display: flex; align-items: flex-start; gap: 8px; margin: 22px 8px 0; color: var(--text-lighter); font-size: 13px; line-height: 1.5; }
.story-promise p { margin: 0; }
.story-promise span { color: #ff5d8f; }
.error-text { margin: 13px 0 0; text-align: center; color: var(--red); font-size: 13px; }
</style>
