# Content Studio — 内容生产系统

独立内部工具集，位于 `content-studio/`，用于课程设计和题目生产。

## 技术栈
- Vue 3 + Vite + Pinia + vue-router (hash), port 5180
- 存储: `localStorage` + Vite dev server 中间件持久化 JSON 文件
- LLM: SSE 流式 + 非流式调用，支持 reasoning 模型

## 目录结构
```
content-studio/
├── src/
│   ├── App.vue                # AppLayout + AsyncLoading 遮罩
│   ├── main.js                # 6 个异步初始化器引导
│   ├── components/
│   │   ├── AppLayout.vue
│   │   └── AsyncLoading.vue   # 全局加载遮罩 + 进度日志
│   ├── composables/           # 9 个 composable
│   │   ├── useAsyncOperation.js      # 全局异步操作状态管理（单例）
│   │   ├── useLLM.js                 # SSE 流式 + 非流式 LLM 调用
│   │   ├── useStorage.js             # localStorage + API 持久化
│   │   ├── useVocabStorage.js
│   │   ├── usePromptStorage.js
│   │   ├── useQuestionTypeStorage.js
│   │   ├── useUnitFramework.js       # 单元框架设计
│   │   ├── useSystemConfig.js        # 系统配置（语言对）
│   │   └── useValidator.js           # 数据校验
│   ├── data/
│   │   ├── question-types.js         # ⚠️ 生产用词库位于 content-studio/data/vocabulary.json（被 Rust 后端 include_str! 编译引用）
│   │   └── units.js
│   ├── router/index.js        # 7 个 hash 路由
│   └── views/                 # 7 个页面
│       ├── SystemConfig.vue       # 语言对管理
│       ├── VocabManager.vue       # 词库管理
│       ├── QuestionBank.vue       # AI 题目生成（含流式日志范例）
│       ├── QuestionTypeManager.vue
│       ├── PromptManager.vue
│       ├── PromptEditor.vue
│       └── Settings.vue           # API 配置
├── vite.config.js             # Vite 插件：API 代理 + 配置/数据持久化中间件
├── package.json
└── README.md
```

## 核心约定
| 约定 | 说明 |
|------|------|
| 异步操作 | 必须通过 `useAsyncOperation` 触发，在 `AsyncLoading` 中显示状态 + 进度日志（参考 `QuestionBank.vue` 的 AI 生成实现） |
| 数据持久化 | Vite dev server 的 `/api/data/:type` 中间件读写 JSON 文件 |
| LLM 调用 | `useLLM.js` 封装 SSE 流式解析、JSON 提取、自动降级 |
| 词库数据 | `content-studio/data/vocabulary.json` 同时被主应用 Rust 后端编译引用 |
