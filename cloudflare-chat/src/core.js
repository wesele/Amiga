export function createConnectionState() {
  return {
    users: new Map(),
  };
}

function getUserConnections(state, userId) {
  if (!state.users.has(userId)) {
    state.users.set(userId, new Set());
  }
  return state.users.get(userId);
}

export function registerSocket(state, userId, socket, meta = {}) {
  const entry = { socket, meta };
  getUserConnections(state, userId).add(entry);
  return entry;
}

export function removeSocket(state, userId, entry) {
  const group = state.users.get(userId);
  if (!group) return;
  group.delete(entry);
  if (group.size === 0) {
    state.users.delete(userId);
  }
}

export function isUserOnline(state, userId) {
  return (state.users.get(userId)?.size || 0) > 0;
}

function emit(socket, payload) {
  socket.send(JSON.stringify(payload));
}

export function broadcastPublicMessage(state, senderId, text, createdAt) {
  for (const [userId, entries] of state.users) {
    if (userId === senderId) continue;
    for (const entry of entries) {
      emit(entry.socket, {
        type: "message",
        mode: "public",
        senderId,
        text,
        createdAt,
      });
    }
  }
}

export async function deliverDirectMessage(state, repository, { senderId, receiverId, text, createdAt }) {
  if (isUserOnline(state, receiverId)) {
    const entries = state.users.get(receiverId) || [];
    for (const entry of entries) {
      emit(entry.socket, {
        type: "message",
        mode: "direct",
        senderId,
        text,
        createdAt,
      });
    }
    return { delivered: true, storedOffline: false };
  }

  await repository.storeOfflineMessage({ senderId, receiverId, content: text, createdAt });
  return { delivered: false, storedOffline: true };
}

export function notifyUser(state, userId, payload) {
  const entries = state.users.get(userId) || [];
  for (const entry of entries) {
    emit(entry.socket, payload);
  }
}

export function validateSyncPayload(payload) {
  if (typeof payload !== "string" || payload.length === 0) {
    return { ok: false, error: "invalid-sync-payload" };
  }
  // Keep a defensive application-level ceiling while allowing multi-year
  // daily-reading histories. D1 stores the payload in bounded chunks.
  if (payload.length > 8_000_000) {
    return { ok: false, error: "sync-payload-too-large" };
  }
  try {
    const parsed = JSON.parse(payload);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "invalid-sync-payload" };
    }
    if (!Number.isInteger(parsed.version) || parsed.version < 1) {
      return { ok: false, error: "invalid-sync-version" };
    }
    if (
      !Array.isArray(parsed.users)
      || !parsed.users.some((user) => typeof user?.nickname === "string" && user.nickname.trim())
    ) {
      return { ok: false, error: "sync-payload-missing-user" };
    }
    return { ok: true, version: parsed.version };
  } catch {
    return { ok: false, error: "invalid-sync-json" };
  }
}

export function splitSyncPayload(payload, chunkCharacters = 100_000) {
  const chunks = [];
  for (let offset = 0; offset < payload.length; offset += chunkCharacters) {
    chunks.push(payload.slice(offset, offset + chunkCharacters));
  }
  return chunks.length > 0 ? chunks : [""];
}

export function createMemoryRepository() {
  const users = new Map();
  const friendships = [];
  const offlineMessages = [];
  const syncSnapshots = new Map();
  const syncHistory = new Map();
  let nextFriendshipId = 1;
  let nextOfflineId = 1;

  return {
    async registerUser({ id, avatar = "", nativeLanguage = "" }) {
      users.set(id, { id, avatar, nativeLanguage });
      return { id };
    },
    async countUsers() {
      return users.size;
    },
    async sendFriendRequest({ fromUserId, toUserId }) {
      const existing = friendships.find(
        (item) => item.requesterId === fromUserId && item.addresseeId === toUserId,
      );
      if (existing) {
        existing.status = "PENDING";
        existing.updatedAt = new Date().toISOString();
        return existing;
      }
      const row = {
        id: nextFriendshipId++,
        requesterId: fromUserId,
        addresseeId: toUserId,
        status: "PENDING",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      friendships.push(row);
      return row;
    },
    async acceptFriendRequest({ userId, fromUserId }) {
      const friendship = friendships.find(
        (item) => item.requesterId === fromUserId && item.addresseeId === userId,
      );
      if (!friendship) {
        throw new Error("friend-request-not-found");
      }
      friendship.status = "ACCEPTED";
      friendship.updatedAt = new Date().toISOString();
      return friendship;
    },
    async getPendingFriendRequests(userId) {
      return friendships
        .filter((item) => item.addresseeId === userId && item.status === "PENDING")
        .map((item) => ({
          fromUserId: item.requesterId,
          createdAt: item.createdAt,
        }));
    },
    async getAcceptedFriends(userId) {
      return friendships
        .filter((item) => item.status === "ACCEPTED" && (item.requesterId === userId || item.addresseeId === userId))
        .map((item) => ({
          friendUserId: item.requesterId === userId ? item.addresseeId : item.requesterId,
          updatedAt: item.updatedAt,
        }));
    },
    async storeOfflineMessage({ senderId, receiverId, content, createdAt }) {
      offlineMessages.push({
        id: nextOfflineId++,
        senderId,
        receiverId,
        content,
        createdAt,
      });
    },
    async pullOfflineMessages(userId) {
      const items = offlineMessages.filter((item) => item.receiverId === userId);
      for (const item of items) {
        offlineMessages.splice(offlineMessages.indexOf(item), 1);
      }
      return items;
    },
    async cleanupOfflineMessages(cutoffIso) {
      const cutoff = Date.parse(cutoffIso);
      let removed = 0;
      for (let i = offlineMessages.length - 1; i >= 0; i -= 1) {
        if (Date.parse(offlineMessages[i].createdAt) < cutoff) {
          offlineMessages.splice(i, 1);
          removed += 1;
        }
      }
      return removed;
    },
    async pullSyncSnapshot(userId) {
      return syncSnapshots.get(userId) || null;
    },
    async pushSyncSnapshot({ userId, payload, updatedAt, deviceId, baseUpdatedAt }) {
      const existing = syncSnapshots.get(userId);
      if (existing) {
        if (baseUpdatedAt && existing.updatedAt !== baseUpdatedAt) {
          return { conflict: true };
        }
        if (Date.parse(existing.updatedAt) > Date.parse(updatedAt)) {
          return { conflict: true };
        }
      }
      if (existing) {
        const history = syncHistory.get(userId) || [];
        history.unshift(existing);
        syncHistory.set(userId, history.slice(0, 5));
      }
      syncSnapshots.set(userId, { userId, payload, updatedAt, deviceId });
      return { ok: true };
    },
    async getSyncHistory(userId) {
      return syncHistory.get(userId) || [];
    },
  };
}
