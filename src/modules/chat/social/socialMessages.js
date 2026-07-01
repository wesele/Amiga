import { readLocalJson, writeLocalJson } from "@/shared/localJsonStore.js";

const STORAGE_KEY = "idioma.social.messages";

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
  const store = readLocalJson(STORAGE_KEY);
  return sortMessages(store[contactKey] || []);
}

export function saveSocialMessages(contactKey, messages) {
  if (!contactKey) return;
  const store = readLocalJson(STORAGE_KEY);
  store[contactKey] = dedupeMessages(messages);
  writeLocalJson(STORAGE_KEY, store);
}

export function appendSocialMessage(contactKey, message) {
  if (!contactKey || !message?.text) return;
  const existing = getSocialMessages(contactKey);
  saveSocialMessages(contactKey, dedupeMessages([...existing, message]));
}

export function clearSocialMessages(contactKey) {
  if (!contactKey) return;
  const store = readLocalJson(STORAGE_KEY);
  delete store[contactKey];
  writeLocalJson(STORAGE_KEY, store);
}

export function mergeSocialMessages(contactKey, incoming = []) {
  if (!contactKey) return [];
  const merged = dedupeMessages([...getSocialMessages(contactKey), ...incoming]);
  saveSocialMessages(contactKey, merged);
  return merged;
}