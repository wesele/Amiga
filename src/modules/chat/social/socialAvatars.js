import { readLocalJson, writeLocalJson } from "@/shared/localJsonStore.js";

const STORAGE_KEY = "idioma.social.avatars";

export function rememberSocialAvatar(userId, avatar) {
  if (!userId || !avatar) return;
  const store = readLocalJson(STORAGE_KEY);
  store[userId] = avatar;
  writeLocalJson(STORAGE_KEY, store);
}

export function rememberSocialAvatars(entries = {}) {
  const store = readLocalJson(STORAGE_KEY);
  let changed = false;
  for (const [userId, avatar] of Object.entries(entries)) {
    if (!userId || !avatar || store[userId] === avatar) continue;
    store[userId] = avatar;
    changed = true;
  }
  if (changed) writeLocalJson(STORAGE_KEY, store);
}

export function getCachedSocialAvatar(userId, fallback = "😊") {
  if (!userId) return fallback;
  return readLocalJson(STORAGE_KEY)[userId] || fallback;
}