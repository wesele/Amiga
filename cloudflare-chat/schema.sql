CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  avatar TEXT NOT NULL DEFAULT '',
  native_language TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id TEXT NOT NULL,
  addressee_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_addressee_status
  ON friendships(addressee_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_friendships_requester_status
  ON friendships(requester_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS offline_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_offline_messages_receiver_created
  ON offline_messages(receiver_id, created_at ASC);

CREATE TABLE IF NOT EXISTS user_sync_snapshots (
  user_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  device_id TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS user_sync_snapshot_heads (
  user_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  device_id TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS user_sync_snapshot_versions (
  snapshot_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  device_id TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_sync_versions_user_updated
  ON user_sync_snapshot_versions(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_sync_snapshot_chunks (
  snapshot_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  payload_chunk TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, chunk_index)
);
