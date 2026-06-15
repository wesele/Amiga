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
1. `npm run tauri dev` - 启动 Windows 开发服务器
2. `npm run tauri build` - 构建 Windows 版本
3. `npm run tauri android dev` - Android 开发
4. `npm run tauri android build` - 构建 Android APK

## Content Studio (内容生产系统)
位于 `content-studio/` 目录，是一个独立的内部工具集，用于课程设计和题目生产。
- **核心功能**: 语言对管理、词库管理、基于 AI 的单元框架设计、自动题目生成、以及 AI 提示词管理。
- **数据存储**: 采用 `localStorage` 快速原型开发，支持数据的导出与导入。
- **异步操作规范**: 所有耗时操作（如 AI 生成）必须通过 `useAsyncOperation` 触发，并在 `AsyncLoading` 遮罩层中实时显示状态消息和详细的进度日志（参考 `QuestionBank.vue` 中的 "AI 生成题目" 实现流式日志与状态更新的模式），严禁直接使用简单的 `loading` 标志导致界面死锁或缺乏反馈。

## 技术栈
- **Frontend**: Vue 3 + Vite + Vue Router + Pinia
- **Desktop**: Tauri 2.x (Rust)
- **Mobile**: Tauri Mobile (Android)
- **Database**: SQLite via tauri-plugin-sql
- **Audio**: tauri-plugin-audio / system TTS
- **I18n**: vue-i18n
- **Build**: Vite + Cargo

## 当前状态
- [x] 项目初始化 & AGENTS.md
- [x] 模块化内核（Kernel）+ 模块注册/懒加载机制
- [x] Shell 模块（AppShell 布局）+ Hello 演示模块
- [x] Rust 后端骨架（commands / modules / tauri 配置）
- [x] Content Studio 内容生产系统（词库、题型、AI 生成、Prompt 管理）
- [ ] 正在设计功能说明书，所有功能设计修改请同步更新 ./docs 下的 html
  - [x] 产品定位、语言支持、内容结构、设计语言、导航
  - [x] 学习模块：晋级之路（CEFR 分级题库 A1/A2/B1）、AI 口语练习、单词本、新闻阅读
  - [x] 排行模块、互动模块（好友+双语聊天）、个人模块
  - [x] 新用户向导
  - [ ] 游戏化系统、进度追踪、测验考试、模块架构、数据模型、AI 功能、开发路线图（文件已创建，待整合到侧边栏）
