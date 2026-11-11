<template>
  <section class="teaching-page">
    <header class="teaching-header">
      <RouterLink class="teaching-back" :to="{ name: 'learn' }" :aria-label="t('app.back')">
        <ClassroomIcon name="back" />
      </RouterLink>
      <h1>{{ t("teaching.title") }}</h1>
    </header>

    <form class="teaching-form" @submit.prevent="submit">
      <label for="teaching-goal">{{ t("teaching.goal") }}</label>
      <textarea
        id="teaching-goal"
        v-model="goal"
        :placeholder="t('teaching.placeholder')"
        :disabled="generating"
        maxlength="16000"
        rows="10"
        required
      ></textarea>
      <p v-if="error" class="teaching-error" role="alert">
        {{ t("classroom.prepareFailed") }} · {{ error }}
      </p>
      <button v-if="!generating" type="submit" :disabled="!goal.trim()">
        {{ t("teaching.generate") }}
      </button>
      <PlanGenerationStatus v-if="generating" :stage="generationStage" :token-count="tokenCount" />
      <RouterLink
        v-if="latest && !generating"
        class="teaching-resume"
        :to="{ name: 'learn-teaching-classroom', params: { topicId: latest.version } }"
        >{{ t("teaching.openCourse", { title: latest.title }) }}</RouterLink
      >
    </form>
  </section>
</template>

<script setup>
import { onBeforeUnmount, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { getLocale, useI18n } from "@/shared/i18n";
import { generateTopicTeachingPlan } from "@/shared/api.js";
import ClassroomIcon from "@/modules/reading/classroom/ClassroomIcon.vue";
import PlanGenerationStatus from "@/modules/reading/classroom/PlanGenerationStatus.vue";
import { getTopicClassroom, storeTopicClassroom } from "./topicClassroom.js";

const { t } = useI18n();
const router = useRouter();
const latest = ref(getTopicClassroom()?.plan);
const goal = ref(latest.value?.learning_goal || "");
const generating = ref(false);
const generationStage = ref("preparing");
const tokenCount = ref(null);
const error = ref("");
let active = true;
onBeforeUnmount(() => {
  active = false;
});

async function submit() {
  const text = goal.value.trim();
  if (!text || generating.value) return;
  generating.value = true;
  generationStage.value = "preparing";
  tokenCount.value = null;
  error.value = "";
  try {
    const plan = await generateTopicTeachingPlan(text, getLocale(), (stage, count) => {
      if (!active) return;
      generationStage.value = stage;
      if (count) tokenCount.value = count;
    });
    if (!active) return;
    generationStage.value = "saving";
    storeTopicClassroom({ plan, session: null });
    latest.value = plan;
    await router.push({ name: "learn-teaching-classroom", params: { topicId: plan.version } });
  } catch (cause) {
    if (active) error.value = String(cause?.message || cause);
  } finally {
    generating.value = false;
  }
}
</script>

<style scoped>
.teaching-page {
  min-height: 100%;
  background: var(--bg);
}

.teaching-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--white);
}

.teaching-header h1 {
  margin: 0;
  font-size: 22px;
}

.teaching-back {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  color: var(--text);
  border-radius: var(--radius-md);
}

.teaching-back svg {
  width: 22px;
  height: 22px;
}

.teaching-form {
  display: grid;
  gap: 12px;
  max-width: 680px;
  margin: 0 auto;
  padding: 24px 20px;
}

.teaching-form label {
  font-weight: 700;
}

.teaching-form textarea {
  width: 100%;
  min-height: 240px;
  box-sizing: border-box;
  resize: vertical;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--white);
  color: var(--text);
  font: inherit;
  font-size: 16px;
  line-height: 1.55;
}

.teaching-form button {
  min-height: 48px;
  border: 0;
  border-radius: var(--radius-md);
  background: var(--green);
  color: var(--white);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.teaching-form button:disabled {
  opacity: 0.55;
  cursor: default;
}

.teaching-resume {
  justify-self: center;
  padding: 8px;
  color: var(--text);
  text-align: center;
  overflow-wrap: anywhere;
}

.teaching-error {
  margin: 0;
  color: var(--red, #b42318);
  overflow-wrap: anywhere;
}
</style>
