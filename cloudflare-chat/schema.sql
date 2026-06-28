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
