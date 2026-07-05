import { eventBus } from "@/shared/eventBus.js";
import { readLocalJson, writeLocalJson } from "@/shared/localJsonStore.js";

export const SOCIAL_PREVIEW_UPDATED = "social-preview-updated";
export const SOCIAL_TOTAL_UNREAD_CHANGED = "social-total-unread-changed";

const STORAGE_KEY = "idioma.social.previews";

export function getSocialContactKey(contactType, peerId = "") {
  if (contactType === "social-public") return "public";
  if (contactType === "social-direct" && peerId) return `direct:${peerId}`;
  return "";
}

export function getSocialPreview(contactKey) {
  if (!contactKey) return null;
  const store = readLocalJson(STORAGE_KEY);
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
  const store = readLocalJson(STORAGE_KEY);
  const previous = store[contactKey] || {};
  const isOwn = senderId && senderId === currentUserId;
  store[contactKey] = {
    text,
    createdAt: createdAt || new Date().toISOString(),
    unread: markUnread && !isOwn
      ? (typeof previous.unread === "number" ? previous.unread : 0) + 1
      : (typeof previous.unread === "number" ? previous.unread : 0),
  };
  writeLocalJson(STORAGE_KEY, store);
  eventBus.emit(SOCIAL_PREVIEW_UPDATED, {
    contactKey,
    unread: store[contactKey].unread,
    unreadCount: store[contactKey].unread,
  });
  emitTotalUnread(store);
}

export function clearSocialUnread(contactKey) {
  if (!contactKey) return;
  const store = readLocalJson(STORAGE_KEY);
  if (!store[contactKey]) return;
  store[contactKey] = { ...store[contactKey], unread: 0 };
  writeLocalJson(STORAGE_KEY, store);
  eventBus.emit(SOCIAL_PREVIEW_UPDATED, { contactKey, unread: 0, unreadCount: 0 });
  emitTotalUnread(store);
}

export function getTotalUnreadCount() {
  const store = readLocalJson(STORAGE_KEY);
  return Object.values(store).reduce((sum, item) => {
    return sum + (typeof item.unread === "number" ? item.unread : 0);
  }, 0);
}

function emitTotalUnread(store) {
  const total = Object.values(store).reduce((sum, item) => {
    return sum + (typeof item.unread === "number" ? item.unread : 0);
  }, 0);
  eventBus.emit(SOCIAL_TOTAL_UNREAD_CHANGED, total);
}

export function clearSocialPreview(contactKey) {
  if (!contactKey) return;
  const store = readLocalJson(STORAGE_KEY);
  if (!store[contactKey]) return;
  delete store[contactKey];
  writeLocalJson(STORAGE_KEY, store);
  eventBus.emit(SOCIAL_PREVIEW_UPDATED, { contactKey, unread: false, unreadCount: 0 });
  emitTotalUnread(store);
}