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

`src/modules/`、`src/shared/api.js` 等常规目录不赘述；用 `rg` 定位即可。

## 模块与路由

**注册新模块**：`src/modules/<name>/` + 写入 `src/app/modules.js` 的 `APP_MODULES`。挂主布局：`{ parent: "shell" }`（kernel 参数，控制模块加载到 shell 下）。

**Android 返回键**：各 `routes.js` 的 `meta.parent` 是**另一套** parent，给 `__amigaGoBack` 用。勿与 `APP_MODULES` 的 `parent: "shell"` 混淆。

- Wizard 未完成时 `routeGuards.js` 强制 `/wizard`；完成后不可再进 wizard。
- 返回键 parent 表与测试： [android-native.md](./android-native.md) §路由父级、`AmigaGoBack.spec.js`。

后端调用只经 `src/shared/api.js`；Vite 别名 `@` → `src/`。

## Rust / Tauri

`commands/` 薄 IPC（只做参数解包 + 调 `modules/`），`modules/` 放业务。改 schema 只追加 migration（见 conventions）。

### 新增一个 command：一共 5 处

| # | 文件 | 做什么 |
|---|------|--------|
| 1 | `src-tauri/src/modules/<area>.rs` | 真正的实现 |
| 2 | `src-tauri/src/commands/<area>.rs` | `#[tauri::command] pub async fn xxx_cmd(...)` 薄封装 |
| 3 | `src-tauri/src/lib.rs` | 加进 `generate_handler![...]`（漏了这一步调用会报 command not found） |
| 4 | `src/shared/api.js` | `createApiClient` 里加一行 `xxx: (a) => call("xxx_cmd", { a })`，再在文件底部加 `export const xxx = (...args) => defaultApiClient.xxx(...args);` |
| 5 | `src/shared/web/webBackend.js` **或** `src/shared/web/nativeOnlyCommands.js` | Web 演示版要实现就加 `case "xxx_cmd":`；只支持原生就登记到白名单并写明原因 |

第 5 步有守卫：`src/shared/web/__tests__/contractParity.spec.js` 会解析 `lib.rs` 的命令列表，任何命令既没实现也没登记就直接失败。**不要为了让它变绿而往白名单里塞**——先确认对应界面在 Web 模式下确实不可达。

命名规则见 [conventions.md](./conventions.md)：默认 `<verb>_<noun>_cmd`，与 `modules/` 同名函数冲突时才加 `_cmd` 后缀（历史遗留导致两种风格并存）。

### 改前端调用面

`src/shared/api.js` 是**唯一**的后端调用入口（旧 `src/shared/backend/*.js` 转发层已删除）。组件里不要直接 `invoke()`。

## Android

Android release 运行：模拟器用 **`run-android-x86.bat`**，ARM64 真机用 **`run-android-arm.bat`**。两者会复用未过期的 APK并跳过重复安装；Release APK：**`build-android.bat`**。Kotlin 只改 `src-tauri/android/...`，经 `scripts/android-patch.cjs` 同步到 `gen/`。

## 常用命令

| 命令 | 用途 |
|------|------|
| `npm test` / `npm run test:all` | 前端 / 全量 |
| `run-windows.bat` | Windows Tauri dev（debug，复用未过期的 `src-tauri/target/debug/idioma.exe`） |
| `run-android-x86.bat` | x86_64 模拟器 release 运行 |
| `run-android-arm.bat` | ARM64 真机 release 运行 |
| `build-android.bat` | Android phone release APK（arm64） |
| `build-android-tv.bat` | Android TV release APK（`com.idioma.app.tv`，armv7） |

PowerShell：`npm.cmd run ...`。裸 `npm run dev` 不能验 Tauri IPC。
