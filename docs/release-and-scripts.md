# 发布与脚本

## 发布规范

- GitHub Release 说明 **中英双语**，`---ENGLISH---` 分隔
- `release-github.bat` → `scripts/release.cjs`（自动版本号 + 构建 + 发布）
- 版本更新用 Node.js 脚本，**严禁 PowerShell `Set-Content`**（BOM 破坏 Vite）
- 版本号同步：`package.json` / `Cargo.toml` / `tauri.conf.json` / `tauri.android.conf.json`

## 构建

- Windows: MSI + NSIS + EXE
- Android: `build-android.bat` → `tauri android build --target aarch64 --apk`
- Android APK 用 `src-tauri/amiga-release.keystore` 签名

## 脚本

| 文件 | 职责 |
|------|------|
| `scripts/release.cjs` | 全自动发布：版本更新 → 提交 → 前端构建 → Android 构建 → GitHub Release |
| `scripts/bump-version.cjs` | 同步 `package.json` / `Cargo.toml` / `tauri.conf.json` 等版本号 |
| `scripts/screenshot.ps1` | 按窗口标题截屏到 PNG（默认标题 `Amiga`） |
| `scripts/extract-android-icon.cjs` | 从 release APK 提取最高分辨率 launcher icon → `public/amiga-icon.png` |
| `scripts/test-bump-lock.cjs` / `test-cargo-lock*.cjs` | 锁文件一致性测试 |
| `scripts/android-patch.cjs` | 把 `src-tauri/android/` 的源同步到 `gen/`（mtime 比对，`--force` 强刷） |
| `scripts/setup-env.sh` | Linux/macOS 环境设置 |
