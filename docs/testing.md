# 测试

## 命令

| 命令 | 范围 |
|------|------|
| `npm test` | 前端 Vitest（一次性，约 45s） |
| `npm run test:watch` | 前端 watch |
| `npm run test:rust` | Rust `cargo test`（内存 SQLite） |
| `npm run test:content` | Content Studio：题目分片完整性校验 |
| `npm run test:all` | 前端 + Rust + Content Studio（入口 `scripts/run-all-tests.cjs`） |
| `npm run lint` | ESLint（0 error 是底线；warning 允许） |
| `cargo fmt` | Rust 格式化（**commit / 发版前必跑**） |
| `cargo clippy` | Rust lint（**commit / 发版前必跑**） |

> **前端 lint**：ESLint 10 flat config（`eslint.config.js`，只开抓真 bug 的规则）+ Prettier 配置（`.prettierrc.json`）。Prettier **尚未**全库重排，`npm run format:check` 会大面积报错，这是预期的；不要顺手 `npm run format`（会产生几百文件的 diff）。
>
> **网络测试默认跳过**：依赖真实外部服务的 Rust 测试带 `#[ignore]`（YouTube 抓取、live LLM 调用、云同步 E2E）。CI 只跑确定性单测；需要时 `cd src-tauri && cargo test -- --ignored`。
>
> PowerShell 下用 `npm.cmd run ...`，避免执行策略拦截 `npm.ps1`（见 [Codex.md](../Codex.md)）。
>
> 裸 `npm run dev` 无 Tauri shell，invoke 会 reject；验证 IPC 须用 `run-windows.bat` / `run-android-x86.bat` / `run-android-arm.bat`。

## 规范

1. **改代码必须同步改测试**。Rust module → 同文件 `#[cfg(test)]`；前端 shared/模块 → 对应 `__tests__/`
2. 新模块必须建 `__tests__/`
3. **用户要求 commit 或发版前**：`npm run test:all` + `cargo fmt` + `cargo clippy` 必须通过

## 截屏测试（界面/视觉改动必做）

- **首选（auto）**：`pwsh scripts/screenshot.ps1 -OutFile screenshots/<module>-<step>.png`
  - 检测到 "Amiga" 窗口 → 截 Tauri 窗口
  - 否则若 Vite 在 :1420 → 用 Edge headless 截 `http://localhost:1420/`
  - 都没有则报错
- **纯前端**（快、不启 Tauri）：`npm run dev` 后
  - `pwsh scripts/screenshot.ps1 -Mode Headless -Url http://localhost:1420/<route> -OutFile screenshots/<module>-<step>.png`
- **Tauri 集成**：启动 `run-windows.bat` 后
  - `pwsh scripts/screenshot.ps1 -Mode App -OutFile screenshots/<module>-<step>.png`
- 同一页面改前/改后各截一张，产物放 `screenshots/`（已 gitignore）；测完删除截图文件
- Android 用 `adb exec-out screencap -p > screenshots/<module>-<step>.png`
- 设计 Android 平台的 bug 或功能一定要在 Android 模拟器或 ADB 连接好的真机测试
- Android 安装 APK 必须用 `adb install -r -g <apk>`（先卸载会导致手机弹出确认弹窗，阻塞自动化）。`-r` 覆盖安装，`-g` 自动授予运行时权限
