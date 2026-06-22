# 约定

## Git 提交规范

任务收尾时自动 commit 到**本地 git**（用户不要求也要做）；push / 发版仍需用户明确要求。

提交前确认 `git status` / `git diff` 干净、无敏感信息。

### 提交信息格式

**中英双语**，用 `---ENGLISH---` 分隔（与 release notes 同风格）：

```
<type>: <中文摘要>

<中文详细说明，可选>

---ENGLISH---

<English summary>

<English details, optional>
```

### 示例

```
refactor: 统一外部链接打开方式，封装 openExternalUrl

新增 src/shared/external.js 提供 openExternalUrl(url) 统一入口。

---ENGLISH---

refactor: Unify external link opener via openExternalUrl

Add src/shared/external.js as single entry for opening external URLs.
```

### type 前缀

`feat` / `fix` / `refactor` / `docs` / `test` / `ci` / `chore` / `build` / `perf` / `style`

## Tauri 命令命名约定

`<verb>_<noun>` 蛇形命名。**当 command 名会与 `modules/` 同模块函数同名时，加 `_cmd` 后缀**（如 `update_user` 模块函数 → `update_user_cmd` command）。`src/shared/api.js` 的 invoke 名要和 Rust 函数名完全一致。

实际现状（`commands/user.rs`）：

```rust
// modules/user.rs
pub fn create_user_from_wizard(...)   // 内部函数，名字不同 → command 不用 _cmd
pub fn update_user(...)               // 跟 command 撞名 → command 加 _cmd

// commands/user.rs
#[tauri::command] pub async fn create_user(...)       // OK
#[tauri::command] pub async fn update_user_cmd(...)   // 加 _cmd 区分
```

## DB Migration 约定

**改 schema** → 在 `migrations.rs` 追加 `MIGRATION_V<N+1>` 并加入 `all_migrations()`，**不要**改历史 migration。

## Tauri 权限约定

**加 Tauri 权限**（如 `core:fs:allow-read`）→ 同时更新 `default.json` 和 `mobile.json`，否则桌面/Android 行为不一致。
