import { eventBus } from "@/shared/eventBus.js";

export const SOCIAL_PREVIEW_UPDATED = "social-preview-updated";

const STORAGE_KEY = "idioma.social.previews";

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

export function getSocialContactKey(contactType, peerId = "") {
  if (contactType === "social-public") return "public";
  if (contactType === "social-direct" && peerId) return `direct:${peerId}`;
  return "";
}

export function getSocialPreview(contactKey) {
  if (!contactKey) return null;
  const store = readStore();
  return store[contactKey] || null;
}

export function updateSocialPreview({
  contactKey,
  text,
  createdAt,
  senderId,
  currentUserId,
  markUnread = true,
}) {
  if (!contactKey || !text) return;
  const store = readStore();
  const previous = store[contactKey] || {};
  const isOwn = senderId && senderId === currentUserId;
  store[contactKey] = {
    text,
    createdAt: createdAt || new Date().toISOString(),
    unread: markUnread && !isOwn ? true : Boolean(previous.unread),
  };
  writeStore(store);
  eventBus.emit(SOCIAL_PREVIEW_UPDATED, { contactKey, unread: store[contactKey].unread });
}

export function clearSocialUnread(contactKey) {
  if (!contactKey) return;
  const store = readStore();
  if (!store[contactKey]?.unread) return;
  store[contactKey] = { ...store[contactKey], unread: false };
  writeStore(store);
  eventBus.emit(SOCIAL_PREVIEW_UPDATED, { contactKey, unread: false });
}

export function clearSocialPreview(contactKey) {
  if (!contactKey) return;
  const store = readStore();
  if (!store[contactKey]) return;
  delete store[contactKey];
  writeStore(store);
  eventBus.emit(SOCIAL_PREVIEW_UPDATED, { contactKey, unread: false });
}