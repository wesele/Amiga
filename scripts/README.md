# scripts 索引

根目录 11 个启动脚本 + `scripts/` 23 个实现脚本（另 `__tests__/` 1 个单测）。**入口** = 人直接跑；**内部实现** = 被别的脚本调用，不要直接跑。判断依据均为实际读代码。

## 速查：我要做 X，该跑哪个

| 我要… | 跑这个 |
| --- | --- |
| 改了 Vue 页面想看一眼 | `run-windows.bat`（Vite 热更新，改前端不用重启） |
| 改了 Rust / Tauri command | `run-windows.bat`（检测到 Rust 源码或启动脚本变更才 cargo build debug） |
| 验证 TV 布局 | `run-windows-tv.bat`，再用 `scripts/tv-focus-uat.ps1` 走一遍遥控器 |
| 验证 Web 演示版 | `run-web.bat`（`dev:web`，自动开 127.0.0.1:1420） |
| 跑全量测试 | `npm run test:all`（= `scripts/run-all-tests.cjs`） |
| 改 Kotlin 原生代码 | `node scripts/android-patch.cjs`，再 `run-android-arm.bat` / `run-android-x86.bat` |
| 出 Android APK | `build-android.bat`（arm64 release）；TV 包用 `build-android-tv.bat` |
| 发版 | `release-github.bat`（升版本 + tag + push，CI 出包） |
| 编辑内容库 | `run-content-studio.bat`（:5180） |

## 日常开发

| 脚本 | 用途 | 什么时候用 | 备注 |
| --- | --- | --- | --- |
| `run-windows.bat` | Windows 桌面主实例：复用 :1420 的 Vite，Rust 二进制新鲜就跳过编译 | 日常开发首选 | **入口**；`--full` 强制清端口重建 |
| `scripts/start-windows-dev.ps1` | 真正的启动引擎（清端口 / 起 Vite / cargo build / 起 exe） | 一般不用 | **内部实现**，被下面 3 个 launcher 调用；可直接带参跑 |
| `run-windows-tv.bat` | TV 布局实例：:1430/1431、独立 `target-tv` 与 vite 缓存、窗口标题 `Amiga TV` | 验证 16:9 / 遥控器 | **入口**；可与手机版实例共存 |
| `scripts/start-windows-tv-dev.ps1` | TV 参数预设，转调 `start-windows-dev.ps1` | 不用 | **内部实现** |
| `run-web.bat` | `npm run dev:web -- --host 127.0.0.1 --open` | 验证 Web 演示 / 只改前端 | **入口** |
| `run-content-studio.bat` | 进 `content-studio/` 跑 vite（:5180）并开浏览器 | 编辑内容数据 | **入口**；不含主应用 |
| `scripts/start-windows-2-dev.ps1` | 第二隔离实例（:1422、`idioma-test` 数据目录） | 双实例联调 / 云同步 | **当前不可用**：依赖不存在的 `windows-2/` 影子目录 |

## Android

| 脚本 | 用途 | 什么时候用 | 备注 |
| --- | --- | --- | --- |
| `run-android-x86.bat` | 选模拟器 → 建 x86_64 release APK → `adb install -r -g` → 启动 | 模拟器上验证 | **入口**；转发 `-Platform x86`，`--full` 强制重建 |
| `run-android-arm.bat` | 同上，arm64 真机；设 `AMIGA_DEV=1`（包名 `com.idioma.app.dev`） | 真机上验证 | **入口** |
| `scripts/start-android-release.ps1` | 实现：挑设备、补签名、patch、增量构建、装、启 | 不用 | **内部实现**；硬编码 `C:\Android\sdk`、JDK 17、msys64 路径 |
| `build-android.bat` | 只出 arm64 release APK，不安装 | 出包给别人测 | **入口**；`dist/` 比 `src/` 新会跳过前端构建 |
| `build-android.sh` | 同上，Linux/macOS 版 | 非 Windows 机器 | 与 `.bat` 重复，环境变量是 Linux 路径 |
| `build-android-tv.bat` | TV 包：`AMIGA_TV=1`、`patch --force`、armv7 | 出 TV APK | **入口**；结束会把 patch 还原成手机模式 |
| `run-android.sh` | `tauri android dev` 热重载（`TAURI_DEV_HOST` 自动取 IP） | Linux 上开发 Android | 与 `run-android-*.bat` 目标重叠但方式不同（dev 而非 release）；抢占 1430 与 TV 端口冲突 |
| `scripts/setup-env.sh` | `source` 后设 JAVA_HOME / ANDROID_HOME / NDK_HOME | Linux 首次配置 | 仅 Linux 路径，Windows 用不到 |

## 测试与验收

| 脚本 | 用途 | 什么时候用 | 备注 |
| --- | --- | --- | --- |
| `scripts/run-all-tests.cjs` | 前端 `npm test` + `cargo test` 并行 | 提交前 | **入口**，`package.json` 的 `test:all` 指向它 |
| `scripts/run-all-tests.ps1` | 同样两件事，用 `Start-Job` | 不用 | **与 .cjs 完全重复**，全仓库无引用 |
| `scripts/screenshot.ps1` | 截图：App 窗口（Win32）或 headless Edge | 需要留证 | **工具/内部**，被所有 UAT 脚本调用，也可单独跑 |
| `scripts/user-acceptance-test.ps1` | 主流程点击 + 逐页截图到 `screenshots/uat-roundN` | 大改 UI 后人工验收 | **入口**，需先 `run-windows.bat` |
| `scripts/user-acceptance-test-tabs.ps1` | 只走底栏 vocab / chat / profile | 底栏专项复查 | **与上面重叠**（子集），输出写死 `uat-round1b` |
| `scripts/tv-uat.ps1` | TV 左栏 + 内容页，鼠标点击 + 方向键遍历截图 | TV 布局验收 | **入口**，需先 `run-windows-tv.bat` |
| `scripts/tv-focus-uat.ps1` | 全程只用遥控器键（不碰鼠标）走焦点链 | 验证焦点顺序 | **与 tv-uat 重叠**：覆盖同一界面，方式不同（纯按键） |
| `scripts/operate-tv-app.ps1` | 手动发一串 `SendKeys` + 截一张图 | 临时调试单步 | 与 `tv-focus-uat.ps1` 重叠，粒度更细 |
| `scripts/gui-social-smoke.ps1` | 点开公共群并发一条消息 | 社交链路 UI 冒烟 | **入口**；打的是**生产**群 |
| `scripts/test-social-dual.mjs` | 直连生产 worker，两个用户 WS 互发 | 改 `cloudflare-chat` 后 | **入口**；API 域名硬编码 |
| `scripts/test-soulmate-lang-windows.ps1` | 打开 Soul Mate 生成今日信并校验语言 | 改多语言 prompt 后 | **入口** |
| `scripts/test-cloud-sync-windows.ps1` | 推 D1 schema + Rust 恢复 E2E + 启 windows-2 | 云同步回归 | **当前不可用**：同样依赖不存在的 `windows-2/` |

## 发版

| 脚本 | 用途 | 什么时候用 | 备注 |
| --- | --- | --- | --- |
| `release-github.bat` | patch 版本 +1 → 同步版本文件 → commit → tag → push | 正式发版 | **入口**；本地不构建，靠 tag 触发 `release.yml` |
| `scripts/release.cjs` | 本地全自动：bump → commit → 构建 APK → `gh release create` | 不想等 CI | **与 `release-github.bat` 重叠**（两套路线），当前无脚本调用它 |
| `scripts/bump-version.cjs` | 同步 `package.json` / `Cargo.toml` / `Cargo.lock` / `tauri*.conf.json` / `tauri.properties` | 不用 | **内部实现**，被上面两者和 CI 调用 |
| `scripts/setup-ci-secrets.ps1` | 把本地 keystore 灌进 4 个 GitHub secrets | 首次配 CI 签名 | **一次性**；需 `gh` 已登录 |
| `scripts/extract-android-icon.cjs` | 从 release APK 抽最大 launcher icon → `public/amiga-icon.png` | 换品牌图标后 | **一次性**；aapt 路径写死 `build-tools/36.1.0` |

## 内部工具

| 脚本 | 用途 | 什么时候用 | 备注 |
| --- | --- | --- | --- |
| `scripts/android-patch.cjs` | 把 `src-tauri/android/` 覆盖进 `gen/android/`，注入 manifest 片段、debug 签名、kokoro、jitpack | 改 Kotlin / `init` 之后 | **内部实现**，所有 Android 构建脚本都会调；`--force` 强制覆盖，`AMIGA_TV=1` 切 TV |
| `scripts/__tests__/android-patch.spec.js` | 上面脚本的单测 | 改 patch 逻辑时 | 由 vitest 自动跑，不单独执行 |
| `scripts/generate-cool-screenshots.js` | 用 Edge headless 把 `docs/images` 截图套成宣传图 | 更新宣传素材 | **一次性**；Edge 路径写死 x86 目录，会留 `scripts/temp_mockups/` |

## 疑似可清理（仅列出，未删除）

- `scripts/run-all-tests.ps1` — 与 `.cjs` 同功能，`package.json`、docs 均只指 `.cjs`，全仓库无引用。
- `scripts/start-windows-2-dev.ps1`、`scripts/test-cloud-sync-windows.ps1` — 依赖 `windows-2/` 与 `run-windows-2.bat`，两者都不在仓库里；`run-windows.bat` 头部注释仍指向已删除的 `run-windows-2.bat`。
- `scripts/user-acceptance-test-tabs.ps1` — 输出目录写死 `uat-round1b`，注释「after backing out of nested views」像是修某个 bug 后的一次性补测。
- `scripts/generate-cool-screenshots.js` — 一次性素材生成，Edge 路径写死 `C:\Program Files (x86)`（64 位机器实际在 `Program Files`），产物已提交进 `docs/images`。
- `scripts/extract-android-icon.cjs` — 一次性提取，`aapt` 版本写死；换 SDK 即失效。
- `docs/release-and-scripts.md` 声称 `release-github.bat` 会调 `release.cjs`，实际没有——文档过期，脚本本身可跑。

## PowerShell 注意事项

PowerShell 下用 `npm.cmd run ...`（避免执行策略拦截 `npm.ps1`，见 `Codex.md`）；Gradle / `tauri android build` 需要外部权限直接申请，别先在沙箱里试失败。
