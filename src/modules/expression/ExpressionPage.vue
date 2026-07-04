<template>
  <div class="expression-page">
    <PageHeader title="表达评分" :back-label="t('common.back')" />
    <main class="expression-content">
      <div class="mode-tabs" role="tablist" aria-label="表达模式">
        <button
          v-for="item in modes"
          :key="item.id"
          class="mode-tab"
          :class="{ active: mode === item.id }"
          type="button"
          @click="mode = item.id"
        >
          {{ item.label }}
        </button>
      </div>

      <label class="field">
        <span>场景</span>
        <input v-model.trim="scenario" type="text" placeholder="例如：读完新闻后表达观点" />
      </label>

      <label class="field">
        <span>{{ mode === "speaking" ? "口语转写" : "短文本" }}</span>
        <textarea v-model.trim="inputText" rows="7" maxlength="1200" :placeholder="placeholder" />
      </label>

      <p v-if="mode === 'speaking'" class="hint">
        先用文本模拟口语回答，后续可替换为真实录音转写；评分只看流畅度、准确度和自然度。
      </p>

      <button class="primary-btn" type="button" :disabled="submitting" @click="submit">
        {{ submitting ? "评分中..." : "获取评分" }}
      </button>

      <p v-if="error" class="error-text">{{ error }}</p>

      <section v-if="result" class="result-panel">
        <div class="score-row">
          <span class="score">{{ result.total_score }}</span>
          <span class="score-label">总分</span>
        </div>
        <p class="summary">{{ result.summary }}</p>
        <div class="improved">
          <h2>更自然的版本</h2>
          <p>{{ result.improved_version }}</p>
        </div>
        <div v-if="result.suggestions?.length" class="suggestions">
          <h2>改进建议</h2>
          <ul>
            <li v-for="tip in result.suggestions" :key="tip">{{ tip }}</li>
          </ul>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { getCurrentUser, scoreExpression } from "@/shared/api.js";
import { useI18n, getLocale } from "@/shared/i18n";
import { useTargetLangStore } from "@/stores/targetLang.js";

const { t } = useI18n();
const targetLangStore = useTargetLangStore();

const modes = [
  { id: "writing", label: "写作短评" },
  { id: "speaking", label: "口语占位" },
];

const mode = ref("writing");
const scenario = ref("日常表达");
const inputText = ref("");
const result = ref(null);
const error = ref("");
const submitting = ref(false);
const userId = ref("");

const placeholder = computed(() =>
  mode.value === "speaking"
    ? "把你的口语回答先写在这里，例如：I think the article is important because..."
    : "写 1-3 句目标语，Amiga 会给出准确度、自然度和表达丰富度反馈。",
);

onMounted(async () => {
  await targetLangStore.load();
  try {
    const user = await getCurrentUser();
    userId.value = user?.id || "";
  } catch (_) {
    userId.value = "";
  }
});

async function submit() {
  error.value = "";
  result.value = null;
  if (!inputText.value) {
    error.value = "请输入要评分的内容";
    return;
  }
  submitting.value = true;
  try {
    result.value = await scoreExpression({
      user_id: userId.value,
      mode: mode.value,
      target_lang: targetLangStore.code || "es",
      native_lang: getLocale(),
      scenario: scenario.value,
      input_text: inputText.value,
      reference_text: "",
    });
  } catch (e) {
    error.value = typeof e === "string" ? e : e?.message || "评分失败，请稍后重试";
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.expression-page {
  min-height: 100%;
  background: var(--bg);
}

.expression-content {
  padding: 16px;
}

.mode-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 16px;
}

.mode-tab {
  height: 42px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-light);
  font: inherit;
  font-weight: 700;
}

.mode-tab.active {
  border-color: var(--green);
  background: var(--green-bg);
  color: var(--green);
}

.field {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
  color: var(--text);
  font-size: 14px;
  font-weight: 700;
}

.field input,
.field textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 500;
  line-height: 1.5;
  padding: 12px;
  resize: vertical;
}

.hint {
  margin: 0 0 14px;
  color: var(--text-lighter);
  font-size: 13px;
  line-height: 1.5;
}

.primary-btn {
  width: 100%;
  height: 46px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--green);
  color: #fff;
  font: inherit;
  font-weight: 800;
}

.primary-btn:disabled {
  opacity: 0.65;
}

.error-text {
  color: var(--red);
  font-size: 13px;
  line-height: 1.4;
}

.result-panel {
  margin-top: 16px;
  padding: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.score-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.score {
  font-size: 34px;
  font-weight: 900;
  color: var(--green);
}

.score-label {
  color: var(--text-light);
  font-weight: 700;
}

.summary,
.improved p,
.suggestions {
  color: var(--text);
  font-size: 14px;
  line-height: 1.55;
}

.improved h2,
.suggestions h2 {
  margin: 14px 0 6px;
  font-size: 15px;
}

.suggestions ul {
  margin: 0;
  padding-left: 18px;
}
</style>
