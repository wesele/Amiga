const STORAGE_KEY = "amiga:achievement-recent";
const UNLOCKED_CACHE_KEY = "amiga:achievement-unlocked-cache";
const MAX_ENTRIES = 5;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function readEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function pruneEntries(entries, now = Date.now()) {
  return entries
    .filter((entry) => now - entry.unlockedAt < TTL_MS)
    .slice(0, MAX_ENTRIES);
}

export function recordAchievementUnlock(badgeId, now = Date.now()) {
  if (!badgeId) return;
  const entries = pruneEntries(readEntries(), now).filter((entry) => entry.badgeId !== badgeId);
  entries.unshift({ badgeId, unlockedAt: now });
  writeEntries(entries.slice(0, MAX_ENTRIES));
}

export function loadRecentUnlocks(now = Date.now()) {
  const entries = pruneEntries(readEntries(), now);
  if (entries.length !== readEntries().length) {
    writeEntries(entries);
  }
  return entries;
}

export function loadUnlockedCache() {
  try {
    const raw = localStorage.getItem(UNLOCKED_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveUnlockedCache(unlockedIds) {
  localStorage.setItem(UNLOCKED_CACHE_KEY, JSON.stringify(unlockedIds));
}

/** Diff current unlocked badges against cache; record and persist new unlocks. */
export function syncRecentUnlocks(unlockedIds, now = Date.now()) {
  const prev = new Set(loadUnlockedCache());
  const next = [...unlockedIds];
  for (const id of next) {
    if (!prev.has(id)) {
      recordAchievementUnlock(id, now);
    }
  }
  saveUnlockedCache(next);
  return loadRecentUnlocks(now);
}