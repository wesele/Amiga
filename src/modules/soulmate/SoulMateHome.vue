<template>
  <div class="soulmate-home" :class="[genderClass, { 'tv-content-pane tv-content-pane--fixed tv-home': isTvLayoutMode }]">
    <div v-if="portraitSrc" class="portrait-stage" aria-hidden="true">
      <img
        ref="portraitEl"
        class="portrait-image"
        :class="{ ready: portraitReady }"
        :src="portraitSrc"
        :alt="home?.world?.companion_name || t('soulmate.title')"
        @load="onPortraitLoad"
        @error="onPortraitLoad"
      />
      <div class="portrait-fade" :class="{ ready: portraitReady }" />
    </div>

    <PageHeader :title="t('soulmate.title')" class="home-header" />

    <div v-if="loading" class="center-state">
      <span class="pulse-heart">♥</span>
      <p>{{ t("soulmate.loadingGreeting") }}</p>
    </div>

    <main v-else-if="home?.world" class="home-content" :class="{ ready: portraitReady || !portraitSrc }">
      <section class="companion-meta">
        <div class="relationship-line">
          <span>{{ stageLabel }}</span>
          <span v-if="home.day_number">{{ t("soulmate.day", { day: home.day_number }) }}</span>
        </div>
        <h2>{{ home.world.companion_name }}</h2>
        <p class="greeting">{{ home.greeting }}</p>
      </section>

      <button
        ref="actionBtn"
        class="story-action"
        type="button"
        :disabled="busy"
        @click="handleAction"
      >
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
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import PageHeader from "@/shared/components/PageHeader.vue";
import { isTvLayoutMode } from "@/shared/appMode.js";
import { useI18n } from "@/shared/i18n";
import { loadLearningContext } from "@/shared/learningContext.js";
import { generateSoulMateEpisode, getSoulMateHome } from "@/shared/backend/soulmate.js";

const BACKGROUND_BY_GENDER = {
  female: "/soulmate/companion-female.jpg",
  male: "/soulmate/companion-male.jpg",
  neutral: "/soulmate/companion-neutral.jpg",
};

const router = useRouter();
const { t } = useI18n();
const loading = ref(true);
const busy = ref(false);
const error = ref("");
const home = ref(null);
const userId = ref("");
const targetLang = ref("es");
/** Only set after home is loaded — never default to another gender first. */
const portraitSrc = ref("");
const portraitReady = ref(false);
const portraitEl = ref(null);
const actionBtn = ref(null);

const companionGender = computed(() => {
  const gender = home.value?.world?.companion_gender;
  return BACKGROUND_BY_GENDER[gender] ? gender : "";
});
const genderClass = computed(() =>
  companionGender.value ? `gender-${companionGender.value}` : "gender-pending",
);
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

async function syncPortraitFromHome() {
  const gender = home.value?.world?.companion_gender;
  const next = BACKGROUND_BY_GENDER[gender] || "";
  if (next === portraitSrc.value) {
    if (next) portraitReady.value = true;
    return;
  }
  portraitReady.value = false;
  portraitSrc.value = next;
  if (!next) return;
  await nextTick();
  // Cached images may already be complete without firing load.
  const el = portraitEl.value;
  if (el?.complete && el.naturalWidth > 0) portraitReady.value = true;
}

watch(() => home.value?.world?.companion_gender, () => {
  syncPortraitFromHome();
});

function onPortraitLoad() {
  if (portraitSrc.value) portraitReady.value = true;
}

onMounted(loadHome);

async function loadHome() {
  loading.value = true;
  error.value = "";
  portraitSrc.value = "";
  portraitReady.value = false;
  try {
    const context = await loadLearningContext({ fallbackToFirstGoal: true });
    userId.value = context.user?.id || "";
    targetLang.value = context.targetLang || "es";
    home.value = await getSoulMateHome(userId.value, targetLang.value);
    if (!home.value?.initialized) await router.replace({ name: "soulmate-setup" });
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
    // TV: land remote focus on the only primary action (letter / chat).
    if (isTvLayoutMode && home.value?.world) {
      await nextTick();
      actionBtn.value?.focus?.();
    }
  }
}

async function handleAction() {
  if (busy.value || !home.value) return;
  error.value = "";
  try {
    if (home.value.state === "story_available") {
      busy.value = true;
      const episode = await generateSoulMateEpisode(userId.value, targetLang.value);
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
.soulmate-home {
  position: relative;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff4f8;
}
.soulmate-home.gender-pending { background: #fff4f8; }
.soulmate-home.gender-female { background: #ffe8f0; }
.soulmate-home.gender-male { background: #e8f0fa; }
.soulmate-home.gender-neutral { background: #f0eaf8; }

.portrait-stage {
  position: absolute;
  inset: 0;
  z-index: 0;
}
.portrait-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 20%;
  display: block;
  opacity: 0;
  transition: opacity 0.28s ease;
}
.portrait-image.ready {
  opacity: 1;
}
/* Light edges only — never bury the figure in black */
.portrait-fade {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.28s ease;
  background:
    linear-gradient(180deg, rgba(20, 12, 24, 0.18) 0%, transparent 16%),
    linear-gradient(180deg, transparent 52%, rgba(20, 12, 24, 0.22) 78%, rgba(20, 12, 24, 0.55) 100%);
}
.portrait-fade.ready {
  opacity: 1;
}
.soulmate-home.gender-female .portrait-fade {
  background:
    linear-gradient(180deg, rgba(80, 30, 50, 0.12) 0%, transparent 16%),
    linear-gradient(180deg, transparent 52%, rgba(90, 30, 55, 0.18) 78%, rgba(70, 20, 45, 0.48) 100%);
}
.soulmate-home.gender-male .portrait-fade {
  background:
    linear-gradient(180deg, rgba(20, 35, 60, 0.14) 0%, transparent 16%),
    linear-gradient(180deg, transparent 52%, rgba(25, 40, 70, 0.18) 78%, rgba(18, 30, 55, 0.48) 100%);
}
.soulmate-home.gender-neutral .portrait-fade {
  background:
    linear-gradient(180deg, rgba(40, 30, 70, 0.12) 0%, transparent 16%),
    linear-gradient(180deg, transparent 52%, rgba(45, 30, 75, 0.18) 78%, rgba(35, 22, 60, 0.48) 100%);
}

.home-header {
  position: relative;
  z-index: 2;
}
.soulmate-home :deep(.page-header),
.soulmate-home :deep(.list-header) {
  background: transparent !important;
  border-bottom: none !important;
  color: var(--text);
}
.soulmate-home :deep(.page-header .back-btn),
.soulmate-home :deep(.page-header .header-title),
.soulmate-home :deep(.list-header .back-btn),
.soulmate-home :deep(.list-header h1),
.soulmate-home :deep(.list-header .header-title) {
  color: var(--text);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.65);
}
.soulmate-home :deep(.back-btn:hover) {
  background: rgba(255, 255, 255, 0.35);
}

.home-content,
.center-state {
  position: relative;
  z-index: 1;
}

.home-content {
  margin-top: auto;
  padding: 18px 20px calc(22px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 12px;
  opacity: 0;
  transition: opacity 0.22s ease;
  background: linear-gradient(180deg, transparent 0%, rgba(255, 255, 255, 0.55) 28%, rgba(255, 255, 255, 0.88) 100%);
}
.home-content.ready {
  opacity: 1;
}

.center-state {
  flex: 1;
  min-height: 55vh;
  display: grid;
  place-content: center;
  justify-items: center;
  color: var(--text-lighter);
}
.pulse-heart { color: #ff5d8f; font-size: 42px; animation: pulse 1.2s infinite; }
@keyframes pulse { 50% { transform: scale(1.15); opacity: .7; } }

.companion-meta {
  text-align: center;
  padding: 4px 6px 0;
}
.relationship-line {
  display: flex;
  justify-content: center;
  gap: 9px;
  color: #d9366e;
  font-size: 12px;
  font-weight: 800;
}
.relationship-line span + span::before {
  content: "·";
  margin-right: 9px;
  color: var(--text-lighter);
}
.companion-meta h2 {
  margin: 10px 0 0;
  font-size: 28px;
  letter-spacing: 0.02em;
  color: var(--text);
}
.greeting {
  min-height: 0;
  margin: 10px auto 0;
  max-width: 340px;
  color: var(--text);
  font-size: 16px;
  line-height: 1.55;
}

.story-action {
  width: 100%;
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 11px;
  border: none;
  border-radius: 19px;
  background: linear-gradient(135deg, #ff5d8f, #f43f78);
  color: #fff;
  font: inherit;
  font-size: 17px;
  font-weight: 800;
  box-shadow: 0 9px 22px rgba(244, 63, 120, 0.24);
  cursor: pointer;
}
.story-action:disabled { opacity: .68; cursor: wait; }
.story-action:focus-visible {
  outline: 3px solid #fff !important;
  outline-offset: 3px;
  box-shadow: 0 0 0 6px rgba(255, 93, 143, 0.45), 0 9px 22px rgba(244, 63, 120, 0.24) !important;
  transform: none !important;
}
.action-icon { width: 26px; height: 26px; display: flex; }
.action-icon :deep(svg) {
  width: 26px;
  height: 26px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.story-promise {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 2px;
  padding: 11px 13px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(0, 0, 0, 0.04);
  color: var(--text-lighter);
  font-size: 13px;
  line-height: 1.5;
}
.story-promise p { margin: 0; }
.story-promise span { color: #ff5d8f; }
.error-text {
  margin: 0;
  text-align: center;
  color: var(--red);
  font-size: 13px;
}

/*
 * TV 16:9: full-bleed mobile portrait buries the CTA below the fold.
 * Split: portrait left, solid control panel right (always shows 聊一聊/来信).
 */
.soulmate-home.tv-home {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
  grid-template-rows: auto 1fr;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.tv-home .home-header {
  grid-column: 1 / -1;
  grid-row: 1;
}
.tv-home .portrait-stage {
  position: relative;
  grid-column: 1;
  grid-row: 2;
  inset: auto;
  min-height: 0;
  overflow: hidden;
  border-radius: 0 0 0 12px;
}
.tv-home .portrait-image {
  object-position: center 18%;
}
.tv-home .portrait-fade {
  background:
    linear-gradient(90deg, transparent 55%, rgba(255, 248, 251, 0.35) 100%),
    linear-gradient(180deg, transparent 60%, rgba(20, 12, 24, 0.25) 100%);
}
.tv-home .home-content {
  grid-column: 2;
  grid-row: 2;
  margin-top: 0;
  min-height: 0;
  height: 100%;
  justify-content: center;
  padding: 28px 32px 32px;
  gap: 18px;
  background: rgba(255, 252, 253, 0.96);
  box-shadow: -12px 0 28px rgba(40, 20, 30, 0.08);
  overflow-y: auto;
}
.tv-home .companion-meta {
  text-align: left;
}
.tv-home .relationship-line {
  justify-content: flex-start;
  font-size: 14px;
}
.tv-home .companion-meta h2 {
  font-size: 32px;
}
.tv-home .greeting {
  margin: 12px 0 0;
  max-width: none;
  font-size: 18px;
  line-height: 1.55;
}
.tv-home .story-action {
  min-height: 60px;
  font-size: 19px;
}
.tv-home .story-promise {
  font-size: 14px;
}
.tv-home .center-state {
  grid-column: 1 / -1;
  grid-row: 2;
  min-height: 0;
}
</style>
