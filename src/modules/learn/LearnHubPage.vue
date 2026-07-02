<template>
  <div class="learn-hub">
    <header class="page-header">
      <h1 class="page-title">{{ t("learn.title") }}</h1>
    </header>

    <button
      v-if="dailyGoal"
      type="button"
      class="daily-goal-card"
      :class="{ 'is-complete': dailyGoal.goal_met }"
      @click="goToPath"
    >
      <div class="goal-ring" aria-hidden="true">
        <svg viewBox="0 0 44 44" class="goal-ring-svg">
          <circle class="goal-ring-track" cx="22" cy="22" r="18" />
          <circle
            class="goal-ring-fill"
            cx="22"
            cy="22"
            r="18"
            :style="{ strokeDashoffset: ringOffset }"
          />
        </svg>
        <span class="goal-ring-label">
          {{ dailyGoal.goal_met ? "✓" : t("learn.dailyGoalProgress", {
            done: dailyGoal.lessons_today,
            total: dailyGoal.target_lessons,
          }) }}
        </span>
      </div>
      <div class="goal-copy">
        <div class="goal-title-row">
          <span class="goal-title">{{ t("learn.dailyGoal") }}</span>
          <span v-if="dailyGoal.streak_current > 0" class="goal-streak">
            🔥 {{ t("learn.streakDays", { n: dailyGoal.streak_current }) }}
          </span>
        </div>
        <p class="goal-sub">
          {{
            dailyGoal.goal_met
              ? t("learn.dailyGoalMet")
              : dailyGoal.lessons_today > 0
                ? t("learn.dailyGoalLessons", { n: dailyGoal.target_lessons })
                : t("learn.dailyGoalStart")
          }}
        </p>
      </div>
      <span class="goal-chevron" aria-hidden="true">›</span>
    </button>

    <div class="module-grid">
      <button
        v-for="mod in modules"
        :key="mod.id"
        class="module-tile"
        :disabled="opening === mod.id"
        @click="openModule(mod)"
      >
        <span class="module-icon">{{ mod.icon }}</span>
        <span class="module-label">{{ t(mod.labelKey) }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import { getCurrentUser, getDailyGoalProgress } from "@/shared/api.js";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { openAiContact } from "@/modules/ai-chat/openAiContact.js";

const router = useRouter();
const { t } = useI18n();
const targetLangStore = useTargetLangStore();
const opening = ref(null);
const dailyGoal = ref(null);

const RING_CIRCUMFERENCE = 2 * Math.PI * 18;

const ringOffset = computed(() => {
  if (!dailyGoal.value) return RING_CIRCUMFERENCE;
  const pct = dailyGoal.value.progress_pct / 100;
  return RING_CIRCUMFERENCE * (1 - pct);
});

const modules = [
  { id: "path", labelKey: "learn.path", icon: "🛤️", route: { name: "path" } },
  { id: "news", labelKey: "learn.news", icon: "📰", route: { name: "news" } },
  { id: "translator", labelKey: "chat.translator", icon: "🌐", action: "translator" },
];

async function loadDailyGoal() {
  try {
    const [user, lang] = await Promise.all([
      getCurrentUser(),
      targetLangStore.code ? Promise.resolve(targetLangStore.code) : targetLangStore.load(),
    ]);
    dailyGoal.value = await getDailyGoalProgress(user.id, lang);
  } catch {
    dailyGoal.value = null;
  }
}

function goToPath() {
  router.push({ name: "path" });
}

async function openModule(mod) {
  if (mod.route) {
    router.push(mod.route);
    return;
  }
  if (mod.action === "translator") {
    opening.value = mod.id;
    try {
      const lang = targetLangStore.code || (await targetLangStore.load());
      await openAiContact(
        router,
        { name: t("chat.translator"), contactType: "translator" },
        { routeName: "learn-translator", targetLang: lang },
      );
    } finally {
      opening.value = null;
    }
  }
}

onMounted(loadDailyGoal);
</script>

<style scoped>
.learn-hub {
  min-height: 100%;
  background: var(--bg);
}

.page-header {
  padding: 16px 20px 12px;
  background: var(--white);
}

.page-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.daily-goal-card {
  display: flex;
  align-items: center;
  gap: 14px;
  width: calc(100% - 32px);
  margin: 12px 16px 0;
  padding: 14px 16px;
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background var(--transition), box-shadow var(--transition);
}

.daily-goal-card:hover {
  background: var(--green-bg);
}

.daily-goal-card.is-complete {
  border-color: var(--green);
  background: var(--green-bg);
}

.goal-ring {
  position: relative;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
}

.goal-ring-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.goal-ring-track {
  fill: none;
  stroke: var(--border);
  stroke-width: 4;
}

.goal-ring-fill {
  fill: none;
  stroke: var(--green);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 113.1;
  transition: stroke-dashoffset 0.4s ease;
}

.is-complete .goal-ring-fill {
  stroke: var(--green-hover);
}

.goal-ring-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--text);
}

.is-complete .goal-ring-label {
  font-size: 18px;
  color: var(--green-hover);
}

.goal-copy {
  flex: 1;
  min-width: 0;
}

.goal-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.goal-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
}

.goal-streak {
  font-size: 12px;
  font-weight: 600;
  color: #e65a00;
  background: #fff4e6;
  padding: 2px 8px;
  border-radius: 999px;
}

.goal-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-light);
  line-height: 1.35;
}

.goal-chevron {
  font-size: 22px;
  color: var(--text-light);
  flex-shrink: 0;
}

.module-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6vw;
  padding: 10vw 8vw 14vw;
  box-sizing: border-box;
}

.module-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6em;
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  transition: background var(--transition), box-shadow var(--transition);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.module-tile:hover:not(:disabled) {
  background: var(--green-bg);
}

.module-tile:disabled {
  opacity: 0.6;
  cursor: wait;
}

.module-icon {
  font-size: 12vw;
  line-height: 1;
}

.module-label {
  font-size: clamp(14px, 5vw, 18px);
  font-weight: 600;
  color: var(--text);
  text-align: center;
  line-height: 1.2;
}
</style>