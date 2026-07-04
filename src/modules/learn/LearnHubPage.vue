<template>
  <div class="learn-hub">
    <header class="desk-header">
      <div>
        <p class="eyebrow">今日学习桌</p>
        <h1 class="page-title">下一步已经摆好</h1>
      </div>
      <span class="cefr-pill">{{ cefr }}</span>
    </header>

    <section class="next-panel">
      <p class="panel-kicker">建议</p>
      <h2>{{ suggestion.title }}</h2>
      <p>{{ suggestion.detail }}</p>
      <button type="button" class="primary-action" @click="openRoute(suggestion.route)">
        {{ suggestion.actionLabel }}
      </button>
    </section>

    <section class="pace-band" aria-label="学习节奏">
      <button
        v-for="option in paceOptions"
        :key="option.id"
        type="button"
        class="pace-option"
        :class="{ active: pace === option.id }"
        @click="setPace(option.id)"
      >
        {{ option.label }}
      </button>
    </section>

    <section class="entry-list" aria-label="今日入口">
      <button
        v-for="entry in entries"
        :key="entry.id"
        type="button"
        class="entry-row"
        :class="{ primary: entry.primary }"
        :disabled="opening === entry.id"
        @click="openEntry(entry)"
      >
        <span class="entry-mark">{{ entryMark(entry.id) }}</span>
        <span class="entry-copy">
          <span class="entry-title">{{ entry.title }}</span>
          <span class="entry-desc">{{ entry.desc }}</span>
        </span>
        <span class="entry-arrow">›</span>
      </button>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { getLearningProfile, getSetting, saveSetting } from "@/shared/api.js";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { openAiContact } from "@/modules/ai-chat/openAiContact.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import {
  buildNextSuggestion,
  dailyEntries,
  loadStudyPace,
  PACE_OPTIONS,
  saveStudyPace,
} from "./learnDesk.js";

const router = useRouter();
const targetLangStore = useTargetLangStore();
const opening = ref(null);
const pace = ref("normal");
const profile = ref(null);
const cefr = ref("A1");
const context = ref(null);
const paceOptions = PACE_OPTIONS;

const suggestion = computed(() =>
  buildNextSuggestion({
    profile: profile.value,
    pace: pace.value,
    hasRecentLesson: true,
  }),
);
const entries = computed(() => dailyEntries({ pace: pace.value }));

function entryMark(id) {
  return {
    path: "P",
    review: "R",
    assessment: "A",
    amiga: "?",
    reading: "N",
  }[id] || ">";
}

function openRoute(route) {
  if (route) router.push(route);
}

async function setPace(value) {
  pace.value = await saveStudyPace(value, { saveSetting });
}

async function openEntry(entry) {
  if (entry.route) {
    router.push(entry.route);
    return;
  }
  if (entry.action === "translator") {
    opening.value = entry.id;
    try {
      const targetLang =
        context.value?.targetLang || targetLangStore.code || (await targetLangStore.load());
      await openAiContact(
        router,
        { name: "问 Amiga", contactType: "translator" },
        { routeName: "learn-translator", targetLang },
      );
    } finally {
      opening.value = null;
    }
  }
}

async function load() {
  pace.value = await loadStudyPace({ getSetting });
  try {
    context.value = await loadLearningContext({ targetLangStore });
    cefr.value = context.value.cefr;
    if (context.value.user?.id) {
      profile.value = await getLearningProfile(context.value.user.id, context.value.targetLang);
      cefr.value = profile.value?.cefr_level || cefr.value;
    }
  } catch {
    profile.value = null;
  }
}

onMounted(load);
</script>

<style scoped>
.learn-hub {
  min-height: 100%;
  padding: 18px 16px 28px;
  background: var(--bg);
}

.desk-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.eyebrow {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 800;
  color: var(--green-hover);
}

.page-title {
  margin: 0;
  font-size: 24px;
  line-height: 1.15;
  font-weight: 800;
}

.cefr-pill {
  flex: 0 0 auto;
  min-width: 48px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--green-bg);
  color: var(--green-hover);
  font-weight: 800;
  text-align: center;
}

.next-panel {
  padding: 18px;
  border-radius: var(--radius-md);
  background: var(--white);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
}

.panel-kicker {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-light);
}

.next-panel h2 {
  margin: 0;
  font-size: 20px;
  line-height: 1.25;
}

.next-panel p:last-of-type {
  margin: 8px 0 16px;
  color: var(--text-light);
  line-height: 1.45;
}

.primary-action {
  width: 100%;
  min-height: 46px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--green);
  color: var(--white);
  font: inherit;
  font-weight: 800;
  box-shadow: 0 4px 0 var(--green-hover);
}

.pace-band {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 14px 0;
}

.pace-option {
  min-height: 40px;
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--white);
  color: var(--text-light);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
}

.pace-option.active {
  border-color: var(--blue);
  background: var(--blue-bg);
  color: var(--blue-hover);
}

.entry-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.entry-row {
  display: grid;
  grid-template-columns: 42px 1fr auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 72px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--white);
  text-align: left;
  font: inherit;
  box-shadow: var(--shadow);
}

.entry-row.primary {
  border-color: rgba(88, 204, 2, 0.45);
}

.entry-row:disabled {
  opacity: 0.65;
}

.entry-mark {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: var(--radius-sm);
  background: var(--gray-light);
  color: var(--text);
  font-weight: 900;
}

.entry-row.primary .entry-mark {
  background: var(--green-bg);
  color: var(--green-hover);
}

.entry-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.entry-title {
  font-size: 16px;
  font-weight: 800;
  color: var(--text);
}

.entry-desc {
  font-size: 13px;
  color: var(--text-light);
  line-height: 1.3;
}

.entry-arrow {
  color: var(--text-lighter);
  font-size: 24px;
}
</style>
