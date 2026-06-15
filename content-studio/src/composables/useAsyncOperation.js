/**
 * 全局异步操作加载状态管理器（单例）
 * 所有组件共享同一份 isLoading、message 和 logs 状态
 */
import { ref } from 'vue'

// 将状态提升到模块级，实现单例
const isLoading = ref(false)
const message = ref('')
const logs = ref([])
let _abortController = null

export function useAsyncOperation() {

  function start(msg = '正在处理，请稍候...') {
    isLoading.value = true
    message.value = msg
    logs.value = []
    _abortController = new AbortController()
    return _abortController
  }

  function stop() {
    isLoading.value = false
    message.value = ''
    _abortController = null
  }

  function setMessage(msg) {
    message.value = msg
  }

  function addLog(msg, type = 'info') {
    const time = new Date().toLocaleTimeString()
    logs.value.push({ time, msg, type })
  }

  function cancel() {
    if (_abortController) {
      _abortController.abort()
    }
    addLog('操作已被用户取消', 'warning')
    isLoading.value = false
    message.value = ''
    _abortController = null
  }

  return {
    isLoading,
    message,
    logs,
    start,
    stop,
    cancel,
    setMessage,
    addLog
  }
}

export default useAsyncOperation
