import { getCurrentUser } from "@/shared/backend/user.js";
import { getSocialConfigDefaults, toWebSocketBase, trimSlash } from "@/shared/socialConfig.js";

export async function getSocialConfig() {
  return getSocialConfigDefaults();
}

const ANONYMOUS_ID_KEY = "idioma.social.anonymousId";

function readStoredAnonymousId() {
  try {
    if (typeof localStorage === "undefined") return "";
    return localStorage.getItem(ANONYMOUS_ID_KEY) || "";
  } catch {
    return "";
  }
}

function writeStoredAnonymousId(value) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(ANONYMOUS_ID_KEY, value);
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function generateAnonymousId() {
  const cryptoObj = typeof globalThis !== "undefined" ? globalThis.crypto : null;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return `anon-${cryptoObj.randomUUID()}`;
  }
  return `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateAnonymousId() {
  const existing = readStoredAnonymousId();
  if (existing) return existing;
  const next = generateAnonymousId();
  writeStoredAnonymousId(next);
  return next;
}

export async function getSocialUserId() {
  try {
    const user = await getCurrentUser();
    const nickname = (user?.nickname || "").trim();
    if (nickname) return nickname;
    if (user?.id) return user.id;
    return getOrCreateAnonymousId();
  } catch {
    return getOrCreateAnonymousId();
  }
}

export function shouldDisconnectSocialSocketOnHidden(userAgent = navigator.userAgent) {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent || "");
}

async function requestJson(config, path, init = {}) {
  const base = trimSlash(config?.apiBaseUrl);
  if (!base) {
    throw new Error("social-api-not-configured");
  }

  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.error) {
        message = payload.error;
      }
    } catch {
      // Ignore body parsing issues.
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function registerSocialUser(config, user) {
  return requestJson(config, "/api/users/register", {
    method: "POST",
    body: JSON.stringify({
      id: user.id,
      avatar: user.avatar || "",
      nativeLanguage: user.native_language || "",
    }),
  });
}

export async function getSocialStats(config) {
  return requestJson(config, "/api/stats");
}

export async function getSocialFriendships(config, userId) {
  return requestJson(config, `/api/friends?userId=${encodeURIComponent(userId)}`);
}

export async function getPendingFriendRequests(config, userId) {
  return requestJson(config, `/api/friends/pending?userId=${encodeURIComponent(userId)}`);
}

export async function sendFriendRequest(config, fromUserId, toUserId) {
  return requestJson(config, "/api/friends/request", {
    method: "POST",
    body: JSON.stringify({ fromUserId, toUserId }),
  });
}

export async function acceptFriendRequest(config, userId, fromUserId) {
  return requestJson(config, "/api/friends/accept", {
    method: "POST",
    body: JSON.stringify({ userId, fromUserId }),
  });
}

export async function removeFriend(config, userId, friendUserId) {
  return requestJson(config, "/api/friends/remove", {
    method: "POST",
    body: JSON.stringify({ userId, friendUserId }),
  });
}

export async function getSocialUserAvatars(config, userIds = []) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return {};
  try {
    const payload = await requestJson(
      config,
      `/api/users?ids=${encodeURIComponent(ids.join(","))}`,
    );
    const map = {};
    for (const item of payload?.items || []) {
      if (item?.id && item?.avatar) map[item.id] = item.avatar;
    }
    return map;
  } catch {
    return {};
  }
}

export async function pullOfflineMessages(config, userId) {
  return requestJson(config, `/api/messages/offline?userId=${encodeURIComponent(userId)}`);
}

export function createSocialSocket(config, { userId, mode, peerId, onMessage, onOpen, onClose, onError }) {
  const wsBaseUrl = toWebSocketBase(config?.wsBaseUrl);
  if (!wsBaseUrl) {
    throw new Error("social-ws-not-configured");
  }

  const url = new URL(`${wsBaseUrl}/ws`);
  url.searchParams.set("userId", userId);
  url.searchParams.set("mode", mode);
  if (peerId) {
    url.searchParams.set("peerId", peerId);
  }

  const socket = new WebSocket(url);
  socket.addEventListener("open", () => onOpen?.());
  socket.addEventListener("close", () => onClose?.());
  socket.addEventListener("error", (event) => onError?.(event));
  socket.addEventListener("message", (event) => {
    try {
      onMessage?.(JSON.parse(event.data));
    } catch {
      onMessage?.({ type: "system", text: event.data });
    }
  });
  return socket;
}
