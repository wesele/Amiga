import { splitSyncPayload, validateSyncPayload } from "./core.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...(init.headers || {}),
    },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function badRequest(error, status = 400) {
  return json({ error }, { status });
}

function getRelayStub(env, key) {
  return env.CHAT_RELAY.get(env.CHAT_RELAY.idFromName(key));
}

function makeRepository(env) {
  return {
    async registerUser({ id, avatar = "", nativeLanguage = "" }) {
      await env.DB
        .prepare(
          `INSERT INTO users (id, avatar, native_language, updated_at)
           VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO UPDATE SET
             avatar = excluded.avatar,
             native_language = excluded.native_language,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(id, avatar, nativeLanguage)
        .run();
      return { id };
    },
    async countUsers() {
      const row = await env.DB.prepare("SELECT COUNT(1) AS count FROM users").first();
      return row?.count || 0;
    },
    async sendFriendRequest({ fromUserId, toUserId }) {
      await env.DB
        .prepare(
          `INSERT INTO friendships (requester_id, addressee_id, status, updated_at)
           VALUES (?1, ?2, 'PENDING', CURRENT_TIMESTAMP)
           ON CONFLICT(requester_id, addressee_id) DO UPDATE SET
             status = 'PENDING',
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(fromUserId, toUserId)
        .run();
      return { ok: true };
    },
    async acceptFriendRequest({ userId, fromUserId }) {
      const result = await env.DB
        .prepare(
          `UPDATE friendships
           SET status = 'ACCEPTED', updated_at = CURRENT_TIMESTAMP
           WHERE requester_id = ?1 AND addressee_id = ?2 AND status = 'PENDING'`,
        )
        .bind(fromUserId, userId)
        .run();
      if (!result.meta?.changes) {
        throw new Error("friend-request-not-found");
      }
      return { ok: true };
    },
    async getPendingFriendRequests(userId) {
      const rows = await env.DB
        .prepare(
          `SELECT requester_id AS fromUserId, created_at AS createdAt
           FROM friendships
           WHERE addressee_id = ?1 AND status = 'PENDING'
           ORDER BY updated_at DESC`,
        )
        .bind(userId)
        .all();
      return rows.results || [];
    },
    async getUserAvatar(userId) {
      const row = await env.DB
        .prepare("SELECT avatar FROM users WHERE id = ?1")
        .bind(userId)
        .first();
      return row?.avatar || "";
    },
    async getUsersByIds(userIds = []) {
      const ids = [...new Set(userIds.filter(Boolean))];
      if (ids.length === 0) return [];
      const placeholders = ids.map((_, index) => `?${index + 1}`).join(", ");
      const rows = await env.DB
        .prepare(`SELECT id, avatar FROM users WHERE id IN (${placeholders})`)
        .bind(...ids)
        .all();
      return rows.results || [];
    },
    async areFriends(userId, friendUserId) {
      const row = await env.DB
        .prepare(
          `SELECT 1 AS ok
           FROM friendships
           WHERE status = 'ACCEPTED'
             AND ((requester_id = ?1 AND addressee_id = ?2)
               OR (requester_id = ?2 AND addressee_id = ?1))
           LIMIT 1`,
        )
        .bind(userId, friendUserId)
        .first();
      return Boolean(row?.ok);
    },
    async removeFriendship({ userId, friendUserId }) {
      const result = await env.DB
        .prepare(
          `DELETE FROM friendships
           WHERE status = 'ACCEPTED'
             AND ((requester_id = ?1 AND addressee_id = ?2)
               OR (requester_id = ?2 AND addressee_id = ?1))`,
        )
        .bind(userId, friendUserId)
        .run();
      if (!result.meta?.changes) {
        throw new Error("friendship-not-found");
      }
      return { ok: true };
    },
    async getAcceptedFriends(userId) {
      const rows = await env.DB
        .prepare(
          `SELECT
             CASE
               WHEN f.requester_id = ?1 THEN f.addressee_id
               ELSE f.requester_id
             END AS friendUserId,
             u.avatar AS friendAvatar,
             f.updated_at AS updatedAt
           FROM friendships f
           LEFT JOIN users u ON u.id = CASE
             WHEN f.requester_id = ?1 THEN f.addressee_id
             ELSE f.requester_id
           END
           WHERE f.status = 'ACCEPTED' AND (f.requester_id = ?1 OR f.addressee_id = ?1)
           ORDER BY f.updated_at DESC`,
        )
        .bind(userId)
        .all();
      return rows.results || [];
    },
    async storeOfflineMessage({ senderId, receiverId, content, createdAt }) {
      await env.DB
        .prepare(
          `INSERT INTO offline_messages (sender_id, receiver_id, content, created_at)
           VALUES (?1, ?2, ?3, ?4)`,
        )
        .bind(senderId, receiverId, content, createdAt)
        .run();
    },
    async pullOfflineMessages(userId) {
      const rows = await env.DB
        .prepare(
          `SELECT
             id,
             sender_id AS senderId,
             receiver_id AS receiverId,
             content,
             created_at AS createdAt
           FROM offline_messages
           WHERE receiver_id = ?1
           ORDER BY created_at ASC`,
        )
        .bind(userId)
        .all();
      await env.DB.prepare("DELETE FROM offline_messages WHERE receiver_id = ?1").bind(userId).run();
      return rows.results || [];
    },
    async cleanupOfflineMessages(cutoffIso) {
      const result = await env.DB
        .prepare("DELETE FROM offline_messages WHERE created_at < ?1")
        .bind(cutoffIso)
        .run();
      return result.meta?.changes || 0;
    },
    async pullSyncSnapshot(userId) {
      const head = await env.DB
        .prepare(
          `SELECT user_id AS userId, updated_at AS updatedAt, device_id AS deviceId,
                  snapshot_id AS snapshotId
           FROM user_sync_snapshot_heads WHERE user_id = ?1`,
        )
        .bind(userId)
        .first();
      if (!head) {
        const legacy = await env.DB
          .prepare(
            `SELECT user_id AS userId, payload, updated_at AS updatedAt, device_id AS deviceId
             FROM user_sync_snapshots WHERE user_id = ?1`,
          )
          .bind(userId)
          .first();
        return legacy || null;
      }

      const payload = await this.loadSyncSnapshotPayload(head.snapshotId);
      if (payload != null && validateSyncPayload(payload).ok) {
        return { ...head, payload };
      }

      // Current metadata or chunks may be damaged. Fall back to the newest
      // retained valid generation instead of making the whole backup unusable.
      const versions = await env.DB
        .prepare(
          `SELECT snapshot_id AS snapshotId, updated_at AS updatedAt, device_id AS deviceId
           FROM user_sync_snapshot_versions
           WHERE user_id = ?1
           ORDER BY updated_at DESC
           LIMIT 6`,
        )
        .bind(userId)
        .all();
      for (const version of versions.results || []) {
        const fallbackPayload = await this.loadSyncSnapshotPayload(version.snapshotId);
        if (fallbackPayload != null && validateSyncPayload(fallbackPayload).ok) {
          return { userId, payload: fallbackPayload, ...version };
        }
      }
      return null;
    },
    async loadSyncSnapshotPayload(snapshotId) {
      const rows = await env.DB
        .prepare(
          `SELECT payload_chunk AS payloadChunk
           FROM user_sync_snapshot_chunks
           WHERE snapshot_id = ?1
           ORDER BY chunk_index ASC`,
        )
        .bind(snapshotId)
        .all();
      if (!rows.results?.length) return null;
      return rows.results.map((row) => row.payloadChunk).join("");
    },
    async pushSyncSnapshot({ userId, payload, updatedAt, deviceId, baseUpdatedAt }) {
      const head = await env.DB
        .prepare(
          `SELECT user_id AS userId, updated_at AS updatedAt, device_id AS deviceId,
                  snapshot_id AS snapshotId
           FROM user_sync_snapshot_heads WHERE user_id = ?1`,
        )
        .bind(userId)
        .first();
      const existing = head || await env.DB
        .prepare(
          `SELECT user_id AS userId, payload, updated_at AS updatedAt, device_id AS deviceId
           FROM user_sync_snapshots WHERE user_id = ?1`,
        )
        .bind(userId)
        .first();
      if (existing) {
        if (!baseUpdatedAt || existing.updatedAt !== baseUpdatedAt) {
          return { conflict: true };
        }
        if (Date.parse(existing.updatedAt) > Date.parse(updatedAt)) {
          return { conflict: true };
        }
      }

      const snapshotId = crypto.randomUUID();
      const statements = [];

      // Preserve the pre-chunking legacy generation before replacing it.
      if (existing && !head && existing.payload) {
        const legacySnapshotId = crypto.randomUUID();
        statements.push(
          env.DB
            .prepare(
              `INSERT OR IGNORE INTO user_sync_snapshot_versions
                 (snapshot_id, user_id, updated_at, device_id)
               VALUES (?1, ?2, ?3, ?4)`,
            )
            .bind(legacySnapshotId, userId, existing.updatedAt, existing.deviceId),
        );
        splitSyncPayload(existing.payload).forEach((chunk, index) => {
          statements.push(
            env.DB
              .prepare(
                `INSERT OR IGNORE INTO user_sync_snapshot_chunks
                   (snapshot_id, chunk_index, payload_chunk)
                 VALUES (?1, ?2, ?3)`,
              )
              .bind(legacySnapshotId, index, chunk),
          );
        });
      }

      statements.push(
        env.DB
          .prepare(
            `INSERT INTO user_sync_snapshot_versions
               (snapshot_id, user_id, updated_at, device_id)
             VALUES (?1, ?2, ?3, ?4)`,
          )
          .bind(snapshotId, userId, updatedAt, deviceId),
      );
      splitSyncPayload(payload).forEach((chunk, index) => {
        statements.push(
          env.DB
            .prepare(
              `INSERT INTO user_sync_snapshot_chunks
                 (snapshot_id, chunk_index, payload_chunk)
               VALUES (?1, ?2, ?3)`,
            )
            .bind(snapshotId, index, chunk),
        );
      });

      if (head) {
        statements.push(
          env.DB
            .prepare(
              `UPDATE user_sync_snapshot_heads
               SET updated_at = ?1, device_id = ?2, snapshot_id = ?3
               WHERE user_id = ?4 AND updated_at = ?5`,
            )
            .bind(updatedAt, deviceId, snapshotId, userId, baseUpdatedAt),
        );
      } else {
        statements.push(
          env.DB
            .prepare(
              `INSERT INTO user_sync_snapshot_heads
                 (user_id, updated_at, device_id, snapshot_id)
               VALUES (?1, ?2, ?3, ?4)
               ON CONFLICT(user_id) DO NOTHING`,
            )
            .bind(userId, updatedAt, deviceId, snapshotId),
        );
      }

      const results = await env.DB.batch(statements);
      const currentWrite = results[results.length - 1];
      if (!currentWrite?.meta?.changes) {
        await env.DB.batch([
          env.DB.prepare("DELETE FROM user_sync_snapshot_chunks WHERE snapshot_id = ?1").bind(snapshotId),
          env.DB.prepare("DELETE FROM user_sync_snapshot_versions WHERE snapshot_id = ?1").bind(snapshotId),
        ]);
        return { conflict: true };
      }

      const obsolete = await env.DB
        .prepare(
          `SELECT snapshot_id AS snapshotId
           FROM user_sync_snapshot_versions
           WHERE user_id = ?1
           ORDER BY updated_at DESC
           LIMIT -1 OFFSET 6`,
        )
        .bind(userId)
        .all();
      for (const version of obsolete.results || []) {
        await env.DB.batch([
          env.DB
            .prepare("DELETE FROM user_sync_snapshot_chunks WHERE snapshot_id = ?1")
            .bind(version.snapshotId),
          env.DB
            .prepare("DELETE FROM user_sync_snapshot_versions WHERE snapshot_id = ?1")
            .bind(version.snapshotId),
        ]);
      }
      return { ok: true };
    },
  };
}

export class ChatRelay {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
  }

  async fetch(request) {
    const url = new URL(request.url);
    const upgrade = request.headers.get("Upgrade");
    if (upgrade && upgrade.toLowerCase() === "websocket") {
      return this.handleSocket(url);
    }

    if (request.method === "POST" && url.pathname === "/deliver-direct") {
      const body = await readJson(request);
      const delivered = this.broadcast({
        type: "message",
        mode: "direct",
        senderId: body.senderId,
        senderAvatar: body.senderAvatar || "",
        text: body.text,
        createdAt: body.createdAt,
      });
      if (!delivered) {
        const repository = makeRepository(this.env);
        await repository.storeOfflineMessage({
          senderId: body.senderId,
          receiverId: body.receiverId,
          content: body.text,
          createdAt: body.createdAt,
        });
      }
      return json({ delivered, storedOffline: !delivered });
    }

    if (request.method === "POST" && url.pathname === "/notify") {
      const payload = await readJson(request);
      const delivered = this.broadcast(payload);
      return json({ delivered });
    }

    return badRequest("not-found", 404);
  }

  handleSocket(url) {
    const mode = url.searchParams.get("mode");
    const userId = url.searchParams.get("userId");
    const peerId = url.searchParams.get("peerId") || "";
    if (!mode || !userId) {
      return badRequest("missing-user-or-mode");
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const entry = { userId, mode, peerId };
    this.sessions.set(server, entry);
    server.addEventListener("close", () => {
      this.sessions.delete(server);
    });
    server.addEventListener("message", (event) => {
      this.onSocketMessage(entry, event.data, server).catch((error) => {
        server.send(JSON.stringify({ type: "error", error: String(error?.message || error) }));
      });
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(payload, predicate = null) {
    let delivered = 0;
    for (const [socket, meta] of this.sessions.entries()) {
      if (predicate && !predicate(meta)) continue;
      socket.send(JSON.stringify(payload));
      delivered += 1;
    }
    return delivered;
  }

  async onSocketMessage(entry, rawData, server) {
    const payload = JSON.parse(rawData);
    const createdAt = payload.createdAt || new Date().toISOString();
    const repository = makeRepository(this.env);
    const senderAvatar = await repository.getUserAvatar(entry.userId);

    if (entry.mode === "public" && payload.mode === "public") {
      this.broadcast(
        {
          type: "message",
          mode: "public",
          senderId: entry.userId,
          senderAvatar,
          text: payload.text,
          createdAt,
        },
        (meta) => meta.userId !== entry.userId,
      );
      return;
    }

    if (entry.mode === "direct" && payload.mode === "direct" && payload.peerId) {
      const friends = await repository.areFriends(entry.userId, payload.peerId);
      if (!friends) {
        server.send(JSON.stringify({ type: "error", error: "not-friends" }));
        return;
      }
      const relay = getRelayStub(this.env, `user:${payload.peerId}`);
      await relay.fetch("https://relay/deliver-direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: entry.userId,
          senderAvatar,
          receiverId: payload.peerId,
          text: payload.text,
          createdAt,
        }),
      });
    }
  }
}

async function handleWebSocket(request, env) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const userId = url.searchParams.get("userId");
  if (!mode || !userId) {
    return badRequest("missing-user-or-mode");
  }

  const key = mode === "public" ? "public-room" : `user:${userId}`;
  return getRelayStub(env, key).fetch(request);
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const repository = makeRepository(env);

  if (request.method === "POST" && url.pathname === "/api/users/register") {
    const body = await readJson(request);
    if (!body.id) return badRequest("missing-user-id");
    await repository.registerUser(body);
    return json({ ok: true });
  }

  if (request.method === "GET" && url.pathname === "/api/stats") {
    const userCount = await repository.countUsers();
    return json({ userCount });
  }

  if (request.method === "GET" && url.pathname === "/api/friends") {
    const userId = url.searchParams.get("userId");
    if (!userId) return badRequest("missing-user-id");
    const items = await repository.getAcceptedFriends(userId);
    return json({ items });
  }

  if (request.method === "GET" && url.pathname === "/api/friends/pending") {
    const userId = url.searchParams.get("userId");
    if (!userId) return badRequest("missing-user-id");
    const items = await repository.getPendingFriendRequests(userId);
    return json({ items });
  }

  if (request.method === "POST" && url.pathname === "/api/friends/request") {
    const body = await readJson(request);
    if (!body.fromUserId || !body.toUserId) return badRequest("missing-friend-request-fields");
    await repository.sendFriendRequest(body);
    await getRelayStub(env, `user:${body.toUserId}`).fetch("https://relay/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "friend_request",
        fromUserId: body.fromUserId,
        createdAt: new Date().toISOString(),
      }),
    });
    return json({ ok: true });
  }

  if (request.method === "GET" && url.pathname === "/api/users") {
    const ids = (url.searchParams.get("ids") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const items = await repository.getUsersByIds(ids);
    return json({ items });
  }

  if (request.method === "POST" && url.pathname === "/api/friends/remove") {
    const body = await readJson(request);
    if (!body.userId || !body.friendUserId) return badRequest("missing-friend-remove-fields");
    try {
      await repository.removeFriendship(body);
    } catch (error) {
      return badRequest(String(error?.message || error), 404);
    }
    return json({ ok: true });
  }

  if (request.method === "POST" && url.pathname === "/api/friends/accept") {
    const body = await readJson(request);
    if (!body.userId || !body.fromUserId) return badRequest("missing-friend-accept-fields");
    try {
      await repository.acceptFriendRequest(body);
    } catch (error) {
      return badRequest(String(error?.message || error), 404);
    }
    await getRelayStub(env, `user:${body.fromUserId}`).fetch("https://relay/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "friend_accept",
        byUserId: body.userId,
        createdAt: new Date().toISOString(),
      }),
    });
    return json({ ok: true });
  }

  if (request.method === "GET" && url.pathname === "/api/messages/offline") {
    const userId = url.searchParams.get("userId");
    if (!userId) return badRequest("missing-user-id");
    const items = await repository.pullOfflineMessages(userId);
    return json({ items });
  }

  if (request.method === "GET" && url.pathname === "/api/sync/ping") {
    return json({ ok: true });
  }

  if (request.method === "GET" && url.pathname === "/api/sync/pull") {
    const userId = url.searchParams.get("userId");
    if (!userId) return badRequest("missing-user-id");
    const snapshot = await repository.pullSyncSnapshot(userId);
    if (!snapshot) return json({ error: "not-found" }, { status: 404 });
    return json(snapshot);
  }

  if (request.method === "POST" && url.pathname === "/api/sync/push") {
    const body = await readJson(request);
    if (!body.userId || body.payload == null || !body.updatedAt || !body.deviceId) {
      return badRequest("missing-sync-fields");
    }
    if (typeof body.userId !== "string" || body.userId.trim().length > 20) {
      return badRequest("invalid-sync-user");
    }
    if (Number.isNaN(Date.parse(body.updatedAt))) {
      return badRequest("invalid-sync-timestamp");
    }
    const validation = validateSyncPayload(body.payload);
    if (!validation.ok) {
      return badRequest(validation.error, 422);
    }
    const result = await repository.pushSyncSnapshot(body);
    if (result?.conflict) {
      return json({ error: "conflict" }, { status: 409 });
    }
    return json({ ok: true });
  }

  return badRequest("not-found", 404);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const upgrade = request.headers.get("Upgrade");
    if (upgrade && upgrade.toLowerCase() === "websocket") {
      return handleWebSocket(request, env);
    }
    return handleApi(request, env);
  },
  async scheduled(_controller, env) {
    const repository = makeRepository(env);
    const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    await repository.cleanupOfflineMessages(cutoff);
  },
};
