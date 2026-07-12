# Content Studio — 内容生产系统

独立内部工具集，位于 `content-studio/`，用于课程设计和题目生产。主应用 agent 仅在内容/词库/题目相关任务时进入。

## 启动

```bash
cd content-studio
npm install
npm run dev    # http://localhost:5180 ，hash 路由
```

Windows PowerShell 用 `npm.cmd run dev`（见 [Codex.md](../Codex.md)）。

配置含 API key 的 `studio.config.json` 在本地生成，**已 gitignore**，勿提交。

## 技术栈

- Vue 3 + Vite + Pinia + vue-router (hash)，port **5180**
- 存储：`localStorage` + Vite dev server 中间件持久化 JSON 到 `content-studio/data/`
- LLM：SSE 流式 + 非流式，支持 reasoning 模型

## 目录结构

```
content-studio/
├── data/                      # 持久化 JSON（dev server 读写）
│   ├── vocabulary.json        # ⚠️ 主应用 Rust include_str! 编译引用；fresh clone 可能不存在
│   ├── questions/             # 按 pairId/CEFR 分片的题库 + index.json
│   ├── prompts.json
│   ├── system-config.json
│   └── images/
├── src/
│   ├── main.js                # 6 个异步 init + migrate
│   ├── composables/           # 10 个
│   │   ├── useAsyncOperation.js
│   │   ├── useLLM.js
│   │   ├── useStorage.js
│   │   ├── useVocabStorage.js
│   │   ├── usePromptStorage.js
│   │   ├── useQuestionTypeStorage.js
│   │   ├── useUnitFramework.js
│   │   ├── useSystemConfig.js
│   │   ├── useValidator.js
│   │   └── useImageGen.js
│   ├── data/                  # 静态种子（question-types.js, units.js）
│   ├── router/index.js        # 6 条业务路由 + / → /bank redirect
│   └── views/                 # 7 个页面
├── vite.config.js             # 配置 API + /api/data 持久化中间件
└── README.md                  # 指向本文件
```

## 核心约定

| 约定 | 说明 |
|------|------|
| 异步操作 | 必须通过 `useAsyncOperation`，在 `AsyncLoading` 显示进度（参考 `QuestionBank.vue`） |
| 数据持久化 | `/api/data/:type` 中间件读写 `data/*.json` |
| 题库持久化 | `/api/questions` 使用分片 revision；题目按 `pairId/CEFR` 存储 |
| LLM | `useLLM.js`：SSE 解析、JSON 提取、自动降级 |
| 词库 | `data/vocabulary.json` 被主应用 `src-tauri/src/modules/vocabulary.rs` `include_str!` 引用 |

## 题库分片

- 入口清单：`data/questions/index.json`。
- 分片路径：`data/questions/<pairId>/<CEFR>.json`。
- Studio 使用分片 revision 防止多窗口和外部脚本互相覆盖。
- 小节重新生成通过服务端原子替换，失败时保留旧题。
- Amiga 的 `src-tauri/build.rs` 在编译时根据清单聚合所有分片。
- 根目录旧 `data/questions.json` 仅为迁移源，不再被 Studio 或 Amiga 读取；重新迁移可运行 `node scripts/migrate-question-shards.mjs`。

## vocabulary.json 说明

- **Fresh clone 可能没有此文件**；CI 会生成 minimal fixture 供 Rust 编译/测试。
- 本地开发：在 Content Studio「词库管理」维护，或用 `content-studio/scripts/` 下 seed 脚本（如 `seed-zh-es-a2.mjs`）生成。
- 发版前须在开发者机器上生成完整词库，确保 Rust 编译 bundle 正确。
- 路径：`content-studio/data/vocabulary.json`（非 `src/data/`）。

## 路由

| path | name | 页面 |
|------|------|------|
| `/bank` | bank | QuestionBank |
| `/system-config` | system-config | SystemConfig |
| `/vocab` | vocab | VocabManager |
| `/type-manager` | type-manager | QuestionTypeManager |
| `/prompt-manager` | prompt-manager | PromptManager |
| `/prompt-manager/edit/:id` | prompt-editor | PromptEditor |
| `/settings` | settings | Settings |
