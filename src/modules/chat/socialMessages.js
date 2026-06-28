const STORAGE_KEY = "idioma.social.messages";

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

function sortMessages(items) {
  return [...items].sort((a, b) => {
    const left = Date.parse(a.createdAt || "") || 0;
    const right = Date.parse(b.createdAt || "") || 0;
    return left - right;
  });
}

function dedupeMessages(items) {
  const seen = new Set();
  const merged = [];
  for (const item of items) {
    const key = item.id || `${item.senderId}-${item.createdAt}-${item.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...item, id: item.id || key });
  }
  return sortMessages(merged);
}

export function getSocialMessages(contactKey) {
  if (!contactKey) return [];
  const store = readStore();
  return sortMessages(store[contactKey] || []);
}

export function saveSocialMessages(contactKey, messages) {
  if (!contactKey) return;
  const store = readStore();
  store[contactKey] = dedupeMessages(messages);
  writeStore(store);
}

export function appendSocialMessage(contactKey, message) {
  if (!contactKey || !message?.text) return;
  const existing = getSocialMessages(contactKey);
  saveSocialMessages(contactKey, dedupeMessages([...existing, message]));
}

export function clearSocialMessages(contactKey) {
  if (!contactKey) return;
  const store = readStore();
  delete store[contactKey];
  writeStore(store);
}

export function mergeSocialMessages(contactKey, incoming = []) {
  if (!contactKey) return [];
  const merged = dedupeMessages([...getSocialMessages(contactKey), ...incoming]);
  saveSocialMessages(contactKey, merged);
  return merged;
}