# 阿米加 - Amiga (Language Learning App)

## 项目目标
开发一个跨平台（Windows + Android）外语学习应用，类似多邻国。
基于 **Tauri** (Rust 后端) + **Vue 3** (前端) 技术栈。

## 架构设计

### 总体架构
```
┌─────────────────────────────────────────────────────┐
│                 Frontend (Vue 3)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  Module 1 │  │  Module 2 │  │  Module System   │  │
│  │ (Hello)   │  │ (Lessons) │  │  (Kernel/Plugin) │  │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
│       └──────────────┴─────────────────┘            │
│                        │                             │
│              ┌─────────▼─────────┐                   │
│              │   Shared Layer    │                   │
│              │ (Composables,     │                   │
│              │  Stores, API)     │                   │
│              └─────────┬─────────┘                   │
├────────────────────────┼────────────────────────────┤
│              Tauri IPC Bridge                        │
├────────────────────────┼────────────────────────────┤
│              Backend (Rust)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Database  │  │  Audio   │  │   Commands       │  │
│  │ (SQLite)  │  │  (TTS)   │  │   (IPC handlers) │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
├─────────────────────────────────────────────────────┤
│           Platform Targets                           │
│     Windows (WinWebView2) + Android (WebView)       │
└─────────────────────────────────────────────────────┘
```

## GitHub Release 工作流

### 发布规范
- **所有 GitHub Release 说明必须使用中英双语**，中文在上，英文在下，中间用 `---ENGLISH---` 分隔
- 发布由 `release-github.bat` 自动完成，顺序：前端构建 → Windows 构建 → Android 构建 → 发布到 GitHub

### Android APK 签名
- Release APK 使用 `src-tauri/amiga-release.keystore` 签名（详见 `src-tauri/gen/android/app/build.gradle.kts`）
- Keystore 密码：见 `src-tauri/gen/android/app/keystore.properties`（已 .gitignore，不提交）
- 生产环境请更换密码并安全保管 keystore

### 发布步骤
1. 确认所有代码已提交且测试通过
2. 更新版本号：运行 `release-github.bat` 或手动用 Node.js 修改（**严禁使用 PowerShell `Set-Content`**，否则 UTF-8 中文会损坏/添加 BOM）
3. 运行 `release-github.bat`（交互式，需手动输入版本选择和双语发布说明）
4. 脚本自动构建 Windows（MSI + NSIS + EXE）和 Android APK 并上传至 GitHub Releases

### ⚠️ 版本更新注意事项（重要）
- **禁止使用 PowerShell 的 `Set-Content` 修改含中文的文件**（会写入 UTF-8 BOM 破坏 Vite 构建并导致中文乱码）
- **正确做法**：使用 Node.js 脚本读写文件（`fs.readFileSync(path, 'utf8')` / `fs.writeFileSync(path, content, 'utf8')`）进行版本替换
- 如果不小心用 PowerShell 添加了 BOM，用以下 Node.js 代码移除：
  ```js
  const fs = require('fs');
  const buf = fs.readFileSync(path);
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF)
    fs.writeFileSync(path, buf.slice(3));
  ```
- 构建前运行 `npm run build` 确认没有 BOM/Vite 解析错误

## Content Studio (内容生产系统)
位于 `content-studio/` 目录，是一个独立的内部工具集，用于课程设计和题目生产。
- **核心功能**: 语言对管理、词库管理、基于 AI 的单元框架设计、自动题目生成、以及 AI 提示词管理。
- **数据存储**: 采用 `localStorage` 快速原型开发，支持数据的导出与导入。
- **异步操作规范**: 所有耗时操作（如 AI 生成）必须通过 `useAsyncOperation` 触发，并在 `AsyncLoading` 遮罩层中实时显示状态消息和详细的进度日志（参考 `QuestionBank.vue` 中的 "AI 生成题目" 实现流式日志与状态更新的模式），严禁直接使用简单的 `loading` 标志导致界面死锁或缺乏反馈。

## 技术栈
- **Frontend**: Vue 3 + Vite + Vue Router + Pinia
- **Desktop**: Tauri 2.x (Rust)
- **Mobile**: Tauri Mobile (Android)
- **Database**: SQLite via rusqlite (Rust native, not tauri-plugin-sql)
- **Audio**: tauri-plugin-audio / system TTS
- **I18n**: vue-i18n
- **Build**: Vite + Cargo

## 自动化测试

### 测试命令
| 命令 | 说明 |
|------|------|
| `npm test` | 运行前端 Vitest 测试 |
| `npm run test:watch` | 前端测试监听模式 |
| `npm run test:rust` | 运行 Rust 后端测试 |
| `npm run test:all` | 运行全部测试（前端 + 后端） |

### 测试架构

#### 前端测试 (Vitest + happy-dom)
- **位置**: `src/**/__tests__/*.spec.js`
- **框架**: Vitest v4 + happy-dom + @vue/test-utils
- **测试范围**:
  - `src/shared/__tests__/api.spec.js` — API 函数的 invoke 调用验证
  - `src/shared/__tests__/kernel.spec.js` — 模块加载、路由注册、插件系统
  - `src/shared/__tests__/eventBus.spec.js` — 事件总线发布/订阅/清理
  - `src/stores/__tests__/app.spec.js` — Pinia 存储状态管理
  - `src/modules/**/__tests__/*.spec.js` — 各模块业务逻辑

#### Rust 后端测试 (内置 `#[cfg(test)]`)
- **位置**: 各模块文件内以 `#[cfg(test)] mod tests` 形式编写
- **数据库测试**: 使用 `DatabasePool::new_in_memory()` 创建内存 SQLite 数据库，无需文件系统
- **测试范围**:
  - `database.rs` — 数据库初始化、迁移版本追踪、外键约束、表结构
  - `user.rs` — 用户 CRUD、向导状态、学习目标 CRUD
  - `vocabulary.rs` — 词库导入、用户词汇初始化、掌握度更新、未知词查询、统计
  - `news.rs` — 文章 CRUD、阅读日志、连载记录、改写保存、双语缓存

### 测试规范（必须遵守）

1. **每次代码更新必须同步编写或更新自动化测试**
2. **修改 Rust 后端模块**（user.rs / vocabulary.rs / news.rs / llm.rs / database.rs）后，必须在同一文件的 `#[cfg(test)]` 区块中为新增功能添加测试
3. **修改前端共享层**（api.js / kernel.js / eventBus.js / stores）后，必须在对应的 `__tests__/` 目录下添加/更新测试
4. **新增模块**（`src/modules/*/`）必须创建对应的 `__tests__/` 目录并编写测试
5. **运行 `npm run test:all` 确认全部测试通过**，方可提交代码
6. 禁止提交导致测试失败的代码

### 架构对测试的支持

为了让代码可测试，以下架构约定已建立：

#### 前端可测试性约定
- **API 层可注入**: `api.js` 导出 `__setInvoke(fn)` / `__resetInvoke()`，测试时可用 mock 函数替换 Tauri 的 `invoke`，验证 API 调用参数和返回值
- **Kernel 可实例化**: 导出 `Kernel` 类和预置 `kernel` 单例，测试可创建独立实例（`new Kernel()`），通过 `loader` 参数注入模块模拟，避免真实动态导入
- **EventBus 可清理**: 导出 `EventBus` 类和 `clear()` 方法，测试间通过 `clear()` 隔离状态
- **Pinia Store 可隔离**: Vitest 中通过 `setActivePinia(createPinia())` 为每个测试创建独立 store

#### Rust 可测试性约定
- **内存数据库**: `DatabasePool::new_in_memory()` 使用 SQLite 内存模式，无需文件 I/O，每个测试独立数据库
- **模块独立测试**: 每个模块的测试只依赖自己的函数，不依赖 Tauri 运行时