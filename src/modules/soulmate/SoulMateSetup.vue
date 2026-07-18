<template>
  <div class="setup-page">
    <PageHeader :title="t('soulmate.setupTitle')" />

    <main class="setup-content">
      <div class="step-meta">
        <span>{{ t("soulmate.setupStep", { step }) }}</span>
        <div class="step-track"><div class="step-fill" :style="{ width: `${step * 33.34}%` }" /></div>
      </div>

      <section v-if="step === 1" class="setup-step">
        <h2>{{ t("soulmate.chooseType") }}</h2>
        <button
          v-for="option in typeOptions"
          :key="option.value"
          type="button"
          class="choice-card"
          :class="{ selected: form.companion_type === option.value }"
          @click="form.companion_type = option.value"
        >
          <span class="choice-icon">{{ option.icon }}</span>
          <span class="choice-copy">
            <strong>{{ t(option.title) }}</strong>
            <small>{{ t(option.subtitle) }}</small>
          </span>
          <span class="choice-check">✓</span>
        </button>
      </section>

      <section v-else-if="step === 2" class="setup-step">
        <h2>{{ t("soulmate.chooseIdentity") }}</h2>
        <div class="pill-row">
          <button
            v-for="option in genderOptions"
            :key="option.value"
            type="button"
            class="pill"
            :class="{ selected: form.companion_gender === option.value }"
            @click="selectGender(option.value)"
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

      <section v-else class="setup-step flavor-step">
        <h2>{{ t("soulmate.tuneStory") }}</h2>
        <label v-for="slider in sliders" :key="slider.key" class="slider-row">
          <span>{{ t(slider.label) }}</span>
          <input v-model.number="form[slider.key]" type="range" min="0" max="3" step="1" />
          <strong>{{ form[slider.key] }}</strong>
        </label>
        <div class="preview-card">
          <span class="preview-avatar">{{ avatar }}</span>
          <div>
            <strong>{{ form.companion_name }}</strong>
            <p>{{ form.story_location }} · {{ context.cefr }}</p>
          </div>
        </div>
      </section>

      <p v-if="error" class="error-text">{{ error }}</p>
    </main>

    <footer class="setup-actions">
      <button v-if="step > 1" type="button" class="secondary-btn" :disabled="saving" @click="step--">
        {{ t("soulmate.previous") }}
      </button>
      <button v-if="step < 3" type="button" class="primary-btn" @click="step++">
        {{ t("soulmate.next") }}
      </button>
      <button v-else type="button" class="primary-btn" :disabled="saving || !canStart" @click="submit">
        {{ saving ? t("soulmate.initializing") : t("soulmate.start") }}
      </button>
    </footer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import PageHeader from "@/shared/components/PageHeader.vue";
import { useI18n } from "@/shared/i18n";
import { loadLearningContext } from "@/shared/learningContext.js";
import { initializeSoulMate } from "@/shared/backend/soulmate.js";

const router = useRouter();
const { t } = useI18n();
const step = ref(1);
const saving = ref(false);
const error = ref("");
const context = reactive({ user: null, targetLang: "es", nativeLang: "zh", cefr: "A1" });
const form = reactive({
  companion_type: "soul",
  companion_name: "Sofía",
  companion_gender: "female",
  personality: "warm",
  story_location: "Madrid",
  intensity: 2,
  romance_tension: 1,
  surprise: 2,
  knowledge: 2,
});

/** Defaults that match the learning target language so LLM output is less biased. */
function defaultsForLang(lang, gender = "female") {
  const byLang = {
    zh: {
      female: { name: "小雨", location: "上海" },
      male: { name: "阿辰", location: "北京" },
      neutral: { name: "阿哲", location: "成都" },
    },
    en: {
      female: { name: "Emma", location: "London" },
      male: { name: "James", location: "New York" },
      neutral: { name: "Alex", location: "Toronto" },
    },
    es: {
      female: { name: "Sofía", location: "Madrid" },
      male: { name: "Mateo", location: "Barcelona" },
      neutral: { name: "Alex", location: "Valencia" },
    },
  };
  const pack = byLang[lang] || byLang.es;
  return pack[gender] || pack.female;
}

const stockNames = new Set([
  "Sofía", "Mateo", "Alex", "Emma", "James", "小雨", "阿辰", "阿哲",
]);
const stockLocations = new Set([
  "Madrid", "Barcelona", "Valencia", "London", "New York", "Toronto", "上海", "北京", "成都",
]);

const typeOptions = [
  { value: "soul", icon: "💞", title: "soulmate.typeSoul", subtitle: "soulmate.typeSoulSub" },
  { value: "comfort", icon: "☕", title: "soulmate.typeComfort", subtitle: "soulmate.typeComfortSub" },
  { value: "explore", icon: "🧭", title: "soulmate.typeExplore", subtitle: "soulmate.typeExploreSub" },
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

const avatar = computed(() => ({ female: "👩", male: "👨", neutral: "✨" })[form.companion_gender]);
const canStart = computed(() => Boolean(context.user?.id && form.companion_name && form.story_location));

function selectGender(gender) {
  form.companion_gender = gender;
  if (stockNames.has(form.companion_name)) {
    form.companion_name = defaultsForLang(context.targetLang, gender).name;
  }
}

function applyLanguageDefaults(lang) {
  const d = defaultsForLang(lang, form.companion_gender);
  if (stockNames.has(form.companion_name)) form.companion_name = d.name;
  if (stockLocations.has(form.story_location)) form.story_location = d.location;
}

onMounted(async () => {
  try {
    Object.assign(context, await loadLearningContext({ fallbackToFirstGoal: true }));
    applyLanguageDefaults(context.targetLang || "es");
  } catch (e) {
    error.value = e?.message || t("soulmate.setupFail");
  }
});

async function submit() {
  if (!canStart.value || saving.value) return;
  saving.value = true;
  error.value = "";
  try {
    await initializeSoulMate({
      user_id: context.user.id,
      companion_type: form.companion_type,
      companion_name: form.companion_name,
      companion_gender: form.companion_gender,
      personality: form.personality,
      story_location: form.story_location,
      intensity: form.intensity,
      romance_tension: form.romance_tension,
      surprise: form.surprise,
      knowledge: form.knowledge,
      target_lang: context.targetLang,
      native_lang: context.nativeLang,
      cefr_level: context.cefr,
    });
    await router.replace({ name: "soulmate" });
  } catch (e) {
    error.value = e?.message || String(e) || t("soulmate.setupFail");
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.setup-page { min-height: 100%; display: flex; flex-direction: column; background: var(--bg); }
.setup-content { flex: 1; padding: 18px 20px 24px; }
.step-meta { color: var(--text-lighter); font-size: 12px; font-weight: 700; }
.step-track { height: 5px; margin-top: 8px; border-radius: 99px; overflow: hidden; background: var(--border); }
.step-fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #ff5d8f, var(--green)); transition: width .2s; }
.setup-step h2 { margin: 28px 0 18px; font-size: 23px; color: var(--text); }
.choice-card { width: 100%; display: flex; align-items: center; gap: 14px; margin-bottom: 12px; padding: 16px; border: 2px solid var(--border); border-radius: 18px; background: var(--surface); color: var(--text); text-align: left; font-family: inherit; cursor: pointer; }
.choice-card.selected { border-color: #ff5d8f; background: #fff3f7; }
.choice-icon { font-size: 28px; }
.choice-copy { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.choice-copy strong { font-size: 17px; }
.choice-copy small { color: var(--text-lighter); font-size: 13px; }
.choice-check { color: #ff5d8f; font-weight: 800; opacity: 0; }
.choice-card.selected .choice-check { opacity: 1; }
.pill-row { display: flex; flex-wrap: wrap; gap: 9px; margin-bottom: 18px; }
.pill { padding: 10px 16px; border: 1.5px solid var(--border); border-radius: 99px; background: var(--surface); color: var(--text); font-family: inherit; cursor: pointer; }
.pill.selected { border-color: #ff5d8f; background: #fff3f7; color: #d9366e; font-weight: 700; }
.field-label { display: flex; flex-direction: column; gap: 7px; margin: 16px 0; color: var(--text-light); font-size: 13px; font-weight: 600; }
.field-label input { border: 1.5px solid var(--border); border-radius: 13px; background: var(--surface); color: var(--text); padding: 12px 14px; font: inherit; outline: none; }
.field-label input:focus { border-color: #ff5d8f; }
.field-title { display: block; margin: 18px 0 9px; color: var(--text-light); font-size: 13px; font-weight: 600; }
.slider-row { display: grid; grid-template-columns: 64px 1fr 22px; align-items: center; gap: 10px; margin: 21px 0; color: var(--text); }
.slider-row input { accent-color: #ff5d8f; }
.slider-row strong { color: #d9366e; }
.preview-card { display: flex; align-items: center; gap: 12px; margin-top: 28px; padding: 15px; border-radius: 18px; background: var(--surface); box-shadow: 0 4px 16px rgba(0,0,0,.05); }
.preview-avatar { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; background: #fff3f7; font-size: 28px; }
.preview-card p { margin: 3px 0 0; color: var(--text-lighter); font-size: 13px; }
.setup-actions { display: flex; gap: 10px; padding: 12px 20px calc(16px + var(--safe-bottom)); background: var(--surface); border-top: 1px solid var(--border); }
.primary-btn, .secondary-btn { min-height: 48px; border: none; border-radius: 15px; padding: 0 18px; font: inherit; font-weight: 800; cursor: pointer; }
.primary-btn { flex: 1; background: #ff5d8f; color: white; }
.secondary-btn { background: var(--surface-variant); color: var(--text); }
.primary-btn:disabled { opacity: .55; cursor: wait; }
.error-text { margin: 12px 0 0; color: var(--red); font-size: 13px; }
</style>
