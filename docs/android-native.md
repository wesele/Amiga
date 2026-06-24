# Android 原生层

## 源码管理

Tauri 2.x 把整个 Android 工程生成到 `src-tauri/gen/android/`（**已 gitignore**），包括默认的 `MainActivity.kt`。如果直接在 `gen/` 里改，下一次 `tauri android init` / 升级 CLI 时会被模板覆盖——所以项目把"真正想保留"的 Android 源放在 **tracked** 位置，再由构建脚本同步到 `gen/`：

```
src-tauri/android/app/src/main/java/com/idioma/app/   # 真正的源（git 跟踪）
src-tauri/gen/android/app/src/main/java/com/idioma/app/   # 构建时实际编译的副本（gitignore）
```

### 约定
- **只改** `src-tauri/android/...`；**不要**手动改 `src-tauri/gen/android/...`。
- `build-android.bat` 会按顺序：
  1. 跑 `npm run tauri android init`（如果 `gen/` 不存在）
  2. 跑 `node scripts/android-patch.cjs`，把 `src-tauri/android/` 的文件拷到 `gen/`（mtime 比对，源变才覆盖）；同时给 `gen/android/app/build.gradle.kts` 的 **debug** buildType 注入 `signingConfig = ...release`，让 dev APK 也用 `amiga-release.keystore` 签名
  3. 跑 `npm run tauri android build -- --target aarch64 --apk`
- 想强刷可以 `node scripts/android-patch.cjs --force`。

## 日常 dev 循环（**开发期首选**）

**首选 `run-android.bat`**，不是 `build-android.bat`。它做的是：

```
tauri android dev --target x86_64 --exit-on-panic
```

| 改动类型 | 触发什么 | 耗时 |
|----------|----------|------|
| Vue / CSS / JS | Vite HMR 推到模拟器 WebView，**不重编 Rust、不重装 APK** | <1 s |
| Rust（`src-tauri/src/**.rs`） | 增量 `cargo build` + 自动 `adb install -r`（保用户数据） | 5–20 s |
| Kotlin（`src-tauri/android/**.kt`） | **手动** Ctrl+C 重跑 `run-android.bat`，patch 自动重新同步 | 30+ s |

### 签名一致性（为何 dev 不再撞 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`）

`android-patch.cjs` 给生成 `build.gradle.kts` 的 `debug` buildType 注入：

```kotlin
getByName("debug") {
    // AMIGA-PATCH-BEGIN: debug-signing
    if (keystoreProperties.getProperty("storeFile") != null) {
        signingConfig = signingConfigs.getByName("release")
    }
    // AMIGA-PATCH-END: debug-signing
    ...
}
```

`keystore.properties`（生成时由 `tauri android init` 把 tracked 的 `amiga-release.keystore` 拷过去）已经被 release 用了，现在 debug 也用它 → dev / release 签名证书一致 → `adb install -r` 可以双向覆盖。

例外：手动装过别人签的 APK → 跑一次 `adb uninstall com.idioma.app`（清空 app 数据），之后正常 dev。

## 已自定义的入口

### `MainActivity.kt`
- `enableEdgeToEdge()` 让 status / nav bar 透明
- `setOnApplyWindowInsetsListener` 把 `systemBars()` + `ime()` inset 通过 `window.__amigaSetInsets(top, bottom, left, right)` 传给 JS 层，JS 更新 `--safe-*` CSS 自定义属性。这是 **CSS 层** 解决，让 Android 和 iOS 共享同一套样式（iOS 靠 `env(safe-area-inset-*)`）。
- `OnBackPressedCallback` 拦截系统返回键，调用 `window.__amigaGoBack()`：JS 端读当前路由的 `meta.parent`，有父级就 `router.push({ name: parent })`、无父级返回 `"at-root"`，Kotlin 收到 `"at-root"` 就 `finish()` Activity。这避开了 `history.back()` 走"上一个 URL"的死循环问题。

### `TranslateWindowCallback.kt`
- 用 `WebView.setCustomSelectionActionModeCallback` 注入长按文本选区菜单的「翻译」项
- 点击后调 `window.__amigaTranslateSelection(text)`，由 `NewsReader.vue` 接收

## JS↔Kotlin 契约

以下 JS 全局函数由 Kotlin 端调用，**契约不可随意改动**（前端单测依赖）：

| JS 入口 | 调用方 | 用途 | 前端测试覆盖 |
|---------|--------|------|-------------|
| `window.__amigaGoBack()` | `OnBackPressedCallback` | 返回键导航 | `AmigaGoBack.spec.js` |
| `window.__amigaSetInsets(top, bottom, left, right)` | `setOnApplyWindowInsetsListener` | 传入真实系统栏 inset 值（px），JS 更新 `--safe-*` CSS 变量 | `AppShell.spec.js` |
| `window.__amigaTranslateSelection(text)` | `TranslateWindowCallback` | 长按选区翻译 | `selection.spec.js` |

### `__amigaGoBack` 协议

```js
window.__amigaGoBack = () => {
  const parent = router.currentRoute.value?.meta?.parent;
  if (parent) {
    router.push({ name: parent });  // 注意：必须是 { name }，裸字符串会被当 path
    return "navigated";
  }
  return "at-root";  // Kotlin 收到这个就 finish() 退出
};
```

### 路由父级（`meta.parent`）

每条子路由必须声明 `meta: { parent: "<父级 route name>" }`。当前层级：

```
/wizard          → (root)
/news            → (root)
/news/:id        → news
/vocab           → (root)
/chat             → (root)
/chat/:id          → chat
/chat/preview      → chat
/profile                  → (root)
/profile/settings         → profile
/profile/llm-config/:type → settings
/prompts                  → settings
/prompts/:key             → prompts
```

`src/modules/shell/__tests__/AmigaGoBack.spec.js` 用字符串正则扫每条 routes.js 确认 `meta.parent` 没漏写——加新 detail 路由忘了声明父级会被这条测试抓住。

## 测试

- Kotlin 端**没有** JVM 单元测试（Android-only 路径，happy-dom/jsdom 不可用）。每次 Android 改动后必须用真机/模拟器 adb 验证：
  ```
  adb exec-out screencap -p > screenshots/android-<module>-<step>.png
  ```
- **写 Kotlin 改动时配套加 JS 侧测试**：JS 入口的契约稳定、容易测；Kotlin 端可以重构，但**契约不能动**，否则 AppShell/NewsReader 的单测会断。

## 应用图标

聊天页 / 联系人列表里的「Amiga 头像」来自 `public/amiga-icon.png`，**不是** `src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher.png`（那是 3186 字节的绿方块占位图，不是 Android 桌面上看到的品牌图标）。

- 源：构建出的 release APK 里的最高分辨率 launcher PNG（如 `res/as.png` 432×432）
- 提取：先 `build-android.bat` 跑出 `app-universal-release.apk`，再 `node scripts/extract-android-icon.cjs` 把最大 PNG 拷到 `public/amiga-icon.png`
- 用法：`<img src="/amiga-icon.png">`，由 Vite 走 `public/` pipeline 字节原样输出
- 重新换品牌：换源 PNG → 重建 release APK → 跑脚本
