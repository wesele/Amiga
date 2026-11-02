# 运行模式矩阵

改 UI 前先确认「这段逻辑在哪种模式下生效」。项目里同时存在 **4 个独立维度**，它们互相正交，很容易混用。唯一真源：`src/shared/appMode.js`。

## 四个维度

| 维度 | 判定 | 由谁决定 |
|------|------|----------|
| **功能模式** `appMode` | `VITE_AMIGA_TV=1` → `"tv"`，否则 `"default"` | 构建时（`release.yml` 的 TV 构建、`scripts/start-windows-tv-dev.ps1`） |
| **宿主** | `isTauri()` 为真 = 桌面/Android 原生；否则浏览器 | 运行时 |
| **Web 演示** `isWebMode` | `VITE_AMIGA_WEB=1` 且非 Tauri | 构建时（`npm run build:web` / `dev:web`） |
| **手机浏览器** `isMobileWebMode` | `VITE_AMIGA_WEB_PHONE=1`，或 UA / 触摸 + 屏宽 ≤ 600 命中 | 运行时 |

## 派生出的两个关键值

```
layoutMode      = (appMode === "tv" && !(isWebMode && isMobileWebMode)) ? "tv" : "default"
isTvLayoutMode  = layoutMode === "tv"
```

也就是说：**`appMode` 是「这个构建是不是 TV 版」，`layoutMode` 是「现在这块屏幕要不要按电视布局渲染」**。Web TV 演示版在手机浏览器里打开时，`appMode` 仍是 `tv`（功能集合是 TV 的），但 `layoutMode` 会降级成 `default`（布局按手机来）。

## 什么时候用哪个

| 你想做的事 | 用 |
|------------|-----|
| 调整布局、间距、字号、焦点框、遥控器可操作性 | `isTvLayoutMode`（36 个文件在用，**最常用**） |
| 决定某个功能模块在不在（TV 版没有 chat / speaking / ai-chat） | `isTvMode` + `src/app/modules.js` 的 `tv: true` 标记 |
| 决定某个模块在 Web 演示版里是否隐藏 | `isWebMode` + 模块的 `clientOnly` 标记（`AppShell.vue` / `LearnHubPage.vue`） |
| 决定某个 Tauri 能力在浏览器里怎么办 | `isWebMode`，或直接在 `src/shared/web/webBackend.js` 里分支 |
| 原生专属命令 | `src/shared/web/nativeOnlyCommands.js`（由 `contractParity.spec.js` 守护） |

## 三个容易踩的坑

1. **`parent` 有两个含义。** `src/app/modules.js` 里的 `parent: "shell"` 是「加载到 shell 布局下」；各模块 `routes.js` 里 `meta.parent` 是「Android 返回键回到哪」。两者无关，不要互相套用。

2. **`isTvMode` 不等于 `isTvLayoutMode`。** 前者管功能集合，后者管渲染。用 `isTvMode` 去调样式，Web TV 在手机上会错乱；用 `isTvLayoutMode` 去决定模块加载，TV 构建会漏模块。

3. **Web 模式下模块是「隐藏」不是「不可用」。** 隐藏靠 `clientOnly` 标记，命令层仍可能被调用。新增模块时若只支持原生，记得同时在 `nativeOnlyCommands.js` 登记它用到的命令，否则 `contractParity.spec.js` 会失败。

## 验证方式

- 原生：`run-windows.bat`（默认）、`run-windows-tv.bat`（TV 布局）
- Web 演示：`npm run dev:web -- --host 127.0.0.1`（桌面布局）、加 `VITE_AMIGA_WEB_PHONE=1` 模拟手机布局
- 裸 `npm run dev` 没有 Tauri shell，也不会启用 WebBackend，`invoke` 会走 mock 分支——**不能用来验证真实 IPC**。
