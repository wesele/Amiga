<template>
  <div class="step-goal">
    <h2 class="step-title">设定学习目标</h2>
    <p class="step-sub">为你定制专属学习路径</p>

    <!-- Target Language -->
    <div class="form-group">
      <label class="form-label">目标语言</label>
      <div class="pill-group">
        <button
          v-for="lang in targetLanguages"
          :key="lang.value"
          class="pill"
          :class="{ selected: form.targetLanguage === lang.value }"
          @click="form.targetLanguage = lang.value"
        >
          {{ lang.flag }} {{ lang.label }}
        </button>
      </div>
    </div>

    <!-- CEFR Level -->
    <div class="form-group">
      <label class="form-label">当前水平</label>
      <div class="pill-group">
        <button
          v-for="level in levels"
          :key="level.value"
          class="pill"
          :class="{ selected: form.cefrLevel === level.value }"
          @click="form.cefrLevel = level.value"
        >
          {{ level.label }}
        </button>
      </div>
    </div>

    <!-- Learning Objective -->
    <div class="form-group">
      <label class="form-label">学习目标</label>
      <div class="pill-group">
        <button
          v-for="obj in objectives"
          :key="obj.value"
          class="pill"
          :class="{ selected: form.objective === obj.value }"
          @click="form.objective = obj.value"
        >
          {{ obj.label }}
        </button>
      </div>
    </div>

    <!-- Daily Duration -->
    <div class="form-group">
      <label class="form-label">每天学习时间</label>
      <div class="pill-group">
        <button
          v-for="d in durations"
          :key="d.value"
          class="pill"
          :class="{ selected: form.dailyMinutes === d.value }"
          @click="form.dailyMinutes = d.value"
        >
          {{ d.label }}
        </button>
      </div>
    </div>

    <div class="wizard-footer">
      <button class="btn-primary" @click="emitNext">开始学习！</button>
    </div>
  </div>
</template>

<script setup>
import { reactive } from "vue";

const emit = defineEmits(["next"]);

const targetLanguages = [
  { value: "es", flag: "🇪🇸", label: "西班牙语" },
  { value: "zh", flag: "🇨🇳", label: "中文" },
  { value: "en", flag: "🇬🇧", label: "英语" },
  { value: "ja", flag: "🇯🇵", label: "日语" },
  { value: "fr", flag: "🇫🇷", label: "法语" },
];

const levels = [
  { value: "A0", label: "零基础" },
  { value: "A1", label: "初级 A1" },
  { value: "A2", label: "初级 A2" },
  { value: "B1", label: "中级 B1" },
  { value: "B2", label: "中级 B2" },
  { value: "C1", label: "高级 C1" },
];

const objectives = [
  { value: "daily_conversation", label: "日常对话" },
  { value: "travel", label: "旅行交流" },
  { value: "exam", label: "考试准备" },
  { value: "fluent", label: "流利掌握" },
];

const durations = [
  { value: 5, label: "5 分钟" },
  { value: 15, label: "15 分钟" },
  { value: 30, label: "30 分钟" },
  { value: 60, label: "1 小时+" },
];

const form = reactive({
  targetLanguage: "es",
  cefrLevel: "A0",
  objective: "daily_conversation",
  dailyMinutes: 15,
});

function emitNext() {
  emit("next", { ...form });
}
</script>

<style scoped>
.step-goal {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.step-title {
  font-size: 22px;
  font-weight: 800;
  text-align: center;
  margin-bottom: 4px;
}

.step-sub {
  font-size: 13px;
  color: var(--text-light);
  text-align: center;
  margin-bottom: 28px;
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-light);
  margin-bottom: 8px;
}

.pill-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.pill {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 18px;
  border-radius: 24px;
  border: 1.5px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
}

.pill:hover {
  border-color: var(--green);
  color: var(--green);
}

.pill.selected {
  background: var(--green);
  color: #fff;
  border-color: var(--green);
}

.wizard-footer {
  margin-top: auto;
  padding: 20px 0 32px;
}

.btn-primary {
  width: 100%;
  padding: 14px;
  border-radius: var(--radius-md);
  background: var(--green);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
}

.btn-primary:hover {
  background: var(--green-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(88, 204, 2, 0.3);
}
</style>
