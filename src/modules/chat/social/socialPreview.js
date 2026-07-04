import { eventBus } from "@/shared/eventBus.js";
import { readLocalJson, writeLocalJson } from "@/shared/localJsonStore.js";

export const SOCIAL_PREVIEW_UPDATED = "social-preview-updated";

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

export function hasUnreadSocialPreview() {
  const store = readLocalJson(STORAGE_KEY);
  return Object.values(store).some((preview) => Boolean(preview?.unread));
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
    unread: markUnread && !isOwn ? true : Boolean(previous.unread),
  };
  writeLocalJson(STORAGE_KEY, store);
  eventBus.emit(SOCIAL_PREVIEW_UPDATED, { contactKey, unread: store[contactKey].unread });
}

export function clearSocialUnread(contactKey) {
  if (!contactKey) return;
  const store = readLocalJson(STORAGE_KEY);
  if (!store[contactKey]?.unread) return;
  store[contactKey] = { ...store[contactKey], unread: false };
  writeLocalJson(STORAGE_KEY, store);
  eventBus.emit(SOCIAL_PREVIEW_UPDATED, { contactKey, unread: false });
}

export function clearSocialPreview(contactKey) {
  if (!contactKey) return;
  const store = readLocalJson(STORAGE_KEY);
  if (!store[contactKey]) return;
  delete store[contactKey];
  writeLocalJson(STORAGE_KEY, store);
  eventBus.emit(SOCIAL_PREVIEW_UPDATED, { contactKey, unread: false });
}
