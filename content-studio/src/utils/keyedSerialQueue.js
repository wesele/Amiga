export function createKeyedSerialQueue() {
  const queues = new Map()

  function enqueue(key, operation) {
    const previous = queues.get(key) || Promise.resolve()
    const current = previous.catch(() => {}).then(operation)
    queues.set(key, current)
    const cleanup = () => {
      if (queues.get(key) === current) queues.delete(key)
    }
    current.then(cleanup, cleanup)
    return current
  }

  return { enqueue }
}
