# Amiga 用户验收测试 — 最终报告

**测试日期:** 2026-07-01  
**迭代轮次:** 5 轮截图自动化 + 3 轮子代理修复  
**环境:** Windows Tauri dev (480×800)

## 结论

从用户角度看，**主要功能模块均可正常使用**，Round 3–4 截图验证了修复效果。剩余问题为次要体验项和数据层历史脏数据，不构成阻断性缺陷。

| 模块 | 状态 | 说明 |
|------|------|------|
| 学习中枢 | ✅ 通过 | 三模块（晋级之路 / 今日热搜 / AI 翻译）同屏可见 |
| 晋级之路 | ✅ 通过 | 副标题完整显示；节点锁定逻辑正确 |
| 单词本 | ✅ 通过 | A1/A2/B 等级卡片与进度统计正常 |
| 聊天 | ✅ 通过 | 联系人列表、公共群聊可进入 |
| 个人中心 | ⚠️ 基本通过 | 功能可用；自动化脚本在会话残留时难切换底栏 |
| 今日热搜 | ✅ 通过 | 列表、日期本地化、徽章正常 |
| 新闻阅读器 | ⚠️ 基本通过 | 布局换行已修；历史 AI 改写内容可能仍显示旧脏数据 |

## 已修复问题

| ID | 严重度 | 修复 |
|----|--------|------|
| UAT-001/002 | major | 路径单元副标题截断 → `PathMapPage.vue` flex 换行 |
| UAT-003 | major | 新闻列表标题裁切 → `NewsList.vue` line-clamp |
| UAT-004/006 | major | 阅读器换行 → `NewsReader.vue` overflow-wrap |
| UAT-005 | minor | 日期本地化 → `Intl.DateTimeFormat` |
| UAT-007 | cosmetic | 学习中枢三模块 → 3 列单行布局 |
| UAT-009 | major | 劣质 AI 改写 → `llm.rs` 输出校验 + 拒绝保存 |
| UAT-010 | minor | 路径节点重复「语言知识」→ caption 去重 + connector 定位 |

## 待观察 / 低优先级

- **UAT-011** 聊天列表最后消息预览截断（如 Amiga 问候语）
- **UAT-012** AI 翻译会话预览含 `***test***` 调试文本
- **UAT-013** 自动化测试需在应用冷启动后运行（阅读器/聊天会话会隐藏底栏）

## 测试基础设施

新增脚本：
- `scripts/user-acceptance-test.ps1` — 全流程截图（先 vocab/chat/profile，后 news）
- `scripts/user-acceptance-test-tabs.ps1` — 底栏专项
- 截图产物：`screenshots/uat-round*/`

## 测试通过

- `npm test` — 462 passed
- `cargo test rewrite` — 5 passed