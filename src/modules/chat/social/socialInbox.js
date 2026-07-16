import {
  createSocialSocket,
  getSocialConfig,
  pullOfflineMessages,
  shouldDisconnectSocialSocketOnHidden,
} from "./socialService.js";
import { rememberSocialAvatar } from "./socialAvatars.js";
import { appendSocialMessage, mergeSocialMessages } from "./socialMessages.js";
import { getActiveSocialContact, getSocialContactKey, updateSocialPreview } from "./socialPreview.js";

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

const recentIncoming = new Set();
const RECENT_INCOMING_MAX = 500;

function rememberIncoming(contactKey, normalized) {
  const key = `${contactKey}|${normalized.id}`;
  if (recentIncoming.has(key)) return false;
  recentIncoming.add(key);
  if (recentIncoming.size > RECENT_INCOMING_MAX) {
    const entries = [...recentIncoming];
    recentIncoming.clear();
    entries.slice(-250).forEach((k) => recentIncoming.add(k));
  }
  return true;
}

function handleIncomingMessage(payload, userId) {
  const normalized = normalizeIncoming(payload);
  const contactKey = payload.mode === "direct"
    ? getSocialContactKey("social-direct", payload.senderId)
    : getSocialContactKey("social-public");
  if (!rememberIncoming(contactKey, normalized)) return;
  appendSocialMessage(contactKey, normalized);
  updateSocialPreview({
    contactKey,
    text: normalized.text,
    createdAt: normalized.createdAt,
    senderId: normalized.senderId,
    currentUserId: userId,
    messageId: normalized.id,
    markUnread: contactKey !== getActiveSocialContact(),
  });
}

export function startSocialInboxListener({ userId, friends = [] }) {
  const sockets = [];
  const reconnectTimers = [];
  let offlineTimer = null;
  let stopped = false;

  function clearReconnectTimers() {
    for (const timer of reconnectTimers.splice(0)) {
      clearTimeout(timer);
    }
  }

  function connectSocketWithReconnect(config, { mode, peerId = "", onMessage }) {
    let reconnectAttempt = 0;
    let reconnectTimer = null;

    function clearReconnectTimer() {
      if (!reconnectTimer) return;
      clearTimeout(reconnectTimer);
      const idx = reconnectTimers.indexOf(reconnectTimer);
      if (idx >= 0) reconnectTimers.splice(idx, 1);
      reconnectTimer = null;
    }

    function scheduleReconnect() {
      if (stopped || reconnectTimer) return;
      if (typeof document !== "undefined"
        && document.visibilityState === "hidden"
        && shouldDisconnectSocialSocketOnHidden()) {
        return;
      }
      reconnectAttempt += 1;
      const delay = Math.min(1000 * 2 ** (reconnectAttempt - 1), 15000);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        open();
      }, delay);
      reconnectTimers.push(reconnectTimer);
    }

    function open() {
      if (stopped) return;
      const socket = createSocialSocket(config, {
        userId,
        mode,
        peerId,
        onOpen: () => {
          reconnectAttempt = 0;
        },
        onClose: () => {
          const idx = sockets.indexOf(socket);
          if (idx >= 0) sockets.splice(idx, 1);
          if (!stopped) scheduleReconnect();
        },
        onError: () => {},
        onMessage,
      });
      sockets.push(socket);
    }

    open();
  }

  function connectPublicSocket(config) {
    connectSocketWithReconnect(config, {
      mode: "public",
      peerId: "",
      onMessage: (payload) => {
        if (!isIncomingMessage(payload, userId)) return;
        handleIncomingMessage({ ...payload, mode: "public" }, userId);
      },
    });
  }

  function connectDirectSockets(config) {
    for (const friend of friends) {
      const peerId = friend.friendUserId || friend.peerId;
      if (!peerId) continue;
      connectSocketWithReconnect(config, {
        mode: "direct",
        peerId,
        onMessage: (payload) => {
          if (!isIncomingMessage(payload, userId)) return;
          handleIncomingMessage({ ...payload, mode: "direct" }, userId);
        },
      });
    }
  }

  async function pollOffline(config) {
    if (stopped) return;
    try {
      const offline = await pullOfflineMessages(config, userId);
      for (const item of offline?.items || []) {
        if (!item?.content || !item?.senderId || item.senderId === userId) continue;
        const normalized = {
          id: item.id ? String(item.id) : `${item.senderId}-${item.createdAt}-${item.content}`,
          senderId: item.senderId,
          text: item.content,
          createdAt: item.createdAt,
        };
        const contactKey = getSocialContactKey("social-direct", item.senderId);
        mergeSocialMessages(contactKey, [normalized]);
        updateSocialPreview({
          contactKey,
          text: normalized.text,
          createdAt: normalized.createdAt,
          senderId: normalized.senderId,
          currentUserId: userId,
          messageId: normalized.id,
          markUnread: contactKey !== getActiveSocialContact(),
        });
      }
    } catch {
      /* ignore polling errors */
    }
  }

  function handleVisibility() {
    if (typeof document === "undefined") return;
    if (document.visibilityState === "visible" && !stopped) {
      const configPromise = getSocialConfig();
      configPromise.then((config) => {
        if (stopped) return;
        if (sockets.length === 0) {
          connectPublicSocket(config);
          connectDirectSockets(config);
        }
      }).catch((e) => {
        console.debug("Social inbox reconnect on visibility failed", e);
      });
    }
  }

  async function start() {
    try {
      const config = await getSocialConfig();
      if (stopped) return;
      connectPublicSocket(config);
      if (stopped) return;
      connectDirectSockets(config);
      if (stopped) return;
      await pollOffline(config);
      if (stopped) return;
      offlineTimer = setInterval(() => {
        pollOffline(config).catch((e) => {
          console.debug("Social inbox offline poll failed", e);
        });
      }, 15000);
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", handleVisibility);
      }
    } catch (e) {
      /* inbox is best-effort */
      console.debug("Social inbox start failed", e);
    }
  }

  function stop() {
    stopped = true;
    clearReconnectTimers();
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

  start().catch((e) => {
    console.debug("Social inbox start rejected", e);
  });
  return stop;
}
