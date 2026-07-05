# Codex 经验记录

Cursor / agent 环境踩坑记录，与 [AGENTS.md](./AGENTS.md) 行为规则互补。Android 架构与 dev 循环见 [docs/android-native.md](./docs/android-native.md)。

## Android / Gradle / 沙箱

- 需要跑 Gradle、Android build、`tauri android build/dev`、或任何可能下载依赖的命令时，不要先在普通沙箱里试到失败再重跑。网络受限会导致 Gradle wrapper 下载失败，典型错误是 `java.net.SocketException: Permission denied: getsockopt`。
- 遇到这类命令，优先判断是否会触发网络下载或访问用户目录缓存；如果是，直接用 `sandbox_permissions: "require_escalated"` 并给出明确理由。
- Gradle wrapper 首次下载应直接请求外部权限，例如：
  - `.\gradlew.bat :app:compileUniversalDebugKotlin`
  - `.\gradlew.bat :app:assembleUniversalDebug`
- 这个项目的 Android Gradle task 按 ABI / flavor 拆分，`:app:compileDebugKotlin` 是歧义任务。优先使用：
  - `:app:compileUniversalDebugKotlin`
  - 或按需使用 `:app:compileArmDebugKotlin`
- Kotlin 源码只改 `src-tauri/android/...`；编译前 `node scripts\android-patch.cjs` 同步到 `gen/`，不要手动编辑 `gen/`。

## PowerShell / npm

- 在 PowerShell 中直接跑 `npm run ...` 可能被执行策略拦截 `npm.ps1`，错误类似「禁止运行脚本」。在本项目优先用 `npm.cmd run ...`。

## 通用原则

- 先判断命令性质，再决定是否申请权限。不要把「预期会被沙箱拦住」的 Gradle 下载命令先跑失败一次，这会浪费时间和上下文。
