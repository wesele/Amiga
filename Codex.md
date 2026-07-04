# Codex 经验记录

## Android / Gradle / 沙箱

- 需要跑 Gradle、Android build、`tauri android build/dev`、或任何可能下载依赖的命令时，不要先在普通沙箱里试到失败再重跑。网络受限会导致 Gradle wrapper 下载失败，典型错误是 `java.net.SocketException: Permission denied: getsockopt`。
- 遇到这类命令，优先判断是否会触发网络下载或访问用户目录缓存；如果是，直接用 `sandbox_permissions: "require_escalated"` 并给出明确理由。
- 如果 Gradle wrapper 第一次运行要下载发行包，正确做法是直接请求外部权限，例如：
  - `.\gradlew.bat :app:compileUniversalDebugKotlin`
  - `.\gradlew.bat :app:assembleUniversalDebug`
- 这个项目的 Android Gradle task 按 ABI / flavor 拆分，`:app:compileDebugKotlin` 是歧义任务。优先使用：
  - `:app:compileUniversalDebugKotlin`
  - 或按需使用 `:app:compileArmDebugKotlin`
- Kotlin / Android 原生源码只改 `src-tauri/android/...`。编译前运行 `node scripts\android-patch.cjs` 同步到 `src-tauri/gen/android/...`，不要手动编辑 `gen/`。
- `src-tauri/gen/android/...` 是生成目录，验证时可被脚本更新；最终要确认 tracked 源码在 `src-tauri/android/...`。

## PowerShell / npm

- 在 PowerShell 中直接跑 `npm run ...` 可能被执行策略拦截 `npm.ps1`，错误类似“禁止运行脚本”。在本项目优先用 `npm.cmd run ...`。

## 本次教训

- 先判断命令性质，再决定是否申请权限。不要把“预期会被沙箱拦住”的 Gradle 下载命令先跑失败一次，这会浪费时间和上下文。
