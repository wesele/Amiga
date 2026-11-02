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
│   ├── vocabulary.json        # 主应用 Rust include_str! 编译引用；已纳入版本控制
│   ├── questions/             # 按 pairId/CEFR 分片的题库 + index.json（运行时唯一真源）
│   ├── questions.json         # ⚠️ 旧聚合文件，仅作迁移源；见下方「已知不一致」
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

## 测试

```bash
npm run test:content     # 根目录执行；等价于 npm --prefix content-studio test
```

覆盖：工具函数单测 + **全部题目分片的完整性校验**（必填字段、CEFR/题型规则、sectionId 归属、id 唯一、图片引用）。已并入 `npm run test:all` 与 CI 的 `content-studio` job。

改动题库后**必须**跑一次——题型写错（例如把 `T05` 写成 `05`）不会在 Studio 界面上报错，但会让 App 渲染不出这道题。

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
- 根目录旧 `data/questions.json` 仅为迁移源，Amiga 不再读取；重新迁移可运行 `node scripts/migrate-question-shards.mjs`。

**已知不一致（未修，需产品决策）**：`src/composables/useSystemConfig.js` 的「删除语言对」「删除 CEFR 等级」流程仍在**读写旧 `data/questions.json`**，而运行时题库是分片。结果是删掉的语言对/等级只会从聚合文件里消失，分片文件仍然存在，`build.rs` 照样把它们打进包里。改动这里需要给 `server/questionStore.js` 补一个「删除分片 / 移除 index 条目」的 API。

## vocabulary.json 说明

- **已纳入 git 跟踪**，新克隆仓库即可 `cargo build`，无需任何准备步骤。
- 修改后需重新编译 Rust 才会生效（`include_str!` 是编译期嵌入）。
- 本地维护：Content Studio「词库管理」，或用 `content-studio/scripts/` 下 seed 脚本（如 `seed-zh-es-a2.mjs`）生成。
- 路径：`content-studio/data/vocabulary.json`（非 `src/data/`）。同目录的 `unit-framework.json` 同样被 `path_content.rs` 编译期引用，也必须保持跟踪。

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
