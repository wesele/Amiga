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
