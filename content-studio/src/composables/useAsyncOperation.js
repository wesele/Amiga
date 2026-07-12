/**
 * 全局异步操作加载状态管理器（单例）
 * 所有组件共享同一份 isLoading、message、progress 和当前状态日志
 */
import { ref } from 'vue'

// 将状态提升到模块级，实现单例
const isLoading = ref(false)
const message = ref('')
const logs = ref([])
const workers = ref([])
const activeConcurrency = ref(0)
const progress = ref({
  label: '任务',
  unit: '项',
  current: 0,
  total: 0,
  questionTotal: 0,
  existing: 0,
  generated: 0,
  failed: 0
})
let _abortController = null
let _stopTimer = null

export function useAsyncOperation() {

  function start(msg = '正在处理，请稍候...', options = {}) {
    if (_stopTimer) clearTimeout(_stopTimer)
    isLoading.value = true
    message.value = msg
    logs.value = []
    workers.value = []
    activeConcurrency.value = 0
    progress.value = {
      current: 0,
      label: options.label || '任务',
      unit: options.unit || '项',
      total: Math.max(0, Number(options.total) || 0),
      questionTotal: Math.max(0, Number(options.questionTotal) || 0),
      existing: Math.max(0, Number(options.existing) || 0),
      generated: 0,
      failed: 0
    }
    _abortController = new AbortController()
    return _abortController
  }

  function stop() {
    _abortController = null
    _stopTimer = setTimeout(() => {
      isLoading.value = false
      message.value = ''
      _stopTimer = null
    }, 1200)
  }

  function setMessage(msg) {
    message.value = msg
  }

  function setProgress(current, total = progress.value.total, meta = {}) {
    progress.value = {
      ...progress.value,
      current: Math.max(0, Number(current) || 0),
      total: Math.max(0, Number(total) || 0),
      ...meta
    }
  }

  function advanceProgress(success = true, amount = 1) {
    const count = Math.max(0, Number(amount) || 0)
    progress.value = {
      ...progress.value,
      current: Math.min(progress.value.total || Infinity, progress.value.current + count),
      generated: progress.value.generated + (success ? count : 0),
      failed: progress.value.failed + (success ? 0 : count)
    }
  }

  function addLog(msg, type = 'info') {
    const time = new Date().toLocaleTimeString()
    logs.value = [...logs.value, { time, msg, type }].slice(-100)
  }

  function configureWorkers(count) {
    const total = Math.max(0, Number(count) || 0)
    activeConcurrency.value = total
    workers.value = Array.from({ length: total }, (_, index) => ({
      id: index,
      label: `Worker ${index + 1}`,
      status: 'waiting',
      task: '等待任务',
      attempt: 0,
      stage: '等待任务',
      detail: '',
      step: 0,
      steps: 0,
      percent: 0,
      startedAt: null,
      finishedAt: null,
      error: ''
    }))
  }

  function setActiveConcurrency(count) {
    activeConcurrency.value = Math.max(0, Number(count) || 0)
  }

  function updateWorker(id, updates = {}) {
    const current = workers.value[id]
    if (!current) return
    const now = Date.now()
    const next = { ...current, ...updates }
    if (updates.status === 'running' && current.status !== 'running') next.startedAt = now
    if (['completed', 'failed'].includes(updates.status)) next.finishedAt = now
    workers.value = workers.value.map((worker, index) => index === id ? next : worker)
  }

  function cancel() {
    if (_stopTimer) clearTimeout(_stopTimer)
    if (_abortController) {
      _abortController.abort()
    }
    addLog('操作已被用户取消，正在保存已完成内容...', 'warning')
    message.value = '正在取消并保存已完成内容...'
  }

  return {
    isLoading,
    message,
    progress,
    logs,
    workers,
    activeConcurrency,
    start,
    stop,
    cancel,
    setMessage,
    setProgress,
    advanceProgress,
    addLog,
    configureWorkers,
    setActiveConcurrency,
    updateWorker
  }
}

export default useAsyncOperation
