# 阿米加 - Amiga (Language Learning App)

跨平台外语学习应用，类似多邻国。**Tauri 2.x (Rust)** + **Vue 3**，支持 Windows + Android。窗口固定 480×800（移动端形态）。

## 开发流程

接到任务后按以下顺序执行：

### 1. 理解项目
- 必读 `AGENTS.md`（本文档）和 `CONTENT_STUDIO.md`
- 涉及具体模块时，按需 `Read` 模块源码 / 测试，理清现有结构与约定
- 不要假设未读过的文件存在或不存在

### 2. 理解需求
- 用户输入清晰且无歧义 → 直接进入步骤 3
- 需求模糊、多种实现路径、影响范围不明确 → **先和用户确认修改计划**（影响点、方案、验证方式），再动手
- 涉及破坏性变更（删字段、改 API、改 schema）→ 必须确认

### 3. 拆分与执行
- 单文件小改 → 直接改
- 任务**适合分拆**（多模块、多文件、调研 + 实现并存）→ 派 subagent 并行/串行处理
- 任务**完全独立**（如纯调研、生成测试数据）→ 单独 subagent
- 派 subagent 时：在 prompt 中明确"研究还是改代码"、验证方式、要返回什么

### 4. 测试
- **所有修改完成后必须测试**：
  - 改 Rust → `npm run test:rust`（或 `cargo test`）
  - 改前端 / 共享层 → `npm test`
  - 改两端 → `npm run test:all`
  - Rust 提交前 `cargo fmt` + `cargo clippy` 必须无警告
- 涉及**界面、功能、视觉效果** → 截屏测试：
  - Windows 默认使用 **Windows 版**
  - 默认模式（auto）跑 `pwsh scripts/screenshot.ps1 -OutFile screenshots/<module>-<step>.png`：先截 Tauri 窗口，找不到时自动回退到 Edge headless 截 `http://localhost:1420/`
  - 纯前端改动用 headless：`pwsh scripts/screenshot.ps1 -Mode Headless -Url http://localhost:1420/<route>`
  - 涉及 Tauri 集成（窗口/IPC/native）用 app：`pwsh scripts/screenshot.ps1 -Mode App`
  - 同一页面改前/改后各截一张，便于对比
  - 跨平台 UI 改动需额外在 Android 验证
- 同步更新测试（参考下方"测试"章节的规范）

### 5. 提交
- 任务收尾时自动 commit 到**本地 git**（用户不要求也要做）；push / 发版仍需用户明确要求
- 提交前确认 `git status` / `git diff` 干净、无敏感信息
- 提交信息用中文，简要说明本次改动范围（"feat: ..." / "fix: ..." 前缀可选）

## 项目结构

```
C:\Code\Idioma\
├── src/                      # Vue 3 前端
│   ├── modules/              # 插件式动态加载的功能模块
│   ├── shared/               # api.js / kernel.js / eventBus.js（前后端桥梁）
│   │   ├── i18n/             # 轻量自研 i18n（zh/en/es 字典 + composable + plugin）
│   │   └── constants.js      # AVAILABLE_LANGUAGES 等共享常量
│   ├── stores/               # Pinia 全局状态
│   ├── router/               # vue-router 工厂
│   ├── composables/          # 组合式函数
│   ├── assets/  public/
│   ├── App.vue  main.js  style.css
│   └── index.html
├── src-tauri/                # Rust 后端
│   ├── src/
│   │   ├── modules/          # 业务逻辑层（持有 &DatabasePool）
│   │   ├── commands/         # Tauri IPC 薄层（#[tauri::command]）
│   │   ├── lib.rs  main.rs  mobile.rs  build.rs
│   ├── capabilities/         # Tauri 2.x 权限配置（default.json / mobile.json）
│   ├── tauri.conf.json / tauri.android.conf.json
│   ├── amiga-release.keystore
│   └── Cargo.toml
├── content-studio/           # 独立子项目（提示词 / 内容管理 UI），单独装依赖
├── scripts/                  # release.cjs / bump-version.cjs / screenshot.ps1
├── docs/                     # 文档（CONTENT_STUDIO.md / PRODUCT_DESIGN.md）
├── run-windows.bat / run-windows-vite.bat / run-windows-exe.bat
├── build-android.bat / release-github.bat
├── package.json / vite.config.js / vitest.config.js
└── AGENTS.md
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器（仅前端，浏览器打开） |
| `npm run build` | 前端生产构建到 `dist/` |
| `npm test` | 前端 Vitest（一次性） |
| `npm run test:watch` | 前端 Vitest watch 模式 |
| `npm run test:rust` | Rust `cargo test` |
| `npm run test:all` | 前后端全部测试 |
| `npm run tauri` | Tauri CLI 入口（如 `npm run tauri dev` / `build`） |
| `cargo fmt` / `cargo clippy` | Rust 格式化 / lint（**提交前必跑**） |
| `run-windows.bat` | Windows 端开发启动（Vite + Tauri） |
| `run-windows-vite.bat` | 仅启动 Vite（无 Tauri shell） |
| `run-windows-exe.bat` | 构建并运行已编译的 EXE |
| `build-android.bat` | Android APK 构建 |
| `release-github.bat` | 调 `scripts/release.cjs` 全自动发布 |

> **注意**：项目目前**没有**前端 lint / format 工具（无 eslint / prettier / vue-tsc），改前端只跑 `npm test`。

## 架构

**前端**：Vue 3 + Pinia + vue-router。模块通过 `kernel.js` 插件式动态加载（见下），路由由 `src/main.js` 集中注册。`src/shared/api.js` 把所有 Tauri 命令包成 JS 函数，前端只 `import { ... } from "@/shared/api"`。

**后端**：分层 `commands/`（薄 IPC 层，纯 `#[tauri::command]` 转发）→ `modules/`（业务逻辑）。`database.rs` 用 rusqlite + 启动跑 migrations；`logging.rs` 写文件日志（3 天清理）；`llm.rs` 是 OpenAI 兼容客户端。

**前后端桥**：Tauri `invoke()`，`src/shared/api.js` 的 invoke 名 ↔ `src-tauri/src/commands/` 的 Rust 函数名一一对应。

## 前端模块

### 模块形状

```js
// src/modules/<name>/index.js
import routes from "./routes.js";

export default {
  name: "<name>",         // 唯一标识，kernel.loadModule 用
  displayName: "中文名",
  version: "0.3.5",
  routes,                 // vue-router 路由数组
  init(kernel) { /* 可选，挂载时调用 */ },
};
```

`src/main.js` 决定加载顺序与路由守卫（详见该文件）：

```js
await kernel.loadModule("shell");                    // 必先加载，提供布局
router.beforeEach(async (to) => /* wizard 守卫 */);  // 未完成引导 → /wizard
await kernel.loadModule("wizard");
await kernel.loadModule("news", { parent: "shell" });  // 其余挂在 shell 下
// ...
```

| 模块 | 路由 | 功能 |
|------|------|------|
| `shell` | `/` | 主布局 + 底部导航（学习/单词/互动/我的） |
| `wizard` | `/wizard` | 新用户引导（基本信息 → 学习目标 → 完成） |
| `news` | `/news`, `/news/:id` | RSS 新闻阅读、AI 改写、双语翻译、生词弹窗 |
| `vocab` | `/vocab` | 词库管理、CEFR 分级、掌握度追踪 |
| `profile` | `/profile`, `/profile/settings`, `/profile/llm-config/:type` | 用户设置、LLM 配置 |
| `interaction` | `/interaction`, `/interaction/chat/:sessionId` | AI 语言伙伴聊天、翻译机器人 |
| `prompts` | `/prompts`, `/prompts/:key` | LLM 系统提示词管理 |

## Rust 后端

### 分层

- `modules/<area>.rs`：业务逻辑，签名形如 `fn xxx(db: &DatabasePool, ...) -> Result<T, String>`
- `commands/<area>.rs`：薄层，每个函数 `#[tauri::command] pub async fn xxx(...) -> Result<T, String>`，仅转发到 `modules/`

### Tauri 命令命名约定

`<verb>_<noun>` 蛇形命名。**当 command 名会与 `modules/` 同模块函数同名时，加 `_cmd` 后缀**（如 `update_user` 模块函数 → `update_user_cmd` command）。`src/shared/api.js` 的 invoke 名要和 Rust 函数名完全一致。

实际现状（`commands/user.rs`）：

```rust
// modules/user.rs
pub fn create_user_from_wizard(...)   // 内部函数，名字不同 → command 不用 _cmd
pub fn update_user(...)               // 跟 command 撞名 → command 加 _cmd

// commands/user.rs
#[tauri::command] pub async fn create_user(...)       // OK
#[tauri::command] pub async fn update_user_cmd(...)   // 加 _cmd 区分
```

### modules/

| 文件 | 职责 |
|------|------|
| `database.rs` | SQLite 连接池（`DatabasePool`），启动跑 migrations；`new_in_memory()` 仅测试 |
| `migrations.rs` | Schema 迁移（`MIGRATION_V<N>` 常量 + `all_migrations()` 注册表） |
| `user.rs` | 用户 CRUD、引导状态、学习目标 |
| `vocabulary.rs` | 词库导入、掌握度、统计 |
| `llm.rs` | `LlmClient`（OpenAI 兼容 API）、文章改写、翻译、配置 |
| `news.rs` | RSS 抓取（feed-rs）、文章 CRUD、双语缓存 |
| `prompts.rs` | 默认提示词定义（`all_default_prompts()`）+ 启动时 upsert |
| `chat.rs` | 聊天会话/消息 CRUD、Amiga profile 分析 |
| `logging.rs` | 每日日志文件，3 天清理 |

### commands/

每个 `commands/<area>.rs` 是 `#[tauri::command]` 入口，业务在 `modules/<area>.rs`。新增功能 = 加 module 函数 + 加 command + `shared/api.js` 加 invoke 包装。

## 数据与文件位置

| 资源 | 路径 |
|------|------|
| SQLite 数据库 | `%LOCALAPPDATA%\idioma\idioma.db`（Windows）/ `/data/data/com.idioma.app/files/idioma/idioma.db`（Android） |
| 日志 | `%LOCALAPPDATA%\idioma\logs\idioma-YYYY-MM-DD.log`（保留 3 天） |
| LLM API key | `app_settings` 表（key: `primary_api_key` / `backup_api_key`，**明文存本地**） |
| Tauri 权限 | `src-tauri/capabilities/default.json`（桌面）/ `mobile.json`（Android） |
| 截屏产物 | `screenshots/`（已 gitignore） |

**改 schema** → 在 `migrations.rs` 追加 `MIGRATION_V<N+1>` 并加入 `all_migrations()`，**不要**改历史 migration。

**加 Tauri 权限**（如 `core:fs:allow-read`）→ 同时更新 `default.json` 和 `mobile.json`，否则桌面/Android 行为不一致。

## 添加新功能

### 新增一个前端模块
1. `src/modules/<name>/` 建目录，至少 `index.js`（模块定义）+ `routes.js`（路由）+ 组件
2. 在 `src/main.js` 加 `await kernel.loadModule("<name>", { parent: "shell" })`

### 新增一个 Tauri 命令
1. 在 `src-tauri/src/modules/<area>.rs` 加业务函数
2. 在 `src-tauri/src/commands/<area>.rs` 加 `#[tauri::command]`，**遵守命名约定**（可能加 `_cmd` 后缀）
3. 在 `src/shared/api.js` 加 `export const xxx = (...) => _invoke("<rust_function_name>", { ... })`

### 新增一个 DB migration
1. `src-tauri/src/modules/migrations.rs` 写 `const MIGRATION_V<N+1>: &str = r#"..."#;`
2. 把它加入 `all_migrations()` 列表
3. 配套在 `database.rs` 测试里验证新表/字段

## 测试

| 命令 | 范围 |
|------|------|
| `npm test` | 前端 Vitest（一次性） |
| `npm run test:watch` | 前端 watch |
| `npm run test:rust` | Rust `cargo test`（内存 SQLite） |
| `npm run test:all` | 前后端全部 |

### 规范
1. **改代码必须同步改测试**。Rust module → 同文件 `#[cfg(test)]`；前端 shared/模块 → 对应 `__tests__/`
2. 新模块必须建 `__tests__/`
3. 提交前 `npm run test:all` + `cargo fmt` + `cargo clippy` 必须通过

### 截屏测试（界面/视觉改动必做）
- **首选（auto）**：`pwsh scripts/screenshot.ps1 -OutFile screenshots/<module>-<step>.png`
  - 检测到 "Amiga" 窗口 → 截 Tauri 窗口
  - 否则若 Vite 在 :1420 → 用 Edge headless 截 `http://localhost:1420/`
  - 都没有则报错
- **纯前端**（快、不启 Tauri）：`npm run dev` 后
  - `pwsh scripts/screenshot.ps1 -Mode Headless -Url http://localhost:1420/<route> -OutFile screenshots/<module>-<step>.png`
- **Tauri 集成**：启动 `run-windows.bat` 后
  - `pwsh scripts/screenshot.ps1 -Mode App -OutFile screenshots/<module>-<step>.png`
- 同一页面改前/改后各截一张，产物放 `screenshots/`（已 gitignore）
- Android 用 `adb exec-out screencap -p > screenshots/<module>-<step>.png`

## 发布

### 规范
- GitHub Release 说明 **中英双语**，`---ENGLISH---` 分隔
- `release-github.bat` → `scripts/release.cjs`（自动版本号 + 构建 + 发布）
- 版本更新用 Node.js 脚本，**严禁 PowerShell `Set-Content`**（BOM 破坏 Vite）
- 版本号同步：`package.json` / `Cargo.toml` / `tauri.conf.json` / `tauri.android.conf.json`

### 构建
- Windows: MSI + NSIS + EXE
- Android: `build-android.bat` → `tauri android build --target aarch64 --apk`
- Android APK 用 `src-tauri/amiga-release.keystore` 签名

## 脚本

| 文件 | 职责 |
|------|------|
| `scripts/release.cjs` | 全自动发布：版本更新 → 提交 → 前端构建 → Android 构建 → GitHub Release |
| `scripts/bump-version.cjs` | 同步 `package.json` / `Cargo.toml` / `tauri.conf.json` 等版本号 |
| `scripts/screenshot.ps1` | 按窗口标题截屏到 PNG（默认标题 `Amiga`） |
| `scripts/test-bump-lock.cjs` / `test-cargo-lock*.cjs` | 锁文件一致性测试 |

## Content Studio
→ 见 [CONTENT_STUDIO.md](./CONTENT_STUDIO.md)。`content-studio/` 是独立子项目，单独 `npm install` + `npm run dev`。
