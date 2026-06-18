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

### 模块化设计原则
- 每个功能模块独立文件夹，包含：组件、路由、状态、定义
- 模块注册系统：模块通过 `ModuleDefinition` 接口注册到内核
- 插件架构：支持模块间通信和扩展
- 延迟加载：模块可被懒加载

## 功能说明书 (Product Design Docs)
位于 `./docs` 目录，采用纯 HTML 格式的交互式产品交互设计文档，可直接浏览器打开。

### 文档架构
```
docs/
├── index.html                    # 导航主页（左中右三栏布局：侧边栏 + 功能说明 + 原型预览）
├── pages/
│   ├── sections/*.html           # 功能章节页面（可独立打开，也可嵌入 index.html）
│   └── prototypes/*.html         # 手机端原型页面（模拟手机 UI 的交互原型）
├── shared/                       # 共享 CSS / JS / 数据
│   ├── base.css, components.css, variables.css, phone.css
│   ├── data.js                   # 全局数据定义（题库、排行榜、课程节点等）
│   └── app.js
└── phone/                        # 手机原型组件（screens + tabbar）
```

### 已完成章节
| 分类 | 章节 | 文件 |
|------|------|------|
| 整体介绍 | 产品定位 | vision |
| 用户引导 | 新用户向导 | wizard |
| 功能模块 | 学习（新闻阅读）、排行(暂不开发)、互动(暂不开发)、个人 | learning / ranking / interaction / personal |

### 编写规范
- 所有功能设计修改请同步更新 `./docs` 下的 HTML 文件
- 每个 section 页面支持 `?embed=1` 参数，嵌入模式下隐藏侧边栏、调整间距
- 通过 `parent.postMessage({type:'nav', ...})` 与 index.html 父页面通信切换原型
- 复杂功能模块（如学习）使用 Tab 切换子功能，Tab 切换时同步更新右侧原型

### 开发工作流
- **每次修改代码后**，运行 `npm run tauri dev` 启动应用验证
- `npm run tauri dev` - 启动 Windows 开发服务器
- `npm run tauri build` - 构建 Windows 版本
- `npm run tauri android dev` - Android 开发
- `npm run tauri android build` - 构建 Android APK

### 开发工作流（AI 使用）
- **每次修改代码并测试通过后**，运行 `.\run-windows.bat`（或 `Start-Process -FilePath "run-windows.bat"`）启动 Tauri 开发服务器，让用户可以直接看到界面效果
- **不要自动发布到 GitHub**，等待用户明确指令
- **版本号规则**：除非用户明确要求增加 major 或 minor 版本号，否则只增加第三位（patch）版本号。例如：0.2.0 → 0.2.1

### 大模型提示词管理规范（必须遵守）
- **App 中所有调用大模型的系统级提示词（system prompt）都必须可配置**，不能硬编码在后端 Rust 代码中
- 默认存放在 `prompts` 数据库表中，通过 `提示词管理`（Prompt Management）功能管理
- 当需要新增 AI 功能时，必须在 `modules/prompts.rs` 的 `ensure_default_prompts()` 中添加默认提示词，并提供对应的 key
- 前端调用 LLM 时，应优先从数据库读取 prompt，数据库无记录时再 fallback 到硬编码（兼容旧数据）
- **所有提示词（包括 AI 对话、翻译、画像分析等）都必须通过提示词管理功能配置**，不允许任何硬编码的系统提示词存在于 Rust 后端代码中
- 新增任何调用 LLM 的功能时，必须先定义 prompt key 并在 `prompts.rs` 中添加默认值，再在功能代码中通过 `get_prompt()` 加载使用

### 配置管理界面规范（必须遵守）
- **所有配置管理界面（如 API 设置、模型参数等）都必须使用单独的页面管理**，不能在当前页面内联展开
- 每个独立配置项作为一个独立页面，通过路由访问（如 `/profile/llm-config`），而不是在父页面中通过展开/折叠形式展示
- 配置页面应包含顶部返回按钮导航回上一级，表单操作（保存/测试）使用显式按钮触发，不应使用自动保存
- 用户从设置菜单或列表页点击配置项时，导航到独立配置页面进行编辑

## GitHub Release 工作流
- `run-windows.bat` 会打开新 CMD 窗口执行 `npm run tauri dev`

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
2. 运行 `release-github.bat`
3. 输入双语发布说明
4. 脚本自动构建所有平台产物并上传至 GitHub Releases

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

## 当前状态
- [x] 项目初始化 & AGENTS.md
- [x] 模块化内核（Kernel）+ 模块注册/懒加载机制
- [x] Shell 模块（AppShell 布局）+ Hello 演示模块
- [x] Rust 后端骨架（commands / modules / tauri 配置）
- [x] Content Studio 内容生产系统（词库、题型、AI 生成、Prompt 管理）
- [x] 自动化测试体系（Vitest 前端 + Cargo test 后端）
- [ ] 正在设计功能说明书，所有功能设计修改请同步更新 ./docs 下的 html
  - [x] 产品定位、语言支持、内容结构、设计语言、导航
  - [x] 学习模块：晋级之路（CEFR 分级题库 A1/A2/B1）、AI 口语练习、单词本、新闻阅读
  - [x] 排行模块、互动模块（好友+双语聊天）、个人模块
  - [x] 新用户向导
  - [x] 自动化测试框架搭建
  - [ ] 游戏化系统、进度追踪、测验考试、模块架构、数据模型、AI 功能、开发路线图（文件已创建，待整合到侧边栏）
