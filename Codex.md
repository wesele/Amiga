# 环境踩坑记录

与 [AGENTS.md](./AGENTS.md) 的行为规则互补。这里只记「不看就会浪费一轮」的环境事实。Android 架构与 dev 循环见 [docs/android-native.md](./docs/android-native.md)。

> 本文原先按某个具体 agent 工具的语法书写（例如 `sandbox_permissions: "require_escalated"`）。现在改成工具无关的描述：**结论是通用的，怎么申请权限按你所在工具的方式做**。

## Android / Gradle / 沙箱

- 需要跑 Gradle、Android build、`tauri android build/dev`，或任何可能下载依赖的命令时，**不要先在受限沙箱里试到失败再重跑**。网络受限时典型报错是 `java.net.SocketException: Permission denied: getsockopt`，一次失败就要多花一轮。
- 判断标准很简单：**这条命令会不会联网、会不会写用户目录缓存**。会，就直接申请外部/提升权限，并在申请时写清理由（首次下载 Gradle wrapper）。
- 首次构建 Gradle wrapper 的典型命令：
  - `.\gradlew.bat :app:compileUniversalDebugKotlin`
  - `.\gradlew.bat :app:assembleUniversalDebug`
- Android Gradle task 按 ABI / flavor 拆分，`:app:compileDebugKotlin` 是**歧义任务**，会报错。用：
  - `:app:compileUniversalDebugKotlin`
  - 或按需 `:app:compileArmDebugKotlin`
- Kotlin 源码只改 `src-tauri/android/...`；编译前跑 `node scripts/android-patch.cjs` 同步到 `gen/`，**不要手动编辑 `gen/`**（会被下次 patch 覆盖）。

## PowerShell / npm

- PowerShell 里直接跑 `npm run ...` 可能被执行策略拦截 `npm.ps1`（提示「禁止运行脚本」）。本项目一律用 `npm.cmd run ...`。
- 管道会吃掉退出码：`npm test | tail` 的退出码是 `tail` 的。判断测试是否真的通过，看输出里的 `failed` / `Test Files`，或别接管道。

## 数据文件

- `content-studio/data/vocabulary.json` 与 `unit-framework.json` 被 Rust `include_str!` 在**编译期**嵌入，已纳入 git。改动后必须重新 `cargo build` 才生效。
- `content-studio/data/questions/` 是题库唯一真源，`build.rs` 在编译期聚合成 bundle。改题库后跑 `npm run test:content` 校验。

## 通用原则

先判断命令性质，再决定是否申请权限。不要把「预期会被沙箱拦住」的命令先跑失败一次——那是在烧上下文。
