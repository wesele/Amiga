<template>
  <div class="step-basic">
    <div class="welcome-logo">
      <div class="logo-icon">A</div>
      <h1 class="app-name">阿米加</h1>
      <p class="tagline">学语言，连世界</p>
    </div>

    <h2 class="step-title">完善个人资料</h2>
    <p class="step-sub">让我们更好地了解你</p>

    <!-- Avatar -->
    <div class="form-group">
      <label class="form-label">头像</label>
      <div class="avatar-select">
        <button
          v-for="emoji in avatars"
          :key="emoji"
          class="avatar-circle"
          :class="{ selected: form.avatar === emoji }"
          @click="form.avatar = emoji"
        >
          {{ emoji }}
        </button>
      </div>
    </div>

    <!-- Nickname -->
    <div class="form-group">
      <label class="form-label" for="nickname">昵称</label>
      <input
        id="nickname"
        v-model="form.nickname"
        class="form-input"
        type="text"
        maxlength="20"
        placeholder="你的学习昵称"
      />
      <span class="char-count">{{ form.nickname.length }}/20</span>
    </div>

    <!-- Native Language -->
    <div class="form-group">
      <label class="form-label">母语</label>
      <div class="pill-group">
        <button
          v-for="lang in languages"
          :key="lang.value"
          class="pill"
          :class="{ selected: form.nativeLanguage === lang.value }"
          @click="form.nativeLanguage = lang.value"
        >
          {{ lang.flag }} {{ lang.label }}
        </button>
      </div>
    </div>

    <!-- Country -->
    <div class="form-group">
      <label class="form-label">国家/地区</label>
      <select v-model="form.country" class="form-input">
        <option v-for="c in countries" :key="c.value" :value="c.value">
          {{ c.flag }} {{ c.label }}
        </option>
      </select>
    </div>

    <!-- Gender -->
    <div class="form-group">
      <label class="form-label">性别 <span class="optional">（选填）</span></label>
      <div class="pill-group">
        <button
          v-for="g in genders"
          :key="g.value"
          class="pill"
          :class="{ selected: form.gender === g.value }"
          @click="form.gender = g.value"
        >
          {{ g.label }}
        </button>
      </div>
    </div>

    <!-- Birth Year -->
    <div class="form-group">
      <label class="form-label">出生年份 <span class="optional">（选填）</span></label>
      <select v-model="form.birthYear" class="form-input">
        <option :value="null">选择出生年份</option>
        <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}</option>
      </select>
    </div>

    <div class="wizard-footer">
      <button class="btn-primary" @click="emitNext">下一步</button>
      <button class="btn-link" @click="emitNext">跳过，以后再说</button>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed } from "vue";

const emit = defineEmits(["next"]);

const avatars = ["😊", "😎", "🤓", "🌸", "🦊", "🐱", "🐶", "🐻", "🦉", "🌟", "🎯", "🎨"];

const languages = [
  { value: "zh", flag: "🇨🇳", label: "中文" },
  { value: "en", flag: "🇬🇧", label: "English" },
  { value: "es", flag: "🇪🇸", label: "Español" },
  { value: "ja", flag: "🇯🇵", label: "日本語" },
  { value: "fr", flag: "🇫🇷", label: "Français" },
  { value: "de", flag: "🇩🇪", label: "Deutsch" },
];

const countries = [
  { value: "CN", flag: "🇨🇳", label: "中国" },
  { value: "ES", flag: "🇪🇸", label: "西班牙" },
  { value: "MX", flag: "🇲🇽", label: "墨西哥" },
  { value: "AR", flag: "🇦🇷", label: "阿根廷" },
  { value: "US", flag: "🇺🇸", label: "美国" },
  { value: "JP", flag: "🇯🇵", label: "日本" },
];

const genders = [
  { value: "male", label: "男" },
  { value: "female", label: "女" },
  { value: "private", label: "不公开" },
];

const form = reactive({
  avatar: "😊",
  nickname: "学习者",
  nativeLanguage: "zh",
  country: "CN",
  gender: "private",
  birthYear: null,
});

const currentYear = new Date().getFullYear();
const yearOptions = computed(() => {
  const years = [];
  for (let y = currentYear - 10; y >= currentYear - 70; y--) years.push(y);
  return years;
});

function emitNext() {
  emit("next", { ...form });
}
</script>

<style scoped>
.step-basic {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.welcome-logo {
  text-align: center;
  padding: 8px 0 16px;
}

.logo-icon {
  width: 60px;
  height: 60px;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--green), var(--green-hover));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 800;
  color: #fff;
  margin: 0 auto 10px;
  box-shadow: 0 4px 16px rgba(88, 204, 2, 0.25);
}

.app-name {
  font-size: 22px;
  font-weight: 800;
  color: var(--green);
}

.tagline {
  font-size: 12px;
  color: var(--text-lighter);
  margin-top: 2px;
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
  margin-bottom: 20px;
}

.form-group {
  margin-bottom: 14px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-light);
  margin-bottom: 6px;
}

.optional {
  font-weight: 400;
  color: var(--text-lighter);
}

.form-input {
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  font-size: 14px;
  font-family: inherit;
  color: var(--text);
  background: var(--surface);
  transition: border-color var(--transition);
  outline: none;
  appearance: none;
}

.form-input:focus {
  border-color: var(--green);
  box-shadow: 0 0 0 3px var(--green-bg);
}

select.form-input {
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12'%3E%3Cpath d='M2 4l4 4 4-4' fill='%23777'/%3E%3C/svg%3E") no-repeat right 12px center;
  appearance: none;
  padding-right: 32px;
}

.char-count {
  font-size: 11px;
  color: var(--text-lighter);
  float: right;
  margin-top: 2px;
}

.avatar-select {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.avatar-circle {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  cursor: pointer;
  border: 2px solid transparent;
  background: var(--bg);
  transition: all var(--transition);
}

.avatar-circle:hover {
  border-color: var(--green);
}

.avatar-circle.selected {
  border-color: var(--green);
  background: var(--green-bg);
  border-width: 3px;
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
  padding: 8px 16px;
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
  display: flex;
  flex-direction: column;
  gap: 8px;
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

.btn-link {
  background: none;
  border: none;
  color: var(--text-light);
  font-size: 13px;
  cursor: pointer;
  text-align: center;
  padding: 8px;
  font-family: inherit;
}
</style>
