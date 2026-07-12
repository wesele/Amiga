# Android ADB 真机调试指南

> **文档定位**：ADB 深度调试（坐标点击、logcat、剪贴板/share 差异等）。**日常 Android 开发**见 [android-native.md](./android-native.md)；**截屏与测试规范**见 [testing.md](./testing.md)。非每次 UI 改动都需读全文。

通过 ADB 在 Android 真机上调试 Tauri 2.x WebView 应用（Amiga）。

## 1. 前置环境

```bash
ANDROID_HOME=~/Android/Sdk   # Windows: %LOCALAPPDATA%\Android\Sdk
NDK=27.0.12077973
JDK=OpenJDK 17
Rust target=aarch64-linux-android (已安装)
```

验证：

```bash
adb devices                          # 确保设备列表非空
rustup target list --installed       # 应有 aarch64-linux-android
```

## 2. 构建与安装（推荐路径）

**Windows 日常**：模拟器用 `run-android-x86.bat`，ARM64 真机用 `run-android-arm.bat`，仅构建 APK 用 `build-android.bat`。运行脚本都会执行 `android-patch.cjs`，并通过 `adb install -r -g` 保留数据覆盖安装。

**Linux 手动等价**（与 `build-android.bat` 一致）：

```bash
npm run build
node scripts/android-patch.cjs
npm run tauri -- android build --target aarch64 --apk
adb install -r -g src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
```

> `android-patch.cjs` 给 debug buildType 注入 release signingConfig，详见 [android-native.md](./android-native.md)。**不要**用 Android debug keystore 手动签名 release APK，否则与已装 dev 包证书不一致 → `INSTALL_FAILED_UPDATE_INCOMPATIBLE`。

### Legacy：unsigned APK 手动签名

仅当 CI 或特殊场景产出 `*-unsigned.apk` 时，才需 `zipalign` + `apksigner`。本地 dev 不应走此路径。GitHub Actions 签名见 [github-actions-cloudflare-pages.md](./github-actions-cloudflare-pages.md)。

## 3. 重启 App

```bash
adb shell am force-stop com.idioma.app
adb shell am start -n com.idioma.app/.MainActivity
```

## 4. 截屏

```bash
adb exec-out screencap -p > screenshots/android-<module>-<step>.png
```

或用 `pwsh scripts/screenshot.ps1`（Windows 上优先，见 [testing.md](./testing.md)）。

## 5. 用 PIL 精确查找按钮坐标（自动化点击）

`adb shell input tap` 依赖**物理像素坐标**。480×800 固定视口在 1080×2460 屏幕上被缩放 + 居中 + 安全区偏移，**肉眼估算必然不准**。

```python
from PIL import Image
img = Image.open('screenshot.png')

for y in range(2000, 2400, 10):
    row = [img.getpixel((x, y))[:3] for x in range(0, 1080, 20)]
    non_white = sum(1 for p in row if p != (255,255,255))
    if non_white > 5:
        xs = [x*20 for x,p in enumerate(row) if p != (255,255,255)]
        print(f"y={y}: count={non_white}, x_range={min(xs)}-{max(xs)}")
```

图对图差异检测、颜色通道扫描等高级用法见历史 UAT 笔记；日常 agent 验证用截屏目视即可。

## 6. 模拟点击

```bash
adb shell input tap <x> <y>
adb shell input swipe <x> <y> <x> <y> 200   # 长按
```

**常见踩坑**：

- 坐标须在 WebView **实际渲染区域**内
- `MainActivity.kt` 的 `installSafeAreaPadding` + `__amigaSetInsets` 使 WebView inner 坐标 ≠ 屏幕坐标；先用 `adb shell dumpsys window windows | grep -A 15 com.idioma.app` 看 `mAppBounds`
- `uiautomator` **抓不到 WebView 内 DOM**（单一 WebView 节点）

## 7. 查看日志

```bash
adb logcat -d -s "Amiga/Main"        # MainActivity Kotlin
adb logcat -d -s "RustStdoutStderr"  # Rust println
adb logcat -d --pid=$(adb shell pidof com.idioma.app) | tail -50
```

Release build 默认不转发 `console.log()` 到 logcat；需要时用 Chrome DevTools 远程调试 WebView。

## 8. Share / 剪贴板平台差异

| 平台 | Web Share API | 表现 |
|------|---------------|------|
| MIUI Chromium WebView | 常不可用 | 走剪贴板 fallback |
| Tauri Windows | 不可用 | 走剪贴板 fallback |

实现见 `NewsReader.vue` 的 `onShare()`。MIUI 上剪贴板验证可 `adb logcat -d | grep -i clipboard`（无可靠 `adb shell cmd clipboard get-text`）。

## 9. 完整调试 checklist

- [ ] `adb devices` → device authorized
- [ ] `build-android.bat` 或对应设备的 `run-android-x86.bat` / `run-android-arm.bat` 正常
- [ ] `adb install -r -g <apk>` → Success（**不要先 uninstall**）
- [ ] 截屏验证 UI
- [ ] logcat 确认 Kotlin / Rust 行为
- [ ] 用户要求 commit 时按 [conventions.md](./conventions.md) 提交
