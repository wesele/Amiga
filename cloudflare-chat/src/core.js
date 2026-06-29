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

export function createMemoryRepository() {
  const users = new Map();
  const friendships = [];
  const offlineMessages = [];
  const syncSnapshots = new Map();
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
    async pushSyncSnapshot({ userId, payload, updatedAt, deviceId }) {
      syncSnapshots.set(userId, { userId, payload, updatedAt, deviceId });
      return { ok: true };
    },
  };
}
