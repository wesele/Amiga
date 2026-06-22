<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="word-popup">
      <div class="popup-word">{{ word }}</div>

      <div v-if="loading" class="popup-loading">
        <div class="mini-spinner" />
        <span>{{ t('popup.translating') }}</span>
      </div>

      <template v-else-if="translation">
        <div class="popup-trans">{{ translation.translation }}</div>
        <div class="popup-extra" v-if="translation.pos || translation.ipa">
          <span v-if="translation.pos" class="tag-pos">{{ translation.pos }}</span>
          <span v-if="translation.ipa" class="tag-ipa">{{ translation.ipa }}</span>
        </div>
        <div v-if="!alwaysShowActions" class="popup-actions">
          <button class="act-known" @click="$emit('known'); emitClose()">✅ {{ t('popup.known') }}</button>
          <button class="act-unknown" @click="$emit('unknown'); emitClose()">❌ {{ t('popup.unknown') }}</button>
        </div>
      </template>

      <div v-else-if="error" class="popup-error">
        {{ error || t('popup.fail') }}
        <div v-if="!alwaysShowActions" class="popup-actions">
          <button class="act-known" @click="$emit('known'); emitClose()">✅ {{ t('popup.known') }}</button>
          <button class="act-unknown" @click="$emit('unknown'); emitClose()">❌ {{ t('popup.unknown') }}</button>
        </div>
      </div>

      <div v-if="alwaysShowActions" class="popup-actions">
        <button class="act-known" @click="$emit('known'); emitClose()">✅ {{ t('popup.known') }}</button>
        <button class="act-unknown" @click="$emit('unknown'); emitClose()">❌ {{ t('popup.unknown') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { translateWord } from "@/shared/api.js";
import { useI18n } from "@/shared/i18n";

const props = defineProps({
  word: { type: String, required: true },
  context: { type: String, default: "" },
  sourceLang: { type: String, default: "es" },
  nativeLang: { type: String, default: "zh" },
  alwaysShowActions: { type: Boolean, default: false },
});

const emit = defineEmits(["close", "known", "unknown"]);
const { t } = useI18n();

const translation = ref(null);
const loading = ref(true);
const error = ref("");

onMounted(async () => {
  try {
    const result = await translateWord(props.word, props.context, props.sourceLang, props.nativeLang);
    translation.value = result;
  } catch (e) {
    error.value = t("popup.fail");
  } finally {
    loading.value = false;
  }
});

function emitClose() {
  setTimeout(() => emit("close"), 200);
}
</script>

<style scoped>
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 500;
  padding: 20px;
  padding-bottom: calc(20px + 80px);
}

.word-popup {
  background: var(--surface);
  border-radius: var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-sm);
  padding: 20px 24px;
  width: 100%;
  max-width: 360px;
  box-shadow: var(--shadow-lg);
  animation: slideUp 0.2s cubic-bezier(0.2, 0, 0, 1);
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.popup-word {
  font-size: 22px;
  font-weight: 800;
  color: var(--purple);
  margin-bottom: 8px;
}

.popup-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-lighter);
  font-size: 13px;
  padding: 8px 0;
}

.mini-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--purple);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.popup-trans {
  font-size: 16px;
  color: var(--text);
  margin-bottom: 8px;
  line-height: 1.4;
}

.popup-extra {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.tag-pos {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 8px;
  background: var(--blue-bg);
  color: var(--blue);
}

.tag-ipa {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 8px;
  background: var(--surface-variant);
  color: var(--text-lighter);
  font-family: monospace;
}

.popup-actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.act-known {
  flex: 1;
  padding: 10px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--green);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: background var(--transition);
}

.act-known:hover {
  background: var(--green-hover);
}

.act-unknown {
  flex: 1;
  padding: 10px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--red-bg);
  color: var(--red);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: background var(--transition);
}

.act-unknown:hover {
  background: var(--red);
  color: #fff;
}

.popup-error {
  color: var(--red);
  font-size: 13px;
  padding: 8px 0;
}
</style>
