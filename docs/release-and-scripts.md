# 发布与脚本

## 发布规范

- GitHub Release 说明 **中英双语**，`---ENGLISH---` 分隔
- `release-github.bat` → `scripts/release.cjs`（自动版本号 + 构建 + 发布）
- 版本更新用 Node.js 脚本，**严禁 PowerShell `Set-Content`**（BOM 破坏 Vite）
- 版本号同步：`package.json` / `Cargo.toml` / `tauri.conf.json` / `tauri.android.conf.json`
- Android 签名 keystore：`src-tauri/amiga-release.keystore`（**gitignore**，本地/CI secrets 自备）

CI/CD 与 Cloudflare Pages 详见 [github-actions-cloudflare-pages.md](./github-actions-cloudflare-pages.md)。

## 构建

- Windows: MSI + NSIS + EXE（`npx tauri build`）
- Android: `build-android.bat` → `tauri android build --target aarch64 --apk`
- Android release 运行：模拟器用 `run-android-x86.bat`，ARM64 真机用 `run-android-arm.bat`（见 [android-native.md](./android-native.md)）

## 脚本

| 文件 | 职责 |
|------|------|
| `scripts/release.cjs` | 全自动发布：版本更新 → **脚本内** git commit → 构建 → GitHub Release（与 agent 日常 commit 策略无关） |
| `scripts/bump-version.cjs` | 同步 `package.json` / `Cargo.toml` / `tauri.conf.json` 等版本号 |
| `scripts/run-all-tests.cjs` | `npm run test:all` 入口（前端 + Rust 并行） |
| `scripts/screenshot.ps1` | 按窗口标题截屏到 PNG（默认标题 `Amiga`） |
| `scripts/android-patch.cjs` | 把 `src-tauri/android/` 同步到 `gen/`（mtime 比对，`--force` 强刷） |
| `scripts/extract-android-icon.cjs` | 从 release APK 提取 launcher icon → `public/amiga-icon.png` |
| `scripts/start-windows-dev.ps1` | `run-windows.bat` 背后 dev 启动 |
| `scripts/start-windows-2-dev.ps1` | 第二隔离实例 dev |
| `scripts/test-bump-lock.cjs` / `test-cargo-lock*.cjs` | 锁文件一致性测试 |
| `scripts/setup-env.sh` | Linux/macOS 环境设置 |
| `scripts/setup-ci-secrets.ps1` | GitHub Actions secrets 辅助配置 |

UAT / smoke：`scripts/user-acceptance-test*.ps1`、`scripts/gui-social-smoke.ps1`、`scripts/test-social-dual.mjs`（按需使用，非日常 agent 必读）。
