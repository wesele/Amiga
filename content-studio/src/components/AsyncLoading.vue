<template>
  <div class="async-overlay" v-if="isLoading">
    <div class="async-modal">
      <div class="loader-content">
        <div class="spinner"></div>
        <div class="message">{{ message }}</div>
      </div>
      <div class="log-window" ref="logContainer">
        <div v-for="(log, i) in logs" :key="i" class="log-entry" :class="log.type">
          <span class="log-time">{{ log.time }}</span>
          <span class="log-msg">{{ log.msg }}</span>
        </div>
      </div>
      <button class="btn-cancel" @click="cancel">取消操作</button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { useAsyncOperation } from '../composables/useAsyncOperation.js'

const { isLoading, message, logs, cancel } = useAsyncOperation()
const logContainer = ref(null)

watch(logs, async () => {
  await nextTick()
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  }
}, { deep: true })
</script>

<style scoped>
.async-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}
.async-modal {
  background: #2d2d34;
  color: white;
  padding: 32px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  min-width: 420px;
  max-width: 480px;
  box-shadow: 0 20px 40px rgba(0,0,0,0.4);
  border: 1px solid #444;
}
.loader-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.spinner {
  width: 36px;
  height: 36px;
  border: 4px solid rgba(255,255,255,0.1);
  border-top: 4px solid var(--green, #4caf50);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.message {
  font-size: 16px;
  font-weight: 500;
  text-align: center;
}
.log-window {
  width: 100%;
  max-height: 200px;
  overflow-y: auto;
  background: #1a1a1f;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: 'Consolas', monospace;
  font-size: 12px;
}
.log-entry {
  display: flex;
  gap: 8px;
  padding: 2px 4px;
  border-radius: 2px;
}
.log-entry.error .log-msg { color: #ef4444; }
.log-entry.warning .log-msg { color: #f59e0b; }
.log-entry.success .log-msg { color: #22c55e; }
.log-time { color: #6b7280; flex-shrink: 0; }
.log-msg { color: #e5e7eb; }
.btn-cancel {
  background: transparent;
  border: 1px solid #666;
  color: #ccc;
  padding: 8px 24px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-cancel:hover {
  background: #444;
  color: white;
  border-color: #888;
}
</style>
