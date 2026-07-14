<template>
  <div class="settings-page">
    <PageHeader :title="t('soulmate.settingsTitle')" />

    <div v-if="loading" class="state-block">{{ t("app.loading") }}</div>
    <div v-else-if="loadError" class="state-block error">{{ loadError }}</div>

    <form v-else class="settings-form" @submit.prevent="save">
      <section class="settings-section">
        <h2>{{ t("soulmate.chooseType") }}</h2>
        <div class="choice-grid">
          <button
            v-for="option in typeOptions"
            :key="option.value"
            type="button"
            class="choice-card"
            :class="{ selected: form.companion_type === option.value }"
            @click="form.companion_type = option.value"
          >
            <span>{{ option.icon }}</span>
            <strong>{{ t(option.title) }}</strong>
          </button>
        </div>
      </section>

      <section class="settings-section">
        <h2>{{ t("soulmate.identitySettings") }}</h2>
        <div class="pill-row">
          <button
            v-for="option in genderOptions"
            :key="option.value"
            type="button"
            class="pill"
            :class="{ selected: form.companion_gender === option.value }"
            @click="form.companion_gender = option.value"
          >{{ t(option.label) }}</button>
        </div>

        <label class="field-label">
          <span>{{ t("soulmate.name") }}</span>
          <input v-model.trim="form.companion_name" maxlength="24" />
        </label>

        <span class="field-title">{{ t("soulmate.personality") }}</span>
        <div class="pill-row">
          <button
            v-for="option in personalityOptions"
            :key="option.value"
            type="button"
            class="pill"
            :class="{ selected: form.personality === option.value }"
            @click="form.personality = option.value"
          >{{ t(option.label) }}</button>
        </div>

        <label class="field-label">
          <span>{{ t("soulmate.location") }}</span>
          <input v-model.trim="form.story_location" maxlength="40" />
        </label>
      </section>

      <section class="settings-section">
        <h2>{{ t("soulmate.storySettings") }}</h2>
        <label v-for="slider in sliders" :key="slider.key" class="slider-row">
          <span>{{ t(slider.label) }}</span>
          <input v-model.number="form[slider.key]" type="range" min="0" max="3" step="1" />
          <strong>{{ form[slider.key] }}</strong>
        </label>
      </section>

      <p v-if="status" class="status-text" :class="{ error: statusError }">{{ status }}</p>
      <button class="save-btn" type="submit" :disabled="saving || !canSave">
        {{ saving ? t("soulmate.savingSettings") : t("soulmate.saveSettings") }}
      </button>

      <section class="danger-section">
        <h2>{{ t("soulmate.reset") }}</h2>
        <p>{{ t("soulmate.resetSub") }}</p>
        <button class="reset-btn" type="button" @click="showReset = true">
          {{ t("soulmate.resetConfirm") }}
        </button>
      </section>
    </form>

    <ConfirmDialog
      :show="showReset"
      :title="t('soulmate.resetTitle')"
      :message="t('soulmate.resetMessage')"
      :confirm-text="t('soulmate.resetConfirm')"
      :confirm-disabled="resetting"
      danger
      @confirm="reset"
      @cancel="showReset = false"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import ConfirmDialog from "@/shared/components/ConfirmDialog.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { useI18n } from "@/shared/i18n";
import { loadLearningContext } from "@/shared/learningContext.js";
import {
  getSoulMateWorld,
  resetSoulMate,
  updateSoulMate,
} from "@/shared/backend/soulmate.js";

const router = useRouter();
const { t } = useI18n();
const loading = ref(true);
const loadError = ref("");
const saving = ref(false);
const resetting = ref(false);
const showReset = ref(false);
const status = ref("");
const statusError = ref(false);
const context = reactive({ user: null, targetLang: "es", nativeLang: "zh", cefr: "A1" });
const form = reactive({
  companion_type: "soul",
  companion_name: "",
  companion_gender: "female",
  personality: "warm",
  story_location: "",
  intensity: 2,
  romance_tension: 1,
  surprise: 2,
  knowledge: 2,
});

const typeOptions = [
  { value: "soul", icon: "💞", title: "soulmate.typeSoul" },
  { value: "comfort", icon: "☕", title: "soulmate.typeComfort" },
  { value: "explore", icon: "🧭", title: "soulmate.typeExplore" },
];
const genderOptions = [
  { value: "female", label: "soulmate.genderFemale" },
  { value: "male", label: "soulmate.genderMale" },
  { value: "neutral", label: "soulmate.genderNeutral" },
];
const personalityOptions = [
  { value: "warm", label: "soulmate.personalityWarm" },
  { value: "funny", label: "soulmate.personalityFunny" },
  { value: "curious", label: "soulmate.personalityCurious" },
];
const sliders = [
  { key: "intensity", label: "soulmate.intensity" },
  { key: "romance_tension", label: "soulmate.romance" },
  { key: "surprise", label: "soulmate.surprise" },
  { key: "knowledge", label: "soulmate.knowledge" },
];
const canSave = computed(() => Boolean(form.companion_name && form.story_location));

onMounted(async () => {
  try {
    Object.assign(context, await loadLearningContext({ fallbackToFirstGoal: true }));
    const world = await getSoulMateWorld(context.user?.id || "");
    if (!world) {
      await router.replace({ name: "soulmate-setup" });
      return;
    }
    for (const key of Object.keys(form)) form[key] = world[key];
  } catch (e) {
    loadError.value = e?.message || t("soulmate.settingsLoadFail");
  } finally {
    loading.value = false;
  }
});

function request() {
  return {
    user_id: context.user.id,
    ...form,
    target_lang: context.targetLang,
    native_lang: context.nativeLang,
    cefr_level: context.cefr,
  };
}

async function save() {
  if (!canSave.value || saving.value) return;
  saving.value = true;
  status.value = "";
  statusError.value = false;
  try {
    await updateSoulMate(request());
    status.value = t("soulmate.settingsSaved");
  } catch (e) {
    status.value = e?.message || t("soulmate.settingsSaveFail");
    statusError.value = true;
  } finally {
    saving.value = false;
  }
}

async function reset() {
  if (resetting.value || !context.user?.id) return;
  resetting.value = true;
  try {
    await resetSoulMate(context.user.id);
    showReset.value = false;
    await router.replace({ name: "soulmate-setup" });
  } catch (e) {
    status.value = e?.message || t("soulmate.resetFail");
    statusError.value = true;
    showReset.value = false;
  } finally {
    resetting.value = false;
  }
}
</script>

<style scoped>
.settings-page { min-height: 100%; background: var(--bg); padding-bottom: 24px; }
.settings-form { max-width: 620px; margin: 0 auto; padding: 16px; }
.settings-section, .danger-section { margin-bottom: 16px; padding: 18px; border-radius: 18px; background: var(--surface); box-shadow: 0 3px 14px rgba(0,0,0,.04); }
.settings-section h2, .danger-section h2 { margin: 0 0 15px; color: var(--text); font-size: 17px; }
.choice-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.choice-card { min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 6px; border: 1.5px solid var(--border); border-radius: 14px; background: var(--surface); color: var(--text); font: inherit; cursor: pointer; }
.choice-card span { font-size: 23px; }
.choice-card strong { font-size: 13px; }
.choice-card.selected, .pill.selected { border-color: #ff5d8f; background: #fff3f7; color: #d9366e; }
.pill-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 15px; }
.pill { padding: 9px 14px; border: 1.5px solid var(--border); border-radius: 99px; background: var(--surface); color: var(--text); font: inherit; cursor: pointer; }
.field-label { display: flex; flex-direction: column; gap: 7px; margin: 14px 0; color: var(--text-light); font-size: 13px; font-weight: 600; }
.field-label input { border: 1.5px solid var(--border); border-radius: 12px; background: var(--bg); color: var(--text); padding: 11px 13px; font: inherit; outline: none; }
.field-label input:focus { border-color: #ff5d8f; }
.field-title { display: block; margin-bottom: 8px; color: var(--text-light); font-size: 13px; font-weight: 600; }
.slider-row { display: grid; grid-template-columns: 64px 1fr 22px; align-items: center; gap: 10px; margin: 17px 0; color: var(--text); }
.slider-row input { accent-color: #ff5d8f; }
.slider-row strong { color: #d9366e; }
.save-btn { width: 100%; min-height: 50px; margin-bottom: 18px; border: none; border-radius: 15px; background: #ff5d8f; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
.save-btn:disabled { opacity: .55; cursor: default; }
.status-text { margin: 0 0 12px; color: var(--green); text-align: center; font-size: 13px; }
.status-text.error, .state-block.error { color: var(--red); }
.danger-section { border: 1px solid var(--red-bg); }
.danger-section h2 { color: var(--red); }
.danger-section p { margin: -7px 0 14px; color: var(--text-lighter); font-size: 13px; line-height: 1.45; }
.reset-btn { width: 100%; min-height: 44px; border: 1.5px solid var(--red); border-radius: 13px; background: transparent; color: var(--red); font: inherit; font-weight: 700; cursor: pointer; }
.state-block { min-height: 55vh; display: grid; place-content: center; padding: 24px; color: var(--text-lighter); text-align: center; }
</style>
