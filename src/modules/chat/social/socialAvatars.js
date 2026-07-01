const STORAGE_KEY = "idioma.social.avatars";

function readStore() {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function rememberSocialAvatar(userId, avatar) {
  if (!userId || !avatar) return;
  const store = readStore();
  store[userId] = avatar;
  writeStore(store);
}

export function rememberSocialAvatars(entries = {}) {
  const store = readStore();
  let changed = false;
  for (const [userId, avatar] of Object.entries(entries)) {
    if (!userId || !avatar || store[userId] === avatar) continue;
    store[userId] = avatar;
    changed = true;
  }
  if (changed) writeStore(store);
}

export function getCachedSocialAvatar(userId, fallback = "😊") {
  if (!userId) return fallback;
  return readStore()[userId] || fallback;
}