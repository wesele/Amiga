/**
 * Dual-user social chat smoke test against the production Cloudflare worker.
 * Simulates two app instances (老王 + TestB) for public group + direct chat.
 */
const API = "https://amiga-chat-social.wh1018.workers.dev";
const USER_A = "老王";
const USER_B = "TestB";
const RUN_ID = Date.now().toString(36);

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${path} -> HTTP ${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function waitForMessage(socket, predicate, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error("timeout waiting for message"));
    }, timeoutMs);
    function onMessage(event) {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (predicate(payload)) {
        clearTimeout(timer);
        socket.removeEventListener("message", onMessage);
        resolve(payload);
      }
    }
    socket.addEventListener("message", onMessage);
  });
}

function openSocket(userId, mode, peerId) {
  const url = new URL(`${API.replace("https://", "wss://")}/ws`);
  url.searchParams.set("userId", userId);
  url.searchParams.set("mode", mode);
  if (peerId) url.searchParams.set("peerId", peerId);
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener("open", () => resolve(socket));
    socket.addEventListener("error", () => reject(new Error(`ws open failed for ${userId}/${mode}`)));
  });
}

async function register(userId) {
  await api("/api/users/register", {
    method: "POST",
    body: JSON.stringify({ id: userId, avatar: "🙂", nativeLanguage: "zh" }),
  });
}

async function ensureFriends() {
  const pendingB = await api(`/api/friends/pending?userId=${encodeURIComponent(USER_B)}`);
  const alreadyPending = (pendingB?.items || []).some((r) => r.fromUserId === USER_A);
  if (!alreadyPending) {
    await api("/api/friends/request", {
      method: "POST",
      body: JSON.stringify({ fromUserId: USER_A, toUserId: USER_B }),
    });
  }
  try {
    await api("/api/friends/accept", {
      method: "POST",
      body: JSON.stringify({ userId: USER_B, fromUserId: USER_A }),
    });
  } catch (e) {
    if (!String(e.message).includes("friend-request-not-found")) throw e;
  }
}

async function testPublicGroup() {
  const msg = `public-${RUN_ID}`;
  const [sockA, sockB] = await Promise.all([
    openSocket(USER_A, "public"),
    openSocket(USER_B, "public"),
  ]);
  const waitB = waitForMessage(sockB, (p) => p?.type === "message" && p?.text === msg);
  sockA.send(
    JSON.stringify({
      type: "message",
      mode: "public",
      senderId: USER_A,
      text: msg,
      createdAt: new Date().toISOString(),
    }),
  );
  const received = await waitB;
  sockA.close();
  sockB.close();
  return { ok: true, received };
}

async function testDirectChat() {
  const msg = `direct-${RUN_ID}`;
  const [sockA, sockB] = await Promise.all([
    openSocket(USER_A, "direct", USER_B),
    openSocket(USER_B, "direct", USER_A),
  ]);
  const waitB = waitForMessage(sockB, (p) => p?.type === "message" && p?.text === msg);
  sockA.send(
    JSON.stringify({
      type: "message",
      mode: "direct",
      peerId: USER_B,
      senderId: USER_A,
      text: msg,
      createdAt: new Date().toISOString(),
    }),
  );
  const received = await waitB;
  sockA.close();
  sockB.close();
  return { ok: true, received };
}

async function main() {
  console.log("Registering users...");
  await register(USER_A);
  await register(USER_B);

  console.log("Ensuring friendship...");
  await ensureFriends();

  console.log("Testing public group...");
  const pub = await testPublicGroup();
  console.log("PUBLIC OK:", pub.received.text);

  console.log("Testing direct chat...");
  const dir = await testDirectChat();
  console.log("DIRECT OK:", dir.received.text);

  console.log("\nAll social chat checks passed.");
}

main().catch((err) => {
  console.error("FAILED:", err.message || err);
  process.exit(1);
});