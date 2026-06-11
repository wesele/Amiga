# Idioma - Language Learning App (Duolingo-like)

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

### 模块列表 (按开发顺序)
1. **hello** - Hello World 演示模块 (当前)
2. **lessons** - 课程系统 (交互式课程)
3. **vocabulary** - 单词本管理
4. **quiz** - 测验/考试模块
5. **progress** - 学习进度追踪
6. **settings** - 用户设置
7. **social** - 社交功能 (排行榜、好友)

### 开发工作流
1. `npm run tauri dev` - 启动 Windows 开发服务器
2. `npm run tauri build` - 构建 Windows 版本
3. `npm run tauri android dev` - Android 开发
4. `npm run tauri android build` - 构建 Android APK

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
- [ ] Hello World 模块 (Windows + Android)
- [ ] 课程系统
- [ ] 单词本
- [ ] 测验系统
- [ ] 进度追踪
- [ ] 设置
- [ ] 发布
