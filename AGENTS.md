# 阿米加 - Amiga

跨平台外语学习应用：Tauri 2.x (Rust) + Vue 3，支持 Windows 与 Android。窗口固定 480x800，按移动端形态设计。

## 最高优先级

1. **UI 改动必须截图确认。** 修改任何 `.vue`、`.css`、布局、视觉状态或交互呈现后，必须用 Windows (`run-windows.bat`) 或 Android (`run-android.bat` + `adb exec-out screencap -p`) 截图并亲眼检查。截图流程见 [docs/testing.md](./docs/testing.md) 的“截屏测试”和 [docs/android-adb-debugging.md](./docs/android-adb-debugging.md)。如果当前模型不能直接读图，必须用 `image-describe_describe_image` 查看截图，不能用日志、DOM 文本或用户描述替代。
2. **Rust/Tauri 改动必须编译。** 修改 `src-tauri/` 下任何 `.rs`、`Cargo.toml`、`tauri*.conf.json`、`capabilities/*.json` 后，必须 `cd src-tauri && cargo build` 再继续验证。不要用裸 `npm run dev` 验证 Rust invoke，它走前端 stub。
3. **Android 原生只改 tracked 副本。** Kotlin/Android 原生源码只改 `src-tauri/android/...`，不要手动改 `src-tauri/gen/...`。JS-Kotlin 契约 `__amigaGoBack` / `__amigaSetInsets` / `__amigaTranslateSelection` 不可随意改动。
4. **收尾自动本地 commit。** 任务完成后自动提交到本地 git。
5. 如果是让去提取一个github issue解决，就是自动拉取第一个issue，完成开发流程，成功后关闭该issue。

## 节省上下文规则

- 每轮必读本文件；只在任务涉及 `content-studio/` 时读取 [CONTENT_STUDIO.md](./CONTENT_STUDIO.md)。
- 优先用 `rg` / `rg --files` 定位，再读相关文件。不要为了“了解项目”整目录读文件。
- 只读取和本次修改相关的源码、测试、文档；大文件先按函数、路由、关键字切片读取。
- 需求明确且影响范围小，直接实现；多方案、高风险、跨模块契约、数据迁移、破坏性操作才先确认方案。
- subagent 只用于上下文边界清晰、可并行且收益明显的任务。少于 3 个相关文件的小改默认主 agent 完成。
- 向用户汇报时给结论、改了什么、如何验证；不要粘贴长日志、完整 diff 或大段源码，除非用户要求。

## 任务路由

按任务类型读取最小必要上下文：

| 任务 | 优先读取 |
|------|----------|
| 前端页面/交互 | 相关 `src/modules/<name>/`、`src/shared/api.js`（如涉及 IPC）、相关测试 |
| 全局壳层/路由 | `src/main.js`、`src/modules/shell/`、`src/router/` |
| i18n/语言常量 | `src/shared/i18n/`、`src/shared/constants.js` |
| Tauri command | `src/shared/api.js`、`src-tauri/src/commands/<area>.rs`、`src-tauri/src/modules/<area>.rs` |
| 数据库/schema | `src-tauri/src/modules/migrations.rs`、`database.rs`、相关 module 测试 |
| Android 原生 | `src-tauri/android/...`、[docs/android-native.md](./docs/android-native.md)、[docs/android-adb-debugging.md](./docs/android-adb-debugging.md) |
| 测试/截图流程 | [docs/testing.md](./docs/testing.md) |
| 脚本/发布 | [docs/release-and-scripts.md](./docs/release-and-scripts.md)、相关 `scripts/` 文件 |
| Content Studio | [CONTENT_STUDIO.md](./CONTENT_STUDIO.md)、`content-studio/` 内相关文件 |

## 开发约定

### 前端

- Vue 3 + Pinia + vue-router。功能模块位于 `src/modules/<name>/`，通常包含 `index.js`、`routes.js` 和组件。
- 模块由 `src/main.js` 通过 `kernel.loadModule()` 加载；挂到主布局下的模块使用 `{ parent: "shell" }`。
- 前端调用后端只通过 `src/shared/api.js` 封装的 Tauri invoke，不在组件里直接散落 invoke 名。
- 新增前端模块时：建 `src/modules/<name>/`，补 `index.js` / `routes.js` / 组件，并在 `src/main.js` 注册。

### Rust / Tauri

- 后端分层：`commands/` 是薄 IPC 层，`modules/` 放业务逻辑。
- 新增 Tauri 能力：先加 `src-tauri/src/modules/<area>.rs` 业务函数，再加 `src-tauri/src/commands/<area>.rs` command，最后在 `src/shared/api.js` 加包装。
- command 命名用 `<verb>_<noun>`；和 module 函数同名时 command 加 `_cmd` 后缀。完整约定见 [docs/conventions.md](./docs/conventions.md)。
- 改 schema 时只追加新 migration：在 `migrations.rs` 新增 `MIGRATION_V<N+1>` 并加入 `all_migrations()`，不要改历史 migration；同时补数据库测试。
- 加 Tauri 权限时同时更新 `src-tauri/capabilities/default.json` 和 `mobile.json`。

### Android

- 日常 Android 开发首选 `run-android.bat`，不要每次 `build-android.bat` 后重装。
- 前端改动会通过 Vite HMR 推到模拟器；Rust 改动会增量 build + `adb install -r` 保留数据；Kotlin 改动需要重启 dev 循环让 `android-patch.cjs` 同步到 gen。
- `WindowInsetsCompat` 返回设备像素，CSS `px` 是逻辑像素。`__amigaSetInsets` 收到 inset 后必须除以 `window.devicePixelRatio` 再写 CSS 变量，否则 safe-area 会放大。
- safe-area 问题用 `adb logcat -s Amiga/Main:*` 查看原始 inset，并在 JS 侧确认 DPR 转换后的值。

### Content Studio

- `content-studio/` 是独立子项目，只有涉及课程设计、题目生产、内部内容工具时才读取和修改。
- 依赖、dev server、数据持久化都在子项目内独立处理；先读 [CONTENT_STUDIO.md](./CONTENT_STUDIO.md)。

## 验证策略

- 代码改动必须配套相关测试或说明为什么不需要新增测试。
- 默认跑与改动范围最接近的测试；跨模块、后端、迁移、权限、发布相关改动再扩大到 `npm run test:all`、`cargo fmt`、`cargo clippy`。
- UI 改动除自动测试外还必须截图；截图结论简短记录即可，不要把大段图片描述贴回对话。
- Rust/Tauri 改动必须至少 `cargo build`；涉及命令行为时优先通过 Tauri 环境验证，不用裸 Vite 代替。

## 常用命令

| 命令 | 用途 |
|------|------|
| `npm test` | 前端 Vitest |
| `npm run test:rust` | Rust 测试 |
| `npm run test:all` | 前后端全量测试 |
| `npm run build` | 前端生产构建 |
| `run-windows.bat` | Windows Tauri dev |
| `run-android.bat` | Android dev 循环 |
| `build-android.bat` | Android release APK |

更多命令、截图和发布流程按需读取 [docs/testing.md](./docs/testing.md) 与 [docs/release-and-scripts.md](./docs/release-and-scripts.md)。

## 关键路径

| 路径 | 说明 |
|------|------|
| `src/` | Vue 前端 |
| `src/modules/` | 插件式功能模块 |
| `src/shared/api.js` | 前后端 API 包装 |
| `src-tauri/src/commands/` | Tauri IPC command |
| `src-tauri/src/modules/` | Rust 业务逻辑 |
| `src-tauri/capabilities/` | Tauri 权限 |
| `src-tauri/android/` | Android tracked 原生源码 |
| `content-studio/` | 独立内容生产工具 |
| `docs/` | 深入流程和约定 |
