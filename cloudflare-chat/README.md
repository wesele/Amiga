# Amiga Cloudflare Chat

This subproject contains the social chat backend for Amiga:

- Cloudflare Workers for HTTP + WebSocket handling
- Cloudflare D1 for users, friendships, and offline direct messages
- Daily cron cleanup for messages older than 3 days

## Endpoints

- `POST /api/users/register`
- `GET /api/stats`
- `GET /api/friends?userId=...`
- `GET /api/friends/pending?userId=...`
- `POST /api/friends/request`
- `POST /api/friends/accept`
- `POST /api/friends/remove`
- `GET /api/users?ids=...`
- `GET /api/messages/offline?userId=...`
- `GET /api/sync/ping`
- `GET /api/sync/pull?userId=...`
- `POST /api/sync/push`
- `GET /ws?userId=...&mode=public|direct&peerId=...`

## Local setup

1. Copy `wrangler.toml.example` to `wrangler.toml`.
2. Create a D1 database and replace `database_id`.
3. Apply the schema:

```bash
wrangler d1 execute amiga-chat --file=./schema.sql
```

For an existing deployment, apply tracked migrations instead:

```bash
wrangler d1 migrations apply amiga-chat-social-db --remote
```

4. Run tests:

```bash
npm test
```

5. Deploy:

```bash
wrangler deploy
```

## Message model

- Public group messages are real-time only and never written to D1.
- Direct messages are forwarded to online users immediately.
- If the recipient is offline, the message is written into `offline_messages`.
- When the recipient opens the app, the client calls `GET /api/messages/offline` and the worker deletes the delivered rows immediately after returning them.
- The cron trigger removes any offline message older than 3 days.

## Cloud sync snapshots

- New snapshots are validated before storage so an empty or malformed payload cannot replace a good backup.
- Payloads are split across `user_sync_snapshot_chunks`, avoiding a single large D1 row as daily-reading history grows.
- `user_sync_snapshot_heads` points to the active generation; six generations are retained (current plus five previous versions).
- Pull automatically falls back to the newest valid retained generation if the active generation is incomplete.
- `user_sync_snapshots` remains as a read-only compatibility source for snapshots written before versioned storage was introduced.
