import { eventBus } from "@/shared/eventBus.js";
import { readLocalJson, writeLocalJson } from "@/shared/localJsonStore.js";

export const SOCIAL_PREVIEW_UPDATED = "social-preview-updated";
export const SOCIAL_TOTAL_UNREAD_CHANGED = "social-total-unread-changed";

const STORAGE_KEY = "idioma.social.previews";

/** Contact key for the conversation currently open in SocialChatPage, if any. */
let activeSocialContactKey = null;

/** Prevents duplicate unread increments when the same message is delivered twice. */
const recentUnreadIncrements = new Set();
const RECENT_UNREAD_MAX = 500;

function messageFingerprint({ messageId, senderId, createdAt, text }) {
  if (messageId) return String(messageId);
  return `${senderId}|${createdAt}|${text}`;
}

function trimRecentSet(set, maxSize, keepCount) {
  if (set.size <= maxSize) return;
  const entries = [...set];
  set.clear();
  entries.slice(-keepCount).forEach((key) => set.add(key));
}

export function _resetSocialPreviewDedupForTests() {
  recentUnreadIncrements.clear();
}

export function setActiveSocialContact(contactKey) {
  activeSocialContactKey = contactKey || null;
}

export function getActiveSocialContact() {
  return activeSocialContactKey;
}

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
  messageId = "",
}) {
  if (!contactKey || !text) return;
  const store = readLocalJson(STORAGE_KEY);
  const previous = store[contactKey] || {};
  const isOwn = senderId && senderId === currentUserId;
  let incrementUnread = markUnread && !isOwn;
  if (incrementUnread) {
    const fingerprint = messageFingerprint({ messageId, senderId, createdAt, text });
    const dedupeKey = `${contactKey}|${fingerprint}`;
    if (recentUnreadIncrements.has(dedupeKey)) {
      incrementUnread = false;
    } else {
      recentUnreadIncrements.add(dedupeKey);
      trimRecentSet(recentUnreadIncrements, RECENT_UNREAD_MAX, 250);
    }
  }
  store[contactKey] = {
    text,
    createdAt: createdAt || new Date().toISOString(),
    unread: incrementUnread
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