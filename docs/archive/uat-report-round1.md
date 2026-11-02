# Amiga 用户验收测试报告 — Round 1

**测试日期:** 2026-07-01  
**测试环境:** Windows Tauri dev (480×800)  
**测试方式:** 自动化截图 + 子代理视觉分析  
**截图目录:** `screenshots/uat-round1/`, `screenshots/uat-round1b/`

## 测试范围

| 模块 | 路由 | Round 1 状态 |
|------|------|-------------|
| 学习中心 | `/learn` | ✅ 已测 |
| 晋级之路 | `/learn/path` | ✅ 已测 |
| 今日热搜 | `/news` | ✅ 已测 |
| 新闻阅读器 | `/news/:id` | ✅ 已测 |
| 单词本 | `/vocab` | ⚠️ 导航受阻（阅读器遮挡底栏） |
| 聊天 | `/chat` | ⚠️ 同上 |
| 个人中心 | `/profile` | ⚠️ 同上 |
| 设置 / LLM | `/profile/settings`, `/profile/llm-config` | ⚠️ 同上 |

## 问题汇总

| ID | 严重度 | 模块 | 问题 | 状态 |
|----|--------|------|------|------|
| UAT-001 | major | path | 单元卡片西班牙语副标题被截断 | 🔧 已修复 |
| UAT-002 | major | path | 滚动后副标题截断依旧 | 🔧 已修复 |
| UAT-003 | major | news | 新闻列表标题右侧裁切不可读 | 🔧 已修复 |
| UAT-004 | major | news | 阅读器正文水平裁切 | 🔧 已修复 |
| UAT-005 | minor | news | 日期显示 ISO 格式非本地化 | 🔧 已修复 |
| UAT-006 | minor | news | 阅读器标题截断无省略号 | 🔧 已修复 |
| UAT-007 | cosmetic | learn | 第三个模块（翻译官）需滚动才可见 | 🔧 已修复 |
| UAT-008 | major | test-infra | 自动化脚本在阅读器页面无法切换底栏 | 🔧 脚本已改进 |

## Round 1 通过的流程

- 学习中枢三模块入口渲染正常
- 晋级之路地图加载、A1/A2 切换、节点锁定状态正确
- 新闻列表排序、AI改写/原文徽章、来源链接正常
- 从路径/新闻返回学习中枢导航正常

## 修复内容（Round 1 → Round 2）

- `PathMapPage.vue` — guide-text 弹性布局 + guide-sub 换行
- `NewsList.vue` — 标题 line-clamp + 本地化日期
- `NewsReader.vue` — 全文换行 + word span 正常折行
- `LearnHubPage.vue` — 缩小间距使三模块一屏可见
- 新增/更新对应 `__tests__/` 测试（461 tests passed）

## Round 2 待验证

- [ ] 路径副标题完整显示
- [ ] 新闻列表标题两行可读
- [ ] 阅读器正文无水平裁切
- [ ] 学习中枢三模块同屏
- [ ] 单词本 / 聊天 / 个人中心截图回归