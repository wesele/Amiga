import {
  broadcastPublicMessage,
  createConnectionState,
  deliverDirectMessage,
  notifyUser,
  registerSocket,
  removeSocket,
} from "./core.js";

const connectionState = createConnectionState();

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
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
    async getAcceptedFriends(userId) {
      const rows = await env.DB
        .prepare(
          `SELECT
             CASE
               WHEN requester_id = ?1 THEN addressee_id
               ELSE requester_id
             END AS friendUserId,
             updated_at AS updatedAt
           FROM friendships
           WHERE status = 'ACCEPTED' AND (requester_id = ?1 OR addressee_id = ?1)
           ORDER BY updated_at DESC`,
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
  };
}

function attachSocketLifecycle(serverSocket, userId, entry) {
  serverSocket.addEventListener("close", () => {
    removeSocket(connectionState, userId, entry);
  });
}

async function handleWebSocket(request, env) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const mode = url.searchParams.get("mode");
  if (!userId || !mode) {
    return badRequest("missing-user-or-mode");
  }

  const pair = new WebSocketPair();
  const clientSocket = pair[0];
  const serverSocket = pair[1];
  serverSocket.accept();

  const repository = makeRepository(env);
  const entry = registerSocket(connectionState, userId, serverSocket, {
    mode,
    peerId: url.searchParams.get("peerId") || "",
  });
  attachSocketLifecycle(serverSocket, userId, entry);

  serverSocket.addEventListener("message", async (event) => {
    try {
      const payload = JSON.parse(event.data);
      const createdAt = payload.createdAt || new Date().toISOString();
      if (payload.mode === "public") {
        broadcastPublicMessage(connectionState, userId, payload.text, createdAt);
      } else if (payload.mode === "direct" && payload.peerId) {
        await deliverDirectMessage(connectionState, repository, {
          senderId: userId,
          receiverId: payload.peerId,
          text: payload.text,
          createdAt,
        });
      }
    } catch (error) {
      serverSocket.send(JSON.stringify({ type: "error", error: String(error?.message || error) }));
    }
  });

  return new Response(null, { status: 101, webSocket: clientSocket });
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
    notifyUser(connectionState, body.toUserId, {
      type: "friend_request",
      fromUserId: body.fromUserId,
      createdAt: new Date().toISOString(),
    });
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
    notifyUser(connectionState, body.fromUserId, {
      type: "friend_accept",
      byUserId: body.userId,
      createdAt: new Date().toISOString(),
    });
    return json({ ok: true });
  }

  if (request.method === "GET" && url.pathname === "/api/messages/offline") {
    const userId = url.searchParams.get("userId");
    if (!userId) return badRequest("missing-user-id");
    const items = await repository.pullOfflineMessages(userId);
    return json({ items });
  }

  return badRequest("not-found", 404);
}

export default {
  async fetch(request, env) {
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
