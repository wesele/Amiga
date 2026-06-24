# Android ADB 真机调试指南

通过 ADB 在 Android 真机上调试 Tauri 2.x WebView 应用（Amiga）。

## 1. 前置环境

```bash
ANDROID_HOME=~/Android/Sdk
NDK=27.0.12077973
JDK=OpenJDK 17
Rust target=aarch64-linux-android (已安装)
```

验证：
```bash
adb devices                          # 确保设备列表非空
rustup target list --installed       # 应有 aarch64-linux-android
ls ~/Android/Sdk/platform-tools/adb  # ADB 路径
```

## 2. 构建流程（Linux 等价于 `build-android.bat`）

```bash
# 1) 前端构建
npm run build

# 2) 注入自定义 Android 源码（insets / translate 桥）
node scripts/android-patch.cjs

# 3) Tauri Android 构建（增量 ~5-15min，全量约 30min）
npm run tauri -- android build --target aarch64 --apk
```

产物位于：
```
src-tauri/gen/android/app/build/outputs/apk/universal/release/
├── app-universal-release-unsigned.apk    # 构建输出（未签名）
└── app-universal-release-signed.apk      # 自行签名后（见下）
```

## 3. 签名（release APK → 可安装 APK）

`build.gradle.kts` 没有配置 signingConfig，release APK 默认 **unsigned**。已安装的 debug 版本用的是 Android debug keystore。

```bash
APKSIGNER=$(find ~/Android/Sdk/build-tools -name apksigner | sort -V | tail -1)
ZIPALIGN=$(find ~/Android/Sdk/build-tools -name zipalign | sort -V | tail -1)

$ZIPALIGN -p -f 4 app-universal-release-unsigned.apk aligned.apk

$APKSIGNER sign \
  --ks ~/.android/debug.keystore \
  --ks-pass pass:android \
  --ks-key-alias androiddebugkey \
  --key-pass pass:android \
  --out app-universal-release-signed.apk \
  aligned.apk

# 验证签名
$APKSIGNER verify --print-certs app-universal-release-signed.apk
```

**注意**：签名证书必须与设备上已安装版本**完全相同**，否则 `adb install -r` 会失败（`INSTALL_FAILED_UPDATE_INCOMPATIBLE`）。可以先 `adb pull` 已装 APK 再用 `apksigner verify --print-certs` 看当前签名指纹。

## 4. 安装与重启

```bash
# 安装（覆盖）
adb install -r app-universal-release-signed.apk

# 重启 app
adb shell am force-stop com.idioma.app
adb shell am start -n com.idioma.app/.MainActivity
```

## 5. 截屏

```bash
# PNG 直接 dump
adb exec-out screencap -p > screenshot.png

# 图片尺寸即设备物理分辨率（本例 1080×2460）
python3 -c "from PIL import Image; img=Image.open('screenshot.png'); print(img.size)"
```

### 用 PIL 精确查找按钮坐标

`adb shell input tap` 依赖**物理像素坐标**。480×800 固定视口在 1080×2460 屏幕上被缩放 + 居中 + 安全区偏移，**肉眼估算必然不准**。正确的做法是用 PIL 扫描像素：

```python
from PIL import Image
img = Image.open('screenshot.png')

# 找到同时包含按钮文字的行（非白色像素密集区）
for y in range(2000, 2400, 10):
    row = [img.getpixel((x, y))[:3] for x in range(0, 1080, 20)]
    non_white = sum(1 for p in row if p != (255,255,255))
    if non_white > 5:
        xs = [x*20 for x,p in enumerate(row) if p != (255,255,255)]
        print(f"y={y}: count={non_white}, x_range={min(xs)}-{max(xs)}")
```

再对特定颜色通道检测按钮边界：
```python
# 按钮颜色（例如蓝色 toggle）
def is_blue(p): return p[2] > 180 and p[0] < 150
for y in range(2300, 2370):
    blue_count = sum(1 for x in range(44, 524) if is_blue(img.getpixel((x,y))))
    if blue_count > 10: print(f"blue row at y={y}")
```

### 图对图差异检测

验证点击效果（如中文翻译是否消失）：
```python
before = Image.open('before.png')
after  = Image.open('after.png')
for y in range(800, 1200):
    before_dark = sum(1 for x in range(50,1000,10) if before.getpixel((x,y))[0]<100)
    after_dark  = sum(1 for x in range(50,1000,10) if after.getpixel((x,y))[0]<100)
    if before_dark > 10 and after_dark < 5:
        print(f"content changed at y={y}")
```

## 6. 模拟点击

```bash
# 基本 tap（ACTION_DOWN + ACTION_UP 在 <50ms 内完成）
adb shell input tap <x> <y>

# 长按 swipe（100ms 以上可能被识别为长按/拖动）
adb shell input swipe <x> <y> <x> <y> 200

# touchscreen 别名（有时更可靠）
adb shell input touchscreen tap <x> <y>
```

**常见踩坑**：
- 坐标必须在 WebView **实际渲染区域**内。外部点击会激活系统 UI（状态栏下拉、MIUI 手势等）。
- Tauri 2.x 的 `enableEdgeToEdge()` + WebView padding（`MainActivity.kt:installSafeAreaPadding`）从顶部系统栏和底部导航扣除后，WebView inner 物理坐标 ≠ 屏幕物理坐标。要先用 `dumpsys window` 看 `mAppBounds`。
- 如果点击触发的是系统设置/通知中心，说明坐标落在了 WebView padding 区域外。

## 7. 用 `dumpsys` 查看窗口布局

```bash
# 查看 app 的精确布局边界
adb shell dumpsys window windows | grep -A 15 "com.idioma.app"
# 关注：
#   mAppBounds=Rect(0, 100 - 1080, 2460)   # app 可绘制区域
#   fontWeightAdjustment=50                 # 系统字体缩放（影响布局）
#   mGivenContentInsets / mGivenVisibleInsets

# 查看当前聚焦窗口
adb shell dumpsys window | grep -E "mCurrentFocus|mFocusedApp"
```

## 8. `uiautomator` 的限制

```bash
adb shell uiautomator dump /sdcard/ui.xml
adb pull /sdcard/ui.xml
```

**重要限制**：Tauri 的 WebView 是一个单一的 `android.widget.WebView` 节点，**内部 HTML DOM 不可见**。`uiautomator` 抓不到 WebView 里 `<button>`、`<span>`、Vue `Transition` toast 等元素的 bounds。需要依赖截屏 + PIL 像素分析。

Toast（Vue Transition + `position: fixed`）在 WebView 内部渲染，同样不可见于 uiautomator。

## 9. 查看日志

```bash
# App 进程 PID 专用日志
adb logcat -d --pid=$(adb shell pidof com.idioma.app) | tail -50

# 按 tag 过滤
adb logcat -d -s "Amiga/Main"        # MainActivity Kotlin 日志
adb logcat -d -s "RustStdoutStderr"  # Rust println / eprintln
adb logcat -d | grep -i "chromium"   # WebView 控制台（仅 ANR / 严重错误）

# 清空后抓取
adb logcat -c && adb shell input tap 540 800 && sleep 2 && adb logcat -d
```

**Tauri release build 默认不转发 `console.log()` 到 logcat**。如果需要前端日志，重新构建时在 `tauri.conf.json` 中启用 `devtools: true` 或用 Chrome DevTools 远程调试。

## 10. 验证剪贴板写入（Web Share API fallback）

当 `navigator.share` 不可用时，fallback 到 `navigator.clipboard.writeText()`。验证方法：

```bash
# 方法 1：观察剪贴板变化事件（MIUI 输入法会打 log）
adb logcat -d | grep -i "clipboard"
# 出现 SystemClipboardListener onPrimaryClipChanged + ClipData{T(541)}
# → 剪贴板有 541 字符文本写入

# 方法 2：通过输入法间接读取（Sogou / Gboard 剪贴板面板）
# 无 ADB 直接读取的可靠方式

# 方法 3（部分设备支持）：
adb shell cmd clipboard get-text           # 有些 ROM 未实现
adb shell dumpsys clipboard                # 同上
```

**`cmd clipboard get-text` / `dumpsys clipboard` / `service call clipboard` 在 MIUI 上均不可用**。剪贴板验证只能依赖 logcat 事件 + 截屏验证（如果 toast 能截到）。

## 11. `navigator.share` 行为差异

| 平台 | Web Share API | 表现 |
|------|---------------|------|
| MIUI 14 (Android 14) Chromium 149 WebView | **不可用** | `typeof navigator.share === "undefined"` → 走剪贴板 fallback |
| Google Play Services AOSP WebView | 可能可用 | 弹出系统分享面板 |
| Tauri Windows (Edge WebView2) | 不可用 | 走剪贴板 fallback |

**代码需同时覆盖两条路径**——本项目的 `onShare()` 已实现（`NewsReader.vue:595-641`）。

## 12. Toast 验证的时间窗口

本项目 toast 用 `setTimeout(..., 2500)` 自消失。截屏有约 200~400ms 延迟（`adb exec-out screencap -p` 本身耗时）。**建议序列**：

```bash
adb shell input tap 810 2350    # 点击分享
sleep 0.3                         # 仅等 300ms
adb exec-out screencap -p > toast.png
```

如果 toast 仍没截到，可以给 `showShareStatus` 的 timeout 临时调成 5000ms 再测。

## 13. 完整调试 checklist

- [ ] `adb devices` → device authorized
- [ ] `npm run build` → frontend ok
- [ ] `node scripts/android-patch.cjs` → patches applied
- [ ] `npm run tauri -- android build --target aarch64 --apk` → APK produced
- [ ] `apksigner verify --print-certs <apk>` → debug cert matches installed app
- [ ] `adb install -r <apk>` → Success
- [ ] `adb shell am force-stop com.idioma.app && adb shell am start -n com.idioma.app/.MainActivity`
- [ ] 截屏 `adb exec-out screencap -p > start.png`
- [ ] PIL 像素扫描找按钮坐标 → `adb shell input tap <x> <y>`
- [ ] 二次截屏 → PIL 差异检测验证效果
- [ ] logcat 事件确认后端/剪贴板/网络行为
- [ ] `git commit`（已完成修改后）
