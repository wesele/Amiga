<template>
  <div class="settings-page" :class="{ 'tv-content-pane': isTvLayoutMode }">
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

      <section class="settings-section prompts-section">
        <h2>{{ t("soulmate.promptsTitle") }}</h2>
        <p class="section-sub">{{ t("soulmate.promptsSub") }}</p>
        <p v-if="promptsError" class="prompt-msg error">{{ promptsError }}</p>
        <p v-else-if="promptsLoading" class="prompt-msg">{{ t("app.loading") }}</p>
        <p v-else-if="promptDrafts.length === 0" class="prompt-msg">{{ t("soulmate.promptsEmpty") }}</p>
        <div v-else class="prompt-list">
          <div
            v-for="prompt in promptDrafts"
            :key="prompt.key"
            class="prompt-item"
            :class="{ open: expandedPromptKey === prompt.key }"
          >
            <button
              type="button"
              class="prompt-header"
              @click="togglePrompt(prompt.key)"
            >
              <div class="prompt-heading">
                <strong>{{ prompt.name }}</strong>
                <code>{{ prompt.key }}</code>
              </div>
              <span class="prompt-chevron">{{ expandedPromptKey === prompt.key ? "▾" : "▸" }}</span>
            </button>
            <div v-if="expandedPromptKey === prompt.key" class="prompt-body">
              <p class="prompt-preview">{{ promptPreview(prompt.system_prompt) }}</p>
              <label class="field-label">
                <span>{{ t("prompts.fields.system") }}</span>
                <textarea v-model="prompt.system_prompt" rows="8" class="prompt-textarea" />
              </label>
              <label class="field-label">
                <span>{{ t("prompts.fields.user") }}</span>
                <textarea v-model="prompt.user_prompt_template" rows="10" class="prompt-textarea code" />
              </label>
              <p class="prompt-vars">{{ t("soulmate.promptsVarsHint") }}</p>
              <p v-if="promptStatus[prompt.key]" class="prompt-msg" :class="{ error: promptStatusError[prompt.key] }">
                {{ promptStatus[prompt.key] }}
              </p>
              <div class="prompt-actions">
                <button
                  type="button"
                  class="prompt-reset-btn"
                  :disabled="promptBusyKey === prompt.key"
                  @click="askResetPrompt(prompt.key)"
                >
                  {{ t("prompts.reset") }}
                </button>
                <button
                  type="button"
                  class="prompt-save-btn"
                  :disabled="promptBusyKey === prompt.key"
                  @click="savePromptDraft(prompt)"
                >
                  {{ promptBusyKey === prompt.key ? t("soulmate.savingSettings") : t("common.save") }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

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

    <ConfirmDialog
      :show="Boolean(resetPromptKey)"
      :title="t('prompts.resetOneConfirmTitle')"
      :message="t('prompts.resetOneConfirmMsg')"
      :confirm-text="t('prompts.reset')"
      :confirm-disabled="Boolean(promptBusyKey)"
      danger
      @confirm="resetPromptDraft"
      @cancel="resetPromptKey = ''"
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
import { isTvLayoutMode } from "@/shared/appMode.js";
import {
  getAllPrompts,
  resetPrompt as apiResetPrompt,
  savePrompt as apiSavePrompt,
} from "@/shared/backend/prompts.js";
import {
  getSoulMateWorld,
  resetSoulMate,
  updateSoulMate,
} from "@/shared/backend/soulmate.js";

const SOULMATE_PROMPT_ORDER = [
  "soulmate-greeting",
  "soulmate-story",
  "soulmate-chat-opening",
  "soulmate-chat-reentry",
  "soulmate-dialogue",
  "soulmate-memory-compact",
];

const router = useRouter();
const { t } = useI18n();
const loading = ref(true);
const loadError = ref("");
const saving = ref(false);
const resetting = ref(false);
const showReset = ref(false);
const status = ref("");
const statusError = ref(false);
const promptsLoading = ref(false);
const promptsError = ref("");
const promptDrafts = ref([]);
const expandedPromptKey = ref("");
const promptBusyKey = ref("");
const resetPromptKey = ref("");
const promptStatus = reactive({});
const promptStatusError = reactive({});
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

function sortSoulMatePrompts(list) {
  return [...list]
    .filter((p) => String(p?.key || "").startsWith("soulmate-"))
    .sort((a, b) => {
      const ai = SOULMATE_PROMPT_ORDER.indexOf(a.key);
      const bi = SOULMATE_PROMPT_ORDER.indexOf(b.key);
      const av = ai === -1 ? 999 : ai;
      const bv = bi === -1 ? 999 : bi;
      if (av !== bv) return av - bv;
      return String(a.key).localeCompare(String(b.key));
    })
    .map((p) => ({
      key: p.key,
      name: p.name || p.key,
      category: p.category || "灵伴",
      system_prompt: p.system_prompt || "",
      user_prompt_template: p.user_prompt_template || "",
    }));
}

function promptPreview(text) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= 96) return cleaned;
  return `${cleaned.slice(0, 96)}…`;
}

function togglePrompt(key) {
  expandedPromptKey.value = expandedPromptKey.value === key ? "" : key;
  promptStatus[key] = "";
  promptStatusError[key] = false;
}

async function loadSoulMatePrompts() {
  promptsLoading.value = true;
  promptsError.value = "";
  try {
    const all = await getAllPrompts();
    promptDrafts.value = sortSoulMatePrompts(Array.isArray(all) ? all : []);
  } catch (e) {
    promptsError.value = e?.message || t("soulmate.promptsLoadFail");
    promptDrafts.value = [];
  } finally {
    promptsLoading.value = false;
  }
}

async function savePromptDraft(prompt) {
  if (!prompt?.key || promptBusyKey.value) return;
  promptBusyKey.value = prompt.key;
  promptStatus[prompt.key] = "";
  promptStatusError[prompt.key] = false;
  try {
    await apiSavePrompt(
      prompt.key,
      prompt.name,
      prompt.category || "灵伴",
      prompt.system_prompt,
      prompt.user_prompt_template,
    );
    promptStatus[prompt.key] = t("soulmate.promptSaved");
  } catch (e) {
    promptStatus[prompt.key] = e?.message || t("soulmate.promptSaveFail");
    promptStatusError[prompt.key] = true;
  } finally {
    promptBusyKey.value = "";
  }
}

function askResetPrompt(key) {
  resetPromptKey.value = key;
}

async function resetPromptDraft() {
  const key = resetPromptKey.value;
  if (!key || promptBusyKey.value) return;
  promptBusyKey.value = key;
  promptStatus[key] = "";
  promptStatusError[key] = false;
  try {
    const restored = await apiResetPrompt(key);
    const idx = promptDrafts.value.findIndex((p) => p.key === key);
    if (idx >= 0) {
      promptDrafts.value[idx] = {
        key: restored.key,
        name: restored.name || restored.key,
        category: restored.category || "灵伴",
        system_prompt: restored.system_prompt || "",
        user_prompt_template: restored.user_prompt_template || "",
      };
    }
    promptStatus[key] = t("soulmate.promptResetDone");
    resetPromptKey.value = "";
  } catch (e) {
    promptStatus[key] = e?.message || t("soulmate.promptResetFail");
    promptStatusError[key] = true;
    resetPromptKey.value = "";
  } finally {
    promptBusyKey.value = "";
  }
}

onMounted(async () => {
  try {
    Object.assign(context, await loadLearningContext({ fallbackToFirstGoal: true }));
    const world = await getSoulMateWorld(context.user?.id || "", context.targetLang || "es");
    if (!world) {
      await router.replace({ name: "soulmate-setup" });
      return;
    }
    for (const key of Object.keys(form)) form[key] = world[key];
    await loadSoulMatePrompts();
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
    await resetSoulMate(context.user.id, context.targetLang || "es");
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
.section-sub { margin: -8px 0 14px; color: var(--text-lighter); font-size: 13px; line-height: 1.45; }
.choice-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.choice-card { min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 6px; border: 1.5px solid var(--border); border-radius: 14px; background: var(--surface); color: var(--text); font: inherit; cursor: pointer; }
.choice-card span { font-size: 23px; }
.choice-card strong { font-size: 13px; }
.choice-card.selected, .pill.selected { border-color: #ff5d8f; background: #fff3f7; color: #d9366e; }
.pill-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 15px; }
.pill { padding: 9px 14px; border: 1.5px solid var(--border); border-radius: 99px; background: var(--surface); color: var(--text); font: inherit; cursor: pointer; }
.field-label { display: flex; flex-direction: column; gap: 7px; margin: 14px 0; color: var(--text-light); font-size: 13px; font-weight: 600; }
.field-label input, .prompt-textarea { border: 1.5px solid var(--border); border-radius: 12px; background: var(--bg); color: var(--text); padding: 11px 13px; font: inherit; outline: none; }
.field-label input:focus, .prompt-textarea:focus { border-color: #ff5d8f; }
.field-title { display: block; margin-bottom: 8px; color: var(--text-light); font-size: 13px; font-weight: 600; }
.slider-row { display: grid; grid-template-columns: 64px 1fr 22px; align-items: center; gap: 10px; margin: 17px 0; color: var(--text); }
.slider-row input { accent-color: #ff5d8f; }
.slider-row strong { color: #d9366e; }
.save-btn { width: 100%; min-height: 50px; margin-bottom: 18px; border: none; border-radius: 15px; background: #ff5d8f; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
.save-btn:disabled { opacity: .55; cursor: default; }
.status-text { margin: 0 0 12px; color: var(--green); text-align: center; font-size: 13px; }
.status-text.error, .state-block.error, .prompt-msg.error { color: var(--red); }
.prompts-section { padding-bottom: 12px; }
.prompt-list { display: flex; flex-direction: column; gap: 10px; }
.prompt-item { border: 1.5px solid var(--border); border-radius: 14px; overflow: hidden; background: var(--bg); }
.prompt-item.open { border-color: #ffb1c8; }
.prompt-header { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border: none; background: transparent; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
.prompt-heading { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.prompt-heading strong { font-size: 14px; }
.prompt-heading code { color: var(--text-lighter); font-size: 11px; word-break: break-all; }
.prompt-chevron { color: var(--text-lighter); font-size: 14px; flex-shrink: 0; }
.prompt-body { padding: 0 14px 14px; border-top: 1px solid var(--border); }
.prompt-preview { margin: 12px 0 0; color: var(--text-lighter); font-size: 12px; line-height: 1.45; }
.prompt-textarea { width: 100%; min-height: 120px; resize: vertical; line-height: 1.45; }
.prompt-textarea.code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
.prompt-vars { margin: 0 0 8px; color: var(--text-lighter); font-size: 11px; line-height: 1.4; }
.prompt-msg { margin: 0 0 10px; color: var(--green); font-size: 12px; }
.prompt-actions { display: flex; gap: 8px; }
.prompt-reset-btn, .prompt-save-btn { flex: 1; min-height: 40px; border-radius: 12px; font: inherit; font-weight: 700; cursor: pointer; }
.prompt-reset-btn { border: 1.5px solid var(--red); background: transparent; color: var(--red); }
.prompt-save-btn { border: none; background: #ff5d8f; color: #fff; }
.prompt-reset-btn:disabled, .prompt-save-btn:disabled { opacity: .55; cursor: default; }
.danger-section { border: 1px solid var(--red-bg); }
.danger-section h2 { color: var(--red); }
.danger-section p { margin: -7px 0 14px; color: var(--text-lighter); font-size: 13px; line-height: 1.45; }
.reset-btn { width: 100%; min-height: 44px; border: 1.5px solid var(--red); border-radius: 13px; background: transparent; color: var(--red); font: inherit; font-weight: 700; cursor: pointer; }
.state-block { min-height: 55vh; display: grid; place-content: center; padding: 24px; color: var(--text-lighter); text-align: center; }
</style>
