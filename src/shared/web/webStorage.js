const DB_NAME = "amiga-web";
const DB_VERSION = 1;
const STORE_NAME = "state";
const STATE_KEY = "main";

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function openDatabase(indexedDb) {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

export class WebStateStore {
  constructor({ indexedDb = globalThis.indexedDB, seed } = {}) {
    if (typeof seed !== "function") throw new TypeError("WebStateStore requires a seed factory");
    this.indexedDb = indexedDb;
    this.seed = seed;
    this.memory = null;
    this.dbPromise = null;
    this.queue = Promise.resolve();
  }

  async db() {
    if (!this.indexedDb) return null;
    if (!this.dbPromise) this.dbPromise = openDatabase(this.indexedDb);
    return this.dbPromise;
  }

  async readRaw() {
    const db = await this.db();
    if (!db) return this.memory == null ? null : clone(this.memory);
    const tx = db.transaction(STORE_NAME, "readonly");
    return requestResult(tx.objectStore(STORE_NAME).get(STATE_KEY));
  }

  async writeRaw(value) {
    const next = clone(value);
    const db = await this.db();
    if (!db) {
      this.memory = next;
      return;
    }
    const tx = db.transaction(STORE_NAME, "readwrite");
    await requestResult(tx.objectStore(STORE_NAME).put(next, STATE_KEY));
  }

  async get() {
    const existing = await this.readRaw();
    if (existing) return clone(existing);
    const seeded = this.seed();
    await this.writeRaw(seeded);
    return clone(seeded);
  }

  async update(mutator) {
    let output;
    const run = async () => {
      const state = await this.get();
      output = await mutator(state);
      await this.writeRaw(state);
    };

    const withBrowserLock = async () => {
      if (globalThis.navigator?.locks?.request) {
        return globalThis.navigator.locks.request("amiga-web-state", run);
      }
      return run();
    };

    this.queue = this.queue.then(withBrowserLock, withBrowserLock);
    await this.queue;
    return clone(output);
  }

  async reset() {
    const seeded = this.seed();
    await this.writeRaw(seeded);
    return clone(seeded);
  }
}

export function createMemoryStateStore(seed) {
  return new WebStateStore({ indexedDb: null, seed });
}
