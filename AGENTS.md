# 阿米加 - Amiga (Language Learning App)

跨平台外语学习应用，类似多邻国。**Tauri 2.x (Rust)** + **Vue 3**，支持 Windows + Android。窗口固定 480×800（移动端形态）。

## 铁律（不可违反）

1. **涉及界面的改动一定要截屏确认。** 改了任何 `.vue` / `.css` / 布局相关代码，都要在 Windows（`run-windows.bat`）或 Android（`run-android.bat` + `adb exec-out screencap -p`）截一张图，亲眼看过再提交。截屏命令与流程详见 [docs/testing.md](./docs/testing.md) 的"截屏测试"小节和 [docs/android-adb-debugging.md](./docs/android-adb-debugging.md)。
2. **对于没有图片理解能力的模型，应该使用 `image-describe` 这个 MCP，而不是其他方式。** 截屏后如果当前模型本身不能读图，必须调用 `image-describe_describe_image` 工具（参数：本地截图路径 + 描述指令）来"看"截图，再据此判断改动是否符合预期。不要靠日志 / DOM 文本 / 用户描述替代看图。

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

### 4. 编译与测试
- 改了 `src-tauri/` 下的任何 `.rs` / `Cargo.toml` / `tauri*.conf.json` / `capabilities/*.json` → **必须**重新编译（`cd src-tauri && cargo build`）再测试
- **不要**用 `npm run dev`（裸 Vite）验证 Rust 改动——invoke 走 stub，不会调用后端
- 想边改边看就用 `run-windows.bat` 或 `npm run tauri dev`
- 测试规范与截屏流程 → 详见 [docs/testing.md](./docs/testing.md)
- **Android ADB 真机或者模拟器调试**（截屏、坐标定位、剪贴板验证、logcat 等）→ 详见 [docs/android-adb-debugging.md](./docs/android-adb-debugging.md)

### 4.5 Android 开发循环（**重要**，AI 容易走弯路）

日常做 Android 端功能 / bug，**首选 `run-android.bat` 跑 dev 循环**，不要每次都 `build-android.bat` 后 `adb install` 重装。

| 改动类型 | 触发什么 | 耗时（x86_64 模拟器，热缓存） |
|----------|----------|-----------------------------|
| Vue / CSS / JS（前端） | **仅 Vite HMR 推到模拟器 WebView**，不重编 Rust、不重装 APK | <1 秒 |
| Rust（`src-tauri/src/**.rs`） | 增量 `cargo build` + `adb install -r`（**保留用户数据**） | 5–20 秒 |
| Kotlin（`src-tauri/android/**.kt`） | 完全需**手动重启** dev 循环（`Ctrl+C` 后重跑 `run-android.bat`），`android-patch.cjs` 会自动重新同步 | 30+ 秒 |
| 只改前端先用纯浏览器 `npm run dev` 不值——需验证 Tauri IPC 行为 | 走 `run-android.bat` 同上 | 同前 |

实操要点：
1. 起环：`run-android.bat`。它依次设置环境 → `tauri android init`（首次）→ `android-patch.cjs` 同步 Kotlin + 注入 debug 用 release keystore → `npx tauri android dev --target x86_64 --exit-on-panic`。
2. 模拟器开 API 24+ x86_64（默认 SDK Manager 里"GPhone"档）。`adb devices` 必须看到 `emulator-NNNN device` 才能跑。
3. **签名一致性已解决**：`android-patch.cjs` 把生成的 `app/build.gradle.kts` 的 `debug` buildType 也指向 `amiga-release.keystore`，所以 dev APK 和 release APK 签名证书相同，`adb install -r` 不会撞 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`。除非你手动装过别人签的 APK 才需要 `adb uninstall com.idioma.app` 一次（会清空 app 数据）。
4. 改 Kotlin：改 `src-tauri/android/...` 里 tracked 的副本（**不要**手动改 `gen/android/...`），然后**重启 dev 循环**让 patch 把文件再 sync 进 gen/。
5. 模拟器上点 / 滑 / 截屏 → 见 [docs/android-adb-debugging.md](./docs/android-adb-debugging.md)。
6. 真机调试（arm64 物理设备）：见 `run-android.bat` 顶部注释里的 `TAURI_DEV_HOST` 与 `--target aarch64` 指引。

### 4.6 Android 安全区（safe-area）陷阱

⚠️ **关键教训：Android `WindowInsetsCompat` 返回设备像素，CSS `px` 是逻辑像素。** `__amigaSetInsets` 桥接函数收到的是设备像素值（如 top=145），必须除以 `window.devicePixelRatio` 再赋给 CSS 变量。忘记这一步会导致 safe-area 变成实际值的 ~2.75 倍（440dpi 设备），出现大片空白。

验证方式：`adb logcat -s Amiga/Main:*` 查看 `safe-area:` 行确认原始值，在 `__amigaSetInsets` 内加 `console.log` 确认 DPR 转换后的值。

### 5. 提交
- 任务收尾时自动 commit 到**本地 git**（用户不要求也要做）；push / 发版仍需用户明确要求
- 提交格式与命名约定 → 详见 [docs/conventions.md](./docs/conventions.md)

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
│   ├── composables/           # 组合式函数
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
├── scripts/                  # release.cjs / bump-version.cjs / screenshot.ps1 等
├── docs/                     # 详细文档
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
| `npm test` | 前端 Vitest |
| `npm run test:rust` | Rust `cargo test` |
| `npm run test:all` | 前后端全部测试 |
| `npm run tauri` | Tauri CLI 入口（如 `npm run tauri dev` / `build`） |
| `run-windows.bat` | Windows 端开发启动（Vite + Tauri） |
| `run-android.bat` | **Android 开发循环**（dev server + HMR + 增量 Rust 重装），日常开发首选 |
| `build-android.bat` | Android release APK 构建（发版 / 一次性安装测试） |

> 更多测试命令（watch / clippy / fmt）见 [docs/testing.md](./docs/testing.md)，脚索引见 [docs/release-and-scripts.md](./docs/release-and-scripts.md)。

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
| `shell` | `/` | 主布局 + 底部导航（学习/单词/聊天/我的） |
| `wizard` | `/wizard` | 新用户引导（基本信息 → 学习目标 → 完成） |
| `news` | `/news`, `/news/:id` | RSS 新闻阅读、AI 改写、双语翻译、生词弹窗 |
| `vocab` | `/vocab` | 词库管理、CEFR 分级、掌握度追踪 |
| `profile` | `/profile`, `/profile/settings`, `/profile/llm-config/:type` | 用户设置、LLM 配置 |
| `chat` | `/chat`, `/chat/:sessionId`, `/chat/preview` | AI 语言伙伴聊天、翻译机器人 |
| `prompts` | `/prompts`, `/prompts/:key` | LLM 系统提示词管理 |

## Rust 后端

### 分层

- `modules/<area>.rs`：业务逻辑，签名形如 `fn xxx(db: &DatabasePool, ...) -> Result<T, String>`
- `commands/<area>.rs`：薄层，每个函数 `#[tauri::command] pub async fn xxx(...) -> Result<T, String>`，仅转发到 `modules/`

### 命名约定

`<verb>_<noun>` 蛇形命名。command 与 module 同名时加 `_cmd` 后缀。详见 [docs/conventions.md](./docs/conventions.md)。

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

## Android 自定义

→ 详见 [docs/android-native.md](./docs/android-native.md)

核心要点：
- 源码只改 `src-tauri/android/...`，不改 `gen/`
- JS↔Kotlin 契约（`__amigaGoBack` / `__amigaSetInsets` / `__amigaTranslateSelection`）不可随意改动，前端单测依赖

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

→ 详见 [docs/testing.md](./docs/testing.md)

核心：改代码必须同步改测试；提交前 `npm run test:all` + `cargo fmt` + `cargo clippy` 必须 through。

## 发布与脚本

→ 详见 [docs/release-and-scripts.md](./docs/release-and-scripts.md)

## 约定

提交格式、命令命名、migration / 权限约定 → 详见 [docs/conventions.md](./docs/conventions.md)

## Content Studio

→ 见 [CONTENT_STUDIO.md](./CONTENT_STUDIO.md)。`content-studio/` 是独立子项目，单独 `npm install` + `npm run dev`。
