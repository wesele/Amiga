import test from "node:test";
import assert from "node:assert/strict";
import {
  broadcastPublicMessage,
  createConnectionState,
  createMemoryRepository,
  deliverDirectMessage,
  registerSocket,
} from "../src/core.js";

function fakeSocket() {
  return {
    messages: [],
    send(payload) {
      this.messages.push(JSON.parse(payload));
    },
  };
}

test("public messages broadcast to other online users only", () => {
  const state = createConnectionState();
  const alice = fakeSocket();
  const bob = fakeSocket();

  registerSocket(state, "Alice", alice);
  registerSocket(state, "Bob", bob);

  broadcastPublicMessage(state, "Alice", "hello room", "2026-06-27T10:00:00.000Z");

  assert.equal(alice.messages.length, 0);
  assert.equal(bob.messages.length, 1);
  assert.equal(bob.messages[0].text, "hello room");
});

test("direct messages are stored offline when recipient is absent", async () => {
  const state = createConnectionState();
  const repository = createMemoryRepository();

  const result = await deliverDirectMessage(state, repository, {
    senderId: "Alice",
    receiverId: "Bob",
    text: "hi bob",
    createdAt: "2026-06-27T10:00:00.000Z",
  });

  assert.deepEqual(result, { delivered: false, storedOffline: true });

  const items = await repository.pullOfflineMessages("Bob");
  assert.equal(items.length, 1);
  assert.equal(items[0].content, "hi bob");
});

test("direct messages are delivered live when recipient is online", async () => {
  const state = createConnectionState();
  const repository = createMemoryRepository();
  const bob = fakeSocket();

  registerSocket(state, "Bob", bob);

  const result = await deliverDirectMessage(state, repository, {
    senderId: "Alice",
    receiverId: "Bob",
    text: "hi bob",
    createdAt: "2026-06-27T10:00:00.000Z",
  });

  assert.deepEqual(result, { delivered: true, storedOffline: false });
  assert.equal(bob.messages.length, 1);
  assert.equal(bob.messages[0].senderId, "Alice");
});

test("offline cleanup removes messages older than 3 days", async () => {
  const repository = createMemoryRepository();
  await repository.storeOfflineMessage({
    senderId: "Alice",
    receiverId: "Bob",
    content: "old",
    createdAt: "2026-06-20T10:00:00.000Z",
  });
  await repository.storeOfflineMessage({
    senderId: "Alice",
    receiverId: "Bob",
    content: "new",
    createdAt: "2026-06-27T10:00:00.000Z",
  });

  const removed = await repository.cleanupOfflineMessages("2026-06-24T10:00:00.000Z");
  assert.equal(removed, 1);

  const items = await repository.pullOfflineMessages("Bob");
  assert.equal(items.length, 1);
  assert.equal(items[0].content, "new");
});

test("sync snapshots round-trip by nickname", async () => {
  const repository = createMemoryRepository();
  await repository.pushSyncSnapshot({
    userId: "Alice",
    payload: "{\"version\":1}",
    updatedAt: "2026-06-29T10:00:00.000Z",
    deviceId: "device-a",
  });

  const snapshot = await repository.pullSyncSnapshot("Alice");
  assert.equal(snapshot.userId, "Alice");
  assert.equal(snapshot.deviceId, "device-a");
  assert.equal(snapshot.payload, "{\"version\":1}");
});

test("sync push rejects stale baseUpdatedAt", async () => {
  const repository = createMemoryRepository();
  await repository.pushSyncSnapshot({
    userId: "Alice",
    payload: "{\"version\":1}",
    updatedAt: "2026-06-29T11:00:00.000Z",
    deviceId: "device-a",
  });

  const conflict = await repository.pushSyncSnapshot({
    userId: "Alice",
    payload: "{\"version\":2}",
    updatedAt: "2026-06-29T12:00:00.000Z",
    deviceId: "device-b",
    baseUpdatedAt: "2026-06-29T10:00:00.000Z",
  });

  assert.equal(conflict.conflict, true);
  const snapshot = await repository.pullSyncSnapshot("Alice");
  assert.equal(snapshot.payload, "{\"version\":1}");
});
