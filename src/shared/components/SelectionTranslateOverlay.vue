<template>
  <Transition name="popup">
    <div v-if="selectionText" class="sel-overlay" @click.self="$emit('clear')">
      <div class="sel-popup">
        <div class="sel-source">{{ selectionText }}</div>
        <div v-if="selectionLoading" class="sel-loading">{{ loadingLabel }}</div>
        <div v-else-if="selectionResult" class="sel-result">{{ selectionResult }}</div>
        <div v-else-if="selectionError" class="sel-error">{{ selectionError }}</div>
        <div v-if="showActions" class="sel-actions">
          <button type="button" class="act-known" @click="emitKnown">✅ {{ knownLabel }}</button>
          <button type="button" class="act-unknown" @click="emitUnknown">❌ {{ unknownLabel }}</button>
        </div>
        <button type="button" class="sel-close" @click="$emit('clear')">✕</button>
      </div>
    </div>
  </Transition>

  <button
    v-if="showTranslateButton"
    type="button"
    class="translate-fab"
    :style="{ top: translateButtonY + 'px', left: translateButtonX + 'px' }"
    @click="$emit('translate')"
  >
    {{ translateLabel }}
  </button>
</template>

<script setup>
defineProps({
  selectionText: { type: String, default: "" },
  selectionResult: { type: String, default: "" },
  selectionLoading: { type: Boolean, default: false },
  selectionError: { type: String, default: "" },
  showActions: { type: Boolean, default: false },
  showTranslateButton: { type: Boolean, default: false },
  translateButtonX: { type: Number, default: 0 },
  translateButtonY: { type: Number, default: 0 },
  translateLabel: { type: String, required: true },
  loadingLabel: { type: String, required: true },
  knownLabel: { type: String, required: true },
  unknownLabel: { type: String, required: true },
});

const emit = defineEmits(["clear", "translate", "known", "unknown"]);

function emitKnown() {
  emit("known");
  setTimeout(() => emit("clear"), 200);
}

function emitUnknown() {
  emit("unknown");
  setTimeout(() => emit("clear"), 200);
}
</script>

<style scoped>
.sel-overlay {
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

.translate-fab {
  position: fixed;
  z-index: 600;
  background: var(--purple, #7c3aed);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  border: none;
  border-radius: 18px;
  padding: 6px 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.translate-fab:active {
  transform: scale(0.96);
}

.sel-popup {
  background: var(--surface);
  border-radius: var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-sm);
  padding: 20px 24px;
  width: 100%;
  max-width: 360px;
  box-shadow: var(--shadow-lg);
  animation: slideUp 0.2s cubic-bezier(0.2, 0, 0, 1);
  position: relative;
}

.sel-source {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 12px;
  line-height: 1.5;
}

.sel-loading,
.sel-result,
.sel-error {
  font-size: 14px;
  line-height: 1.6;
}

.sel-result {
  color: var(--text-secondary);
}

.sel-error {
  color: var(--red, #f44336);
}

.sel-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
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
}

.act-unknown {
  flex: 1;
  padding: 10px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--orange, #ff9800);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}

.sel-close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  font-size: 16px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>