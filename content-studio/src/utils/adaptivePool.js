export function isTransientConcurrencyError(error) {
  const status = Number(error?.status || error?.statusCode || 0)
  if (status === 429 || status >= 500) return true
  if (error?.name === 'AbortError') return false
  const message = String(error?.message || error || '').toLowerCase()
  return /429|rate.?limit|timeout|timed out|network|fetch|socket|econn|503|502|500/.test(message)
}

function delay(ms, signal) {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}

export async function runAdaptivePool(tasks, worker, options = {}) {
  const maxConcurrency = Math.max(1, Number(options.maxConcurrency) || 5)
  const minConcurrency = Math.max(1, Math.min(maxConcurrency, Number(options.minConcurrency) || 1))
  const maxRetries = Math.max(0, Number(options.maxRetries) || 0)
  const recoverySuccesses = Math.max(1, Number(options.recoverySuccesses) || 5)
  const queue = tasks.map((task, index) => ({ task, index, attempt: 0 }))
  const results = new Array(tasks.length)
  const errors = new Array(tasks.length)
  let cursor = 0
  let concurrency = maxConcurrency
  let successStreak = 0

  options.onPoolStart?.(maxConcurrency)

  const setConcurrency = next => {
    const value = Math.max(minConcurrency, Math.min(maxConcurrency, next))
    if (value === concurrency) return
    concurrency = value
    options.onConcurrencyChange?.(concurrency)
  }

  async function runner(workerId) {
    while (true) {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      if (workerId >= concurrency) {
        if (cursor >= queue.length) return
        options.onWorkerState?.(workerId, { status: 'paused', task: '并发降级，等待恢复' })
        await delay(50, options.signal)
        continue
      }
      const item = queue[cursor++]
      if (!item) {
        options.onWorkerState?.(workerId, { status: 'waiting', task: '无待处理任务' })
        return
      }
      let finished = false
      while (!finished) {
        try {
          options.onWorkerState?.(workerId, { status: 'running', task: options.describeTask?.(item.task) || String(item.index + 1), attempt: item.attempt, error: '', stage: '开始任务', detail: '', step: 0, steps: 0, percent: 0 })
          results[item.index] = await worker(item.task, { attempt: item.attempt, workerId })
          errors[item.index] = undefined
          successStreak++
          if (concurrency < maxConcurrency && successStreak >= recoverySuccesses) {
            successStreak = 0
            setConcurrency(concurrency + 1)
          }
          options.onTaskComplete?.(item.task, results[item.index])
          options.onWorkerState?.(workerId, { status: 'completed', task: options.describeTask?.(item.task) || String(item.index + 1), attempt: item.attempt, stage: '完成', detail: '任务处理完成', step: 1, steps: 1, percent: 100 })
          finished = true
        } catch (error) {
          if (error?.name === 'AbortError') throw error
          const transient = isTransientConcurrencyError(error)
          const retryable = transient || error?.retryable === true
          successStreak = 0
          if (transient) setConcurrency(concurrency - 1)
          if (retryable && item.attempt < maxRetries) {
            item.attempt++
            options.onWorkerState?.(workerId, { status: 'retrying', task: options.describeTask?.(item.task) || String(item.index + 1), attempt: item.attempt, error: error.message })
            options.onRetry?.(item.task, item.attempt, error)
            await delay((options.retryDelayMs || 500) * item.attempt, options.signal)
          } else {
            errors[item.index] = error
            options.onTaskError?.(item.task, error)
            options.onWorkerState?.(workerId, { status: 'failed', task: options.describeTask?.(item.task) || String(item.index + 1), attempt: item.attempt, error: error.message })
            finished = true
          }
        }
      }
    }
  }

  const runnerResults = await Promise.allSettled(Array.from({ length: maxConcurrency }, (_, id) => runner(id)))
  const aborted = runnerResults.find(result => result.status === 'rejected' && result.reason?.name === 'AbortError')
  if (aborted) throw aborted.reason
  const rejected = runnerResults.find(result => result.status === 'rejected')
  if (rejected) throw rejected.reason
  return { results, errors, concurrency }
}
