class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  on(event, fn) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const handlers = this._listeners.get(event);
    if (!handlers) return;
    const idx = handlers.indexOf(fn);
    if (idx !== -1) handlers.splice(idx, 1);
  }

  emit(event, ...args) {
    const handlers = this._listeners.get(event);
    if (!handlers) return;
    handlers.forEach((fn) => fn(...args));
  }

  once(event, fn) {
    const wrapper = (...args) => {
      fn(...args);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }
}

export const eventBus = new EventBus();
