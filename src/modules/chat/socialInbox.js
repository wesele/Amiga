import {
  createSocialSocket,
  getSocialConfig,
  pullOfflineMessages,
  shouldDisconnectSocialSocketOnHidden,
} from "./socialService.js";
import { rememberSocialAvatar } from "./socialAvatars.js";
import { appendSocialMessage, mergeSocialMessages } from "./socialMessages.js";
import { getSocialContactKey, updateSocialPreview } from "./socialPreview.js";

function isIncomingMessage(payload, userId) {
  return payload?.type === "message"
    && payload?.text
    && payload?.senderId
    && payload.senderId !== userId;
}

function normalizeIncoming(payload) {
  if (payload?.senderAvatar) {
    rememberSocialAvatar(payload.senderId, payload.senderAvatar);
  }
  return {
    id: payload.id || `${payload.senderId}-${payload.createdAt}-${payload.text}`,
    senderId: payload.senderId,
    senderAvatar: payload.senderAvatar || "",
    text: payload.text,
    createdAt: payload.createdAt || new Date().toISOString(),
  };
}

function handleIncomingMessage(payload, userId) {
  const normalized = normalizeIncoming(payload);
  const contactKey = payload.mode === "direct"
    ? getSocialContactKey("social-direct", payload.senderId)
    : getSocialContactKey("social-public");
  appendSocialMessage(contactKey, normalized);
  updateSocialPreview({
    contactKey,
    text: normalized.text,
    createdAt: normalized.createdAt,
    senderId: normalized.senderId,
    currentUserId: userId,
  });
}

export function startSocialInboxListener({ userId, friends = [] }) {
  const sockets = [];
  let offlineTimer = null;
  let stopped = false;

  async function connectPublicSocket(config) {
    const socket = createSocialSocket(config, {
      userId,
      mode: "public",
      peerId: "",
      onMessage: (payload) => {
        if (isIncomingMessage(payload, userId)) {
          handleIncomingMessage({ ...payload, mode: "public" }, userId);
        }
      },
    });
    sockets.push(socket);
  }

  async function connectDirectSockets(config) {
    for (const friend of friends) {
      const peerId = friend.friendUserId || friend.peerId;
      if (!peerId) continue;
      const socket = createSocialSocket(config, {
        userId,
        mode: "direct",
        peerId,
        onMessage: (payload) => {
          if (isIncomingMessage(payload, userId)) {
            handleIncomingMessage({ ...payload, mode: "direct" }, userId);
          }
        },
      });
      sockets.push(socket);
    }
  }

  async function pollOffline(config) {
    if (stopped) return;
    try {
      const offline = await pullOfflineMessages(config, userId);
      for (const item of offline?.items || []) {
        if (!item?.content || !item?.senderId || item.senderId === userId) continue;
        const contactKey = getSocialContactKey("social-direct", item.senderId);
        const normalized = {
          id: item.id ? String(item.id) : `${item.senderId}-${item.createdAt}-${item.content}`,
          senderId: item.senderId,
          text: item.content,
          createdAt: item.createdAt,
        };
        mergeSocialMessages(contactKey, [normalized]);
        updateSocialPreview({
          contactKey,
          text: normalized.text,
          createdAt: normalized.createdAt,
          senderId: normalized.senderId,
          currentUserId: userId,
        });
      }
    } catch {
      /* ignore polling errors */
    }
  }

  function handleVisibility() {
    if (typeof document === "undefined") return;
    if (document.visibilityState === "hidden" && shouldDisconnectSocialSocketOnHidden()) {
      stop();
    }
  }

  async function start() {
    try {
      const config = await getSocialConfig();
      await connectPublicSocket(config);
      await connectDirectSockets(config);
      await pollOffline(config);
      offlineTimer = setInterval(() => {
        pollOffline(config).catch(() => {});
      }, 15000);
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", handleVisibility);
      }
    } catch {
      /* inbox is best-effort */
    }
  }

  function stop() {
    stopped = true;
    if (offlineTimer) {
      clearInterval(offlineTimer);
      offlineTimer = null;
    }
    for (const socket of sockets.splice(0)) {
      if (socket.readyState < 2) {
        socket.close(1000, "inbox-stop");
      }
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibility);
    }
  }

  start().catch(() => {});
  return stop;
}