import { getCurrentUser } from "@/shared/api.js";

const SOCIAL_API_BASE_URL = "https://amiga-chat-social.wh1018.workers.dev";

function trimSlash(value) {
  return (value || "").trim().replace(/\/+$/, "");
}

function toWebSocketBase(value) {
  const base = trimSlash(value);
  if (!base) return "";
  if (base.startsWith("ws://") || base.startsWith("wss://")) return base;
  if (base.startsWith("https://")) return `wss://${base.slice("https://".length)}`;
  if (base.startsWith("http://")) return `ws://${base.slice("http://".length)}`;
  return base;
}

export async function getSocialConfig() {
  return {
    apiBaseUrl: trimSlash(SOCIAL_API_BASE_URL),
    wsBaseUrl: toWebSocketBase(SOCIAL_API_BASE_URL),
  };
}

export async function getSocialUserId() {
  try {
    const user = await getCurrentUser();
    const nickname = (user?.nickname || "").trim();
    return nickname || user?.id || "learner";
  } catch {
    return "learner";
  }
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
