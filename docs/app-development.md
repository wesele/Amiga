# Amiga 应用开发

Tauri 2 + Vue 3 主应用（`src/`、`src-tauri/`）。命名、migration、权限详见 [conventions.md](./conventions.md)。

## 任务路由

| 任务 | 先读 |
|------|------|
| 页面 / 交互 | `src/modules/<name>/`、`__tests__/`；IPC 时加 `src/shared/api.js` |
| 壳层 / 路由 / wizard | `src/app/`（`modules.js`、`routeGuards.js`、`androidBridge.js`）、`src/main.js`、`src/modules/shell/` |
| 全局状态 | `src/stores/` |
| i18n | `src/shared/i18n/`、`src/shared/constants.js` |
| Tauri 能力 | `src/shared/api.js` → `src-tauri/src/modules/<area>.rs` → `commands/<area>.rs` |
| 数据库 | `src-tauri/src/modules/migrations.rs`、`database.rs` |
| LLM / Prompts | `modules/llm.rs`、`prompts.rs` + 对应 commands |
| Cloud sync | `modules/sync.rs`、`commands/sync.rs` |
| Social 聊天 UI | `src/modules/chat/social/`（WebSocket 客户端；**后端**见 [cloudflare-chat.md](./cloudflare-chat.md)） |
| Android 原生 | `src-tauri/android/...`、[android-native.md](./android-native.md) |
| 测试 / 截图 | [testing.md](./testing.md) |

## 非显而易见的路径

| 路径 | 说明 |
|------|------|
| `src/app/modules.js` | `APP_MODULES` 注册表（**不是** `main.js`） |
| `src/app/androidBridge.js` | `__amigaGoBack` / `__amigaSetInsets` 实现 |
| `src/shared/kernel.js` | 动态 `loadModule` |
| `%LOCALAPPDATA%\idioma\` | Windows 主实例 DB（`idioma.db`）与日志 |
| `run-windows-2.bat` | 第二实例，数据/构建完全隔离（见 bat 注释） |

`src/modules/`、`src/shared/api.js` 等常规目录不赘述；用 `rg` 定位即可。

## 模块与路由

**注册新模块**：`src/modules/<name>/` + 写入 `src/app/modules.js` 的 `APP_MODULES`。挂主布局：`{ parent: "shell" }`（kernel 参数，控制模块加载到 shell 下）。

**Android 返回键**：各 `routes.js` 的 `meta.parent` 是**另一套** parent，给 `__amigaGoBack` 用。勿与 `APP_MODULES` 的 `parent: "shell"` 混淆。

- Wizard 未完成时 `routeGuards.js` 强制 `/wizard`；完成后不可再进 wizard。
- 返回键 parent 表与测试： [android-native.md](./android-native.md) §路由父级、`AmigaGoBack.spec.js`。

后端调用只经 `src/shared/api.js`；Vite 别名 `@` → `src/`。

## Rust / Tauri

`commands/` 薄 IPC，`modules/` 业务。新增：`modules/` → `commands/` → `api.js`。改 schema 只追加 migration（见 conventions）。

## Android

日常 **`run-android.bat`**（设备自动检测，HMR + 增量 Rust）。Release APK：**`build-android.bat`**。Kotlin 只改 `src-tauri/android/...`，经 `scripts/android-patch.cjs` 同步到 `gen/`。

## 常用命令

| 命令 | 用途 |
|------|------|
| `npm test` / `npm run test:all` | 前端 / 全量 |
| `run-windows.bat` / `run-windows-2.bat` | Windows Tauri dev |
| `run-android.bat` | Android dev |
| `build-android.bat` | Android release APK |

PowerShell：`npm.cmd run ...`。裸 `npm run dev` 不能验 Tauri IPC。
