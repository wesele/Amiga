# 阿米加 - Amiga (Language Learning App)

跨平台外语学习应用，类似多邻国。**Tauri 2.x (Rust)** + **Vue 3**，支持 Windows + Android。

## 架构

```
┌─────────────────────────────────────┐
│          Frontend (Vue 3)           │
│  ┌──────┐ ┌──────┐ ┌─────────────┐ │
│  │shell │ │wizard│ │ news/vocab  │ │
│  │(布局) │ │(引导)│ │ profile/... │ │
│  └──┬───┘ └──┬───┘ └──────┬──────┘ │
│     └────────┴─────────────┘        │
│              │ Kernel 动态加载       │
│     ┌────────▼────────┐             │
│     │  Shared Layer   │             │
│     │ api/kernel/eb   │             │
│     └────────┬────────┘             │
├──────────────┼──────────────────────┤
│     Tauri IPC Bridge (invoke)       │
├──────────────┼──────────────────────┤
│         Backend (Rust)              │
│  ┌───────┐ ┌──────┐ ┌───────────┐ │
│  │LLM/AI │ │SQLite│ │ Commands  │ │
│  │(chat  │ │      │ │(thin IPC  │ │
│  │rewrite│ │      │ │ handlers) │ │
│  │transl)│ │      │ │           │ │
│  └───────┘ └──────┘ └───────────┘ │
└─────────────────────────────────────┘
```

## 前端模块

使用 `kernel.js` 插件式动态加载，`src/main.js` 定义加载顺序。

| 模块 | 路由 | 功能 |
|------|------|------|
| `shell` | `/` | 主布局 + 底部导航（学习/单词/互动/我的） |
| `wizard` | `/wizard` | 新用户引导（基本信息 → 学习目标 → 完成） |
| `news` | `/news`, `/news/:id` | RSS 新闻阅读、AI 改写、双语翻译、生词弹窗 |
| `vocab` | `/vocab` | 词库管理、CEFR 分级、掌握度追踪 |
| `profile` | `/profile`, `/profile/settings`, `/profile/llm-config/:type` | 用户设置、LLM 配置 |
| `interaction` | `/interaction`, `/interaction/chat/:sessionId` | AI 语言伙伴聊天、翻译机器人 |
| `prompts` | `/prompts`, `/prompts/:key` | LLM 系统提示词管理 |
| `hello` | `/` | 遗留 demo |

### 启动顺序
1. 加载 `shell`（必须先加载，提供布局）
2. 注册路由守卫：未完成引导 → 强制 `/wizard`
3. 加载 `wizard` + 其余功能模块（作为 shell 子路由）
4. mount 后 `router.replace` 重解析（处理异步 guard 与动态路由竞态）

## Rust 后端

分层：`commands/`（薄 IPC 层）→ `modules/`（业务逻辑层）

### modules/
| 文件 | 功能 |
|------|------|
| `database.rs` | SQLite (rusqlite)，`DatabasePool` 封装，支持 `new_in_memory()` 测试 |
| `migrations.rs` | V1-V5 模式迁移 |
| `user.rs` | 用户 CRUD、引导状态、学习目标 |
| `vocabulary.rs` | 词库导入、掌握度、统计 |
| `llm.rs` | `LlmClient`（OpenAI 兼容 API），文章改写、翻译、配置持久化 |
| `news.rs` | RSS 抓取（feed-rs）、文章 CRUD、双语缓存 |
| `prompts.rs` | 7 个默认提示词（rewrite/translate/chat/analysis 等），启动时 upsert |
| `chat.rs` | 聊天会话/消息 CRUD、Amiga profile 分析 |
| `greeting.rs` | 遗留示例 |
| `logging.rs` | 每日日志文件，3 天清理 |

### commands/（37 个 Tauri 命令）
`user(6)` + `vocabulary(10)` + `llm(9)` + `news(4)` + `prompts(5)` + `update(1)` + `chat(7)` + `greeting(1)`

### 关键依赖
`rusqlite` `serde` `chrono` `uuid` `reqwest` `feed-rs` `tokio` `dirs` `log`

## 测试

### 命令
| 命令 | 说明 |
|------|------|
| `npm test` | 前端 Vitest |
| `npm run test:rust` | Rust `cargo test` |
| `npm run test:all` | 前后端全部 |

### 前端测试
- `src/shared/__tests__/api.spec.js` / `kernel.spec.js` / `eventBus.spec.js`
- `src/stores/__tests__/app.spec.js`
- `src/modules/news/__tests__/` / `interaction/` / `wizard/`

### Rust 测试（`#[cfg(test)]`，内存 SQLite）
`database.rs`(4) `user.rs`(12) `vocabulary.rs`(~20) `news.rs`(8) `prompts.rs`(9) `chat.rs`(~10) `commands/update.rs`(5)

### 规范
1. 代码更新必须同步更新测试
2. 修改 Rust module 后在同一文件加测试；修改共享层在对应 `__tests__/` 加
3. 新模块必须创建 `__tests__/`
4. 提交前 `npm run test:all` 必须通过

### 可测试性约定
| 层 | 机制 |
|----|------|
| API | `api.js` 导出 `__setInvoke(fn)` / `__resetInvoke()` mock 注入 |
| Kernel | 导出 `Kernel` 类，可 `new Kernel()` 传自定义 loader |
| EventBus | 导出 `clear()` 测试间隔离 |
| Pinia | `setActivePinia(createPinia())` 每测试独立 store |
| Rust | `DatabasePool::new_in_memory()` 内存数据库 |

## 发布

### 规范
- GitHub Release 说明 **中英双语**，`---ENGLISH---` 分隔
- `release-github.bat` → `scripts/release.cjs`（自动版本号 + 构建 + 发布）
- 版本更新用 Node.js 脚本，**严禁 PowerShell `Set-Content`**（BOM 破坏 Vite）

### 构建
- Windows: MSI + NSIS + EXE
- Android: `build-android.bat` → `tauri android build --target aarch64 --apk`
- Android APK 使用 `src-tauri/amiga-release.keystore` 签名

## 脚本
| 文件 | 职责 |
|------|------|
| `scripts/release.cjs` | 全自动发布：版本更新 → 提交 → 前端构建 → Android 构建 → GitHub Release |
| `scripts/bump-version.cjs` | 更新 `package.json` / `Cargo.toml` / `tauri.conf.json` 等版本号 |
| `run-windows.bat` / `run-android.bat` | 开发环境启动 |

## Content Studio
→ 见 [CONTENT_STUDIO.md](./CONTENT_STUDIO.md)
