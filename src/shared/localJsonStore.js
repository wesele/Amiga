function cloneFallback(fallback) {
  if (fallback === null || typeof fallback !== "object") return fallback;
  try {
    return structuredClone(fallback);
  } catch {
    return Array.isArray(fallback) ? [...fallback] : { ...fallback };
  }
}

export function readLocalJson(key, fallback = {}) {
  try {
    if (typeof localStorage === "undefined") return cloneFallback(fallback);
    const raw = localStorage.getItem(key);
    if (!raw) return cloneFallback(fallback);
    return JSON.parse(raw);
  } catch {
    return cloneFallback(fallback);
  }
}

export function writeLocalJson(key, value) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function updateLocalJson(key, updater, fallback = {}) {
  const current = readLocalJson(key, fallback);
  const next = updater(current);
  writeLocalJson(key, next ?? current);
}