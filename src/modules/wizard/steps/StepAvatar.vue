<template>
  <div class="step-avatar">
    <h2 class="step-title">{{ t('wizard.step4Title') }}</h2>
    <p class="step-sub">{{ t('wizard.step4Sub') }}</p>

    <div class="avatar-grid">
      <button
        v-for="emoji in avatars"
        :key="emoji"
        class="avatar-circle"
        :class="{ selected: form.avatar === emoji }"
        @click="selectAndFinish(emoji)"
      >
        {{ emoji }}
      </button>
    </div>

    <div class="wizard-footer">
      <button class="btn-link" @click="finishDefault">
        {{ t('wizard.skip') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { reactive } from "vue";
import { useI18n } from "@/shared/i18n";

const emit = defineEmits(["next"]);
const { t } = useI18n();

const avatars = [
  "😊",
  "😎",
  "🤓",
  "🌸",
  "🦊",
  "🐱",
  "🐶",
  "🐻",
  "🦉",
  "🌟",
  "🎯",
  "🎨",
];

const form = reactive({ avatar: "😊" });

function selectAndFinish(emoji) {
  form.avatar = emoji;
  emit("next", { ...form });
}

function finishDefault() {
  emit("next", { ...form });
}
</script>

<style scoped>
.step-avatar {
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

.avatar-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  padding: 8px 0;
  max-width: 320px;
  margin: 0 auto;
}

.avatar-circle {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  cursor: pointer;
  border: 2px solid transparent;
  background: var(--bg);
  transition: all var(--transition);
  margin: 0 auto;
}

.avatar-circle:hover {
  border-color: var(--green);
  transform: scale(1.05);
}

.avatar-circle.selected {
  border-color: var(--green);
  background: var(--green-bg);
  border-width: 3px;
}

.wizard-footer {
  margin-top: auto;
  padding: 20px 0 32px;
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
  width: 100%;
}
</style>
