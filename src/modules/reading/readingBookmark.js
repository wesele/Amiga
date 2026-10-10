import { readLocalJson, updateLocalJson } from "@/shared/localJsonStore.js";

const BOOKMARKS_STORAGE_KEY = "amiga_reading_bookmarks";

function getStorageKey(articleId, isImported = true) {
  return `${isImported ? "imported" : "article"}_${articleId}`;
}

export function getReadingBookmark(articleId, isImported = true) {
  if (articleId === undefined || articleId === null) return null;
  const store = readLocalJson(BOOKMARKS_STORAGE_KEY, {});
  const entry = store[getStorageKey(articleId, isImported)];
  if (!entry || typeof entry.pidx !== "number") return null;
  return entry;
}

export function setReadingBookmark(articleId, { pidx, time }, isImported = true) {
  if (articleId === undefined || articleId === null || typeof pidx !== "number") return null;
  const entry = {
    pidx,
    time: typeof time === "number" ? time : 0,
    updatedAt: Date.now(),
  };
  updateLocalJson(BOOKMARKS_STORAGE_KEY, (store) => ({
    ...(store || {}),
    [getStorageKey(articleId, isImported)]: entry,
  }));
  return entry;
}

export function clearReadingBookmark(articleId, isImported = true) {
  if (articleId === undefined || articleId === null) return;
  updateLocalJson(BOOKMARKS_STORAGE_KEY, (store) => {
    if (!store) return {};
    const next = { ...store };
    delete next[getStorageKey(articleId, isImported)];
    return next;
  });
}

export function toggleReadingBookmark(articleId, { pidx, time }, isImported = true) {
  const current = getReadingBookmark(articleId, isImported);
  if (current && current.pidx === pidx) {
    clearReadingBookmark(articleId, isImported);
    return { saved: false, bookmark: null };
  }
  const saved = setReadingBookmark(articleId, { pidx, time }, isImported);
  return { saved: true, bookmark: saved };
}
