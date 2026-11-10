# 阿米加 - Amiga

跨平台外语学习应用：Tauri 2.x (Rust) + Vue 3。**正式客户端构建目标仅 Windows 与 Android**（无 iOS 构建）。默认窗口 480×800 移动端布局（Windows 可 resize）。仓库另含特殊 Web TV 演示版本。

## 调试范围与工具（优先规则）

- **只调试标准 Windows debug 版**：使用 `run-windows.bat` 与 `src-tauri/target/debug/idioma.exe`。未经用户针对当前任务明确授权，不启动、构建或调试 Web / Web TV、Windows TV / release、Android、第二实例等其他版本，不为主应用验收额外创建其他版本的调试副本。本轮自行创建的其他版本调试服务、副本与临时产物须停止并删除。
- **禁止使用 Computer Use 调试**：不使用桌面或浏览器的点击、键盘、可访问性树等 Computer Use 自动化；使用命令行、日志、测试及程序接口定位和验证问题。需要截图时使用仓库命令行截图脚本的 `-Mode App`，不自动回退到浏览器截图。
- 本节优先于下文及其他文档中的跨版本构建、Web TV 实测、Android 真机等默认验证要求；这些要求仅在用户明确指定相应版本任务时适用。

## 特别版本：Web TV Demo

独立浏览器演示版（复用主应用 Vue 界面与 TV 布局，非 Tauri 构建，不取代客户端）。云端部署与运维细节（IP/SSH/PM2/Nginx 备选等）详见 [docs/webdemo-deployment.md](./docs/webdemo-deployment.md)。

- **运行与构建**：本地开发 `npm run dev:web -- --host 127.0.0.1`（`http://127.0.0.1:1420/`，需外网权限以代理 LLM）；生产构建 `npm run build:web`（产物在 `dist/`）。
- **架构与契约**：前端经 `src/shared/web/webBackend.js` 兼容层调用 Tauri commands，状态持久化在浏览器 IndexedDB（无登录/多用户/云同步）。新增或修改 command 时必须保持 Tauri 与 WebBackend 参数及返回值契约一致。
- **代理安全红线**：禁止通用代理。LLM 严格使用固定供应商别名与 HTTPS 主机白名单（防 SSRF）。新增 LLM 供应商须同步三处：`src/shared/web/webLlm.js`、`vite.config.js`、`deploy/web/server.js`。服务端 relay 严禁引入数据库或持久缓存等服务端状态。
- **LLM 测试**：连接测试必须执行带超时的真实小型生成（可见输出长度 > 0），严禁用 `/models` 冒充。
- **验证要求（仅用户明确指定 Web 版本任务时）**：改动后运行 `npm run test -- src/shared/web/__tests__` 与 `npm run build:web`；涉及页面时在 `dev:web` 下实测 TV 布局与至少一次真实 LLM 调用。Windows debug 任务不启动或构建 Web 版本。

## Agent 行为

### 模式

- **快捷模式**（用户明确说「快捷模式」或等价指令）：只改代码，跳过确认、截图、编译验证；汇报极简。
- **非快捷模式**（默认）：先中文确认需求与方案再实现；不清楚就问。

### 汇报

- 给结论、改了什么、如何验证；不粘贴长日志、完整 diff 或大段源码，除非用户要求。
- **若修改需要重启后台/服务才能生效，必须在汇报中明确告知用户。**
- 方案确认不算废话；避免无关客套与重复解释。

### Git

- **仅用户明确要求时**才本地 commit；格式见 [docs/conventions.md](./docs/conventions.md)。
- 不要 push，除非用户明确要求。
- 本地 `gh` 认证失效时，**不要要求用户重复登录**；优先使用 Codex 系统 GitHub 连接器读取仓库、Actions job/step/log，并使用现有 Git remote 凭据完成已授权的 push。仅在系统连接器、公开 API 与现有 Git 凭据都无法完成任务时再报告认证阻塞。

## 非快捷模式检查清单

| 改动类型 | 必须做 |
|----------|--------|
| UI（`.vue` / `.css` / 布局 / 交互呈现） | 截图验证（见下）；测完删除截图文件 |
| Rust / Tauri（`src-tauri/` 下 `.rs`、`Cargo.toml`、`tauri*.conf.json`、`capabilities/`） | `cd src-tauri && cargo build`；命令行为须在 Tauri 环境验证 |
| Web 兼容层 / 代理（仅明确指定 Web 版本任务时） | `npm run test -- src/shared/web/__tests__` 与 `npm run build:web` |
| 任意代码 | 跑最接近的测试；跨模块/迁移/权限改动扩大到 `npm run test:all`、`cargo fmt`、`cargo clippy` |
| Android 原生（仅明确指定 Android 任务时） | 只改 `src-tauri/android/...`；Kotlin 改动后重启 dev 循环 |

**截图**（详见 [docs/testing.md](./docs/testing.md)）：首选 `pwsh scripts/screenshot.ps1 -OutFile screenshots/<name>.png`；Android 用 adb screencap；测完删图。

**浏览器 dev**：裸 `npm run dev` 无 Tauri shell，也不会启用 WebBackend，invoke 会 reject；特殊 Web TV 版必须使用 `npm run dev:web`。验证原生 IPC 仍使用 `run-windows.bat` / `run-android-x86.bat` / `run-android-arm.bat`。

**Android 安装**：`adb install -r -g` 覆盖安装，勿先卸载。JS-Kotlin 桥见 [docs/android-native.md](./docs/android-native.md)。

## 读什么文档

- 每轮：**本文件** + [Codex.md](./Codex.md)。
- **Amiga 主应用开发**（`src/`、`src-tauri/`）：[docs/app-development.md](./docs/app-development.md)。
- **改 UI 前**（TV / Web / 手机布局分支）：[docs/modes.md](./docs/modes.md)——4 个模式维度与 `isTvMode` vs `isTvLayoutMode` 的区别。
- **其他主题**（Content Studio、Social 后端、发版/CI、产品背景）：[docs/README.md](./docs/README.md) 按任务选读，不要默认全读。

## 自动化任务

用户要求「提取 GitHub issue 解决」时：拉取最早 open issue → 完成开发 → 关闭 issue。
