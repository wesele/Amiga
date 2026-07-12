# 阿米加 - Amiga

跨平台外语学习应用：Tauri 2.x (Rust) + Vue 3。**构建目标仅 Windows 与 Android**（无 iOS 构建）。默认窗口 480×800 移动端布局（Windows 可 resize）。

## Agent 行为

### 模式

- **快捷模式**（用户明确说「快捷模式」或等价指令）：只改代码，跳过确认、截图、编译验证；汇报极简。
- **非快捷模式**（默认）：先中文确认需求与方案再实现；不清楚就问。

### 汇报

- 给结论、改了什么、如何验证；不粘贴长日志、完整 diff 或大段源码，除非用户要求。
- 方案确认不算废话；避免无关客套与重复解释。

### Git

- **仅用户明确要求时**才本地 commit；格式见 [docs/conventions.md](./docs/conventions.md)。
- 不要 push，除非用户明确要求。

## 非快捷模式检查清单

| 改动类型 | 必须做 |
|----------|--------|
| UI（`.vue` / `.css` / 布局 / 交互呈现） | 截图验证（见下）；测完删除截图文件 |
| Rust / Tauri（`src-tauri/` 下 `.rs`、`Cargo.toml`、`tauri*.conf.json`、`capabilities/`） | `cd src-tauri && cargo build`；命令行为须在 Tauri 环境验证 |
| 任意代码 | 跑最接近的测试；跨模块/迁移/权限改动扩大到 `npm run test:all`、`cargo fmt`、`cargo clippy` |
| Android 原生 | 只改 `src-tauri/android/...`；Kotlin 改动后重启 dev 循环 |

**截图**（详见 [docs/testing.md](./docs/testing.md)）：首选 `pwsh scripts/screenshot.ps1 -OutFile screenshots/<name>.png`；Android 用 adb screencap；测完删图。

**浏览器 dev**：裸 `npm run dev` 无 Tauri shell，invoke 会 reject；验 IPC 用 `run-windows.bat` / `run-android-x86.bat` / `run-android-arm.bat`。

**Android 安装**：`adb install -r -g` 覆盖安装，勿先卸载。JS-Kotlin 桥见 [docs/android-native.md](./docs/android-native.md)。

## 读什么文档

- 每轮：**本文件** + [Codex.md](./Codex.md)。
- **Amiga 主应用开发**（`src/`、`src-tauri/`）：[docs/app-development.md](./docs/app-development.md)。
- **其他主题**（Content Studio、Social 后端、发版/CI、产品背景）：[docs/README.md](./docs/README.md) 按任务选读，不要默认全读。

## 自动化任务

用户要求「提取 GitHub issue 解决」时：拉取最早 open issue → 完成开发 → 关闭 issue。
