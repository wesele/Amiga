const queues = new Map()
const errors = new Map()

export function enqueueJsonSave(type, data) {
  const previous = queues.get(type) || Promise.resolve()
  const payload = JSON.stringify(data)
  const current = previous.catch(() => {}).then(async () => {
    const response = await fetch(`/api/data/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    })
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}))
      throw new Error(detail.error || `${type} 保存失败 (${response.status})`)
    }
    errors.delete(type)
  }).catch(error => {
    errors.set(type, error)
    console.warn(`[${type}] 保存失败:`, error.message)
    throw error
  })
  queues.set(type, current)
  const cleanup = () => {
    if (queues.get(type) === current) queues.delete(type)
  }
  current.then(cleanup, cleanup)
  return current
}

export function flushJsonSave(type) {
  return queues.get(type) || Promise.resolve()
}

export function getJsonSaveError(type) {
  return errors.get(type) || null
}
