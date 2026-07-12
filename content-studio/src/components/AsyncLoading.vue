<template>
  <div class="async-overlay" v-if="isLoading">
    <div class="async-modal">
      <div class="loader-content">
        <div class="spinner"></div>
        <div class="message">
          {{ message }}
        </div>
      </div>
      <div v-if="progress.total || workers.length" class="progress-panel">
        <div class="progress-overview">
          {{ progress.label }} · 计划处理 <strong>{{ progress.total }}</strong> {{ progress.unit }}
          <span v-if="progress.questionTotal"> · 共 {{ progress.questionTotal }} 个小节</span>
        </div>
        <div class="progress-stats">
          <span class="generated">成功 {{ progress.generated }} {{ progress.unit }}</span>
          <span>已处理 {{ progress.current }} / {{ progress.total }}</span>
          <span>剩余 {{ remainingItems }} {{ progress.unit }}</span>
          <span v-if="progress.existing">已有 {{ progress.existing }} {{ progress.unit }}</span>
          <span v-if="progress.failed" class="failed">失败 {{ progress.failed }} {{ progress.unit }}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${progressPercent}%` }"></div>
        </div>
      </div>
      <div v-if="workers.length" class="workers-panel">
        <div class="workers-header">
          <span>并发任务</span>
          <span>{{ activeConcurrency }} / {{ workers.length }} 线程</span>
        </div>
        <div class="worker-list">
          <div v-for="worker in workers" :key="worker.id" class="worker-row" :class="worker.status">
            <div class="worker-topline">
              <span class="worker-name">{{ worker.label }}</span>
              <span class="worker-status">{{ statusLabel(worker.status) }}</span>
              <span class="worker-time">{{ elapsed(worker) }}</span>
            </div>
            <div class="worker-task" :title="worker.task">{{ worker.task }}</div>
            <div v-if="worker.stage" class="worker-stage-row">
              <span class="worker-stage">{{ worker.stage }}</span>
              <span v-if="worker.steps" class="worker-step">步骤 {{ worker.step }}/{{ worker.steps }}</span>
            </div>
            <div v-if="worker.detail" class="worker-dynamic">{{ worker.detail }}</div>
            <div v-if="worker.steps" class="worker-progress-track">
              <div class="worker-progress-fill" :style="{ width: `${worker.percent || 0}%` }"></div>
            </div>
            <div v-if="worker.status === 'retrying' || worker.error" class="worker-detail">
              <span v-if="worker.attempt">重试 {{ worker.attempt }}</span>
              <span v-if="worker.error">{{ worker.error }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="log-window" ref="logContainer">
        <div v-for="(log, index) in recentLogs" :key="`${log.time}-${index}`" class="log-entry" :class="log.type">
          <span class="log-time">{{ log.time }}</span>
          <span class="log-msg">{{ log.msg }}</span>
        </div>
      </div>
      <button class="btn-cancel" @click="cancel">取消操作</button>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useAsyncOperation } from '../composables/useAsyncOperation.js'

const { isLoading, message, progress, logs, workers, activeConcurrency, cancel } = useAsyncOperation()
const now = ref(Date.now())
let timer = null
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 500) })
onBeforeUnmount(() => clearInterval(timer))
const recentLogs = computed(() => logs.value.slice(-5).reverse())
const statusLabels = { waiting: '等待', running: '运行中', retrying: '重试中', completed: '完成', failed: '失败', paused: '已暂停' }
const statusLabel = status => statusLabels[status] || status
const elapsed = worker => {
  if (!worker.startedAt) return ''
  const end = worker.finishedAt || now.value
  return `${Math.max(0, (end - worker.startedAt) / 1000).toFixed(1)}s`
}
const remainingItems = computed(() => Math.max(0, progress.value.total - progress.value.current))
const progressPercent = computed(() => {
  if (!progress.value.total) return 0
  return Math.min(100, Math.round((progress.value.current / progress.value.total) * 100))
})
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
  width: min(680px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  box-shadow: 0 20px 40px rgba(0,0,0,0.4);
  border: 1px solid #444;
}
.workers-panel {
  width: 100%;
  padding: 12px;
  box-sizing: border-box;
  border-radius: 10px;
  background: #202027;
  border: 1px solid #41414b;
}
.workers-header, .worker-topline { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.workers-header { margin-bottom: 9px; color: #d1d5db; font-size: 12px; font-weight: 700; }
.worker-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.worker-row { min-width: 0; padding: 9px 10px; border-radius: 8px; background: #2c2c34; border-left: 3px solid #6b7280; }
.worker-row.running { border-left-color: #4caf50; }
.worker-row.retrying { border-left-color: #f59e0b; }
.worker-row.completed { border-left-color: #22c55e; opacity: .82; }
.worker-row.failed { border-left-color: #ef4444; }
.worker-row.paused { border-left-color: #8b5cf6; opacity: .72; }
.worker-name { color: #f3f4f6; font-size: 12px; font-weight: 700; }
.worker-status { margin-left: auto; color: #aeb1ba; font-size: 11px; }
.worker-time { min-width: 35px; text-align: right; color: #7f8490; font: 11px Consolas, monospace; }
.worker-task { margin-top: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #e5e7eb; font-size: 12px; }
.worker-stage-row { display: flex; justify-content: space-between; gap: 8px; margin-top: 7px; color: #b8e6ba; font-size: 11px; }
.worker-step { color: #9297a2; flex-shrink: 0; }
.worker-dynamic { margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #aeb1ba; font: 10px Consolas, monospace; }
.worker-progress-track { height: 4px; margin-top: 7px; overflow: hidden; border-radius: 999px; background: #44444f; }
.worker-progress-fill { height: 100%; border-radius: inherit; background: #4caf50; transition: width .2s ease; }
.worker-detail { display: flex; gap: 6px; margin-top: 4px; overflow: hidden; color: #f59e0b; font-size: 10px; white-space: nowrap; }
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
.progress-panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  box-sizing: border-box;
  border-radius: 8px;
  background: #24242b;
  border: 1px solid #3d3d46;
  font-size: 13px;
}
.progress-overview {
  color: #f3f4f6;
  line-height: 1.4;
}
.progress-overview strong,
.progress-stats .generated {
  color: var(--green, #4caf50);
}
.progress-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  color: #bfc1c9;
  line-height: 1.4;
}
.progress-stats .failed,
.log-entry.error .log-msg { color: #ef4444; }
.progress-track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: #3a3a43;
}
.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--green, #4caf50);
  transition: width 0.25s ease;
}
.log-window {
  width: 100%;
  min-height: 34px;
  max-height: 112px;
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
@media (max-width: 560px) {
  .async-modal { min-width: 0; width: calc(100vw - 20px); padding: 18px 14px; gap: 12px; }
  .worker-list { grid-template-columns: 1fr; }
  .workers-panel { padding: 9px; }
  .worker-row { padding: 8px 9px; }
}
.log-entry {
  display: flex;
  gap: 8px;
  padding: 2px 4px;
  border-radius: 2px;
}
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
