# Social 聊天后端（Cloudflare）

**不属于 Amiga 桌面/Android 主应用代码**。Social 功能 = 主应用 WebSocket 客户端（`src/modules/chat/social/`）+ 本 Workers 后端。

完整 API、D1 schema、本地 wrangler 流程 → [cloudflare-chat/README.md](../cloudflare-chat/README.md)。

| 层级 | 路径 |
|------|------|
| 前端 | `src/modules/chat/social/` |
| 后端 | `cloudflare-chat/`（Workers + D1 + `/ws`） |

改好友、离线消息、WS 协议时前后端需一起看。
