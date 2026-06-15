# Idioma 产品功能设计文档

> 版本: v0.1 | 更新: 2026-06-11

---

## 1. 产品定位

### 1.1 愿景
利用 AI 技术提供免费、高质量的多语言学习体验，通过语言学习连接世界。

### 1.2 目标用户
- **全球用户**，支持多语言界面（目前以中文 ↔ 西班牙语为核心打磨）
- 任何想学习新语言的人，从零基础到进阶学习者

### 1.3 差异化
- **AI 驱动** — 利用 AI 生成个性化内容、提供实时反馈、模拟对话练习
- **完全免费** — 无付费墙，可选捐赠模式
- **社区互助** — 母语者与学习者互相帮助（例如中文母语者帮助西语学习者，反之亦然）

### 1.4 收费模式
免费 + 可选捐赠（核心功能全部免费开放）

---

## 2. 支持语言

### 2.1 起始语言对
| 方向 | 说明 |
|------|------|
| 中文 → 西班牙语 | 中文母语者学习西班牙语 |
| 西班牙语 → 中文 | 西语母语者学习中文 |

### 2.2 扩展方向（后续添加）
英语、日语、法语、德语、韩语等语言对将在西班牙语核心体验打磨成熟后逐步加入。

### 2.3 架构要求
- 语言对数据与代码分离，通过配置文件/数据库定义
- 任意语言对可插拔添加
- 支持 LTR 和 RTL 文字方向

---

## 3. 学习内容结构

### 3.1 层级体系
```
 语言 (Language)
  └── 课程 (Course) — 如 "西班牙语零基础→中级"
        └── 单元 (Unit/Section) — 按 CEFR + 场景 + 语法混合组织
              └── 关卡 (Skill/Lesson) — 具体技能点
                    └── 练习 (Exercise) — 单个互动题目
```

### 3.2 晋级之路（CEFR 分级）
- **线性路径**：类似多邻国的一条主线，节点依次解锁
- **分支关卡**：偶尔提供专题支线（语法专项、词汇专项）
- **关卡解锁条件**：前置关卡完成 + 足够 XP/等级

### 3.3 CEFR 等级映射
| 等级 | 阶段 | 关卡数（估算） |
|------|------|--------------|
| A1 | 入门 | ~50 关卡 |
| A2 | 基础 | ~60 关卡 |
| B1 | 中级 | ~80 关卡 |
| B2 | 中高级 | ~100 关卡 |
| C1 | 高级 | ~120 关卡 |

---

## 4. 练习题型

| # | 题型 | 交互方式 | 考核能力 |
|---|------|----------|----------|
| 1 | **图片选词** | 看图片，从 4 个选项中选择对应外语词 | 词汇识别 |
| 2 | **单词配对** | 拖拽匹配外语词 ↔ 母语翻译/图片 | 词汇记忆 |
| 3 | **拼写题** | 听发音或看提示，输入完整单词 | 拼写能力 |
| 4 | **句子排序** | 打乱单词/词组，拖拽排成正确句子 | 语法语序 |
| 5 | **翻译（外→中）** | 看外语句子，输入中文翻译 | 阅读理解 |
| 6 | **翻译（中→外）** | 看中文句子，输入外语翻译 | 输出能力 |
| 7 | **听力选择** | 听录音，选出对应的文字/图片 | 听力理解 |
| 8 | **填空变位** | 根据上下文提示，填写正确的词形变化 | 语法应用 |
| 9 | **AI 口语对话** | 与 AI 进行场景模拟对话（语音 + 文字） | 口语表达 |
| 10 | **AI 纠错** | 用户写句子，AI 给出修改建议 | 写作能力 |

---

## 5. 游戏化系统

### 5.1 经验值 (XP)
- 每个练习根据正确率和难度获得 XP
- 每日第一课双倍 XP
- XP 用于升级和排行榜排名

### 5.2 等级与头衔
- 用户等级 = 累计 XP 决定
- 头衔示例：初学者 → 学徒 → 探索者 → 学者 → 大师

### 5.3 连续签到 (Streak)
- 每日完成至少 1 课即保持连胜
- 连胜保护道具（可用宝石购买）
- 连胜天数作为用户荣誉展示

### 5.4 虚拟货币 (宝石)
- 完成练习获得宝石
- 可用于：购买连胜保护、购买额外生命、解锁装饰道具

### 5.5 生命值
- 默认 5 颗心
- 答错扣除 1 颗（可设置上限）
- 每 X 分钟恢复 1 颗
- 可用宝石购买额外生命

### 5.6 成就/徽章系统
| 类别 | 示例成就 |
|------|----------|
| 学习里程碑 | 完成 10/50/100/500 课 |
| 连胜成就 | 7天/30天/365天连胜 |
| 速度成就 | 30秒内完成一关 |
| 完美成就 | 连续 10 课全对 |
| 词汇成就 | 掌握 100/500/1000 个单词 |
| 社交成就 | 帮助 10 个好友学习 |

### 5.7 段位/联赛
| 段位 | 晋级条件 |
|------|----------|
| 青铜 | 默认 |
| 白银 | 周榜前 15 名 |
| 黄金 | 周榜前 10 名 |
| 钻石 | 周榜前 5 名 |
| 传奇 | 钻石组前 3 名 |

每周重置，根据周 XP 排名决定晋级/降级/保级。

### 5.8 每日挑战
- 每日目标：达到目标 XP 数
- 提供 3 个难度级别的每日任务（如：完成 3 课、获得 50 XP、无错误完成一关）
- 完成奖励：额外宝石 + 经验加成

---

## 6. 导航与 UI 结构

### 6.1 底部 Tab 导航

| Tab | 图标 | 核心内容 |
|-----|------|----------|
| **学习** 🏠 | Home | 晋级之路地图（CEFR A1→C1）、AI口语入口、今日推荐 |
| **排行榜** 🏆 | Trophy | 好友排行、全球排行、段位信息 |
| **社交** 👥 | Users | 好友列表、互助学习、PK挑战 |
| **单词本** 📖 | Book | 已学词汇复习、生词本、闪卡模式 |
| **个人** 👤 | Person | 档案、成就徽章、统计、设置 |

### 6.2 页面结构

```
AppShell
├── BottomNav
├── RouterView
│   ├── 学习页 (Home)
│   │   ├── 晋级之路视图（CEFR 分级，主要）
│   │   ├── AI 口语入口 (浮动按钮)
│   │   └── 今日推荐/连胜提示
│   ├── 排行榜页
│   │   ├── 好友榜 Tab
│   │   ├── 全球榜 Tab
│   │   └── 段位信息卡片
│   ├── 社交页
│   │   ├── 好友列表
│   │   ├── 互助学习
│   │   └── PK 挑战
│   ├── 单词本页
│   │   ├── 按课程/单元分组
│   │   ├── 搜索/筛选
│   │   └── 闪卡复习模式
│   └── 个人页
│       ├── 档案卡片 (等级、连胜、XP)
│       ├── 成就墙
│       ├── 学习统计
│       └── 设置入口
│
├── 练习页面 (独立全屏)
│   ├── 练习容器 (ExercisePlayer)
│   │   ├── 进度条
│   │   ├── 题型组件 (动态切换)
│   │   ├── 反馈区 (正确/错误动画)
│   │   └── 提示/跳过按钮
│   └── 结算页 (LessonComplete)
│       ├── XP 获得动画
│       ├── 连胜更新
│       └── 继续按钮
│
└── AI 对话页 (独立全屏)
    ├── 对话气泡
    ├── 语音/文字输入
    └── AI 实时反馈
```

---

## 7. 用户系统

### 7.1 用户模型
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| username | String | 显示名称 |
| email | String | 邮箱（可选，用于跨设备同步） |
| avatar | String | 头像 URL |
| native_language | String | 母语 (zh/en/es...) |
| xp | Integer | 总经验值 |
| level | Integer | 等级 |
| streak | Integer | 连续学习天数 |
| gems | Integer | 宝石数量 |
| hearts | Integer | 当前生命值 |
| league | String | 当前段位 |
| created_at | DateTime | 注册时间 |
| last_active_date | Date | 最后活动日期 |

### 7.2 匿名模式
- 首次启动无需注册，直接开始学习
- 数据保存在本地
- 可随时绑定邮箱以同步数据

---

## 8. 模块架构规划

### 8.1 前端模块 (Vue 3)

| 模块 | 状态 | 说明 |
|------|------|------|
| `shell` | ✅ 已有 | App 外壳，导航布局 |
| `hello` | ✅ 已有 | 演示模块，后续替换 |
| `lessons` | 🔲 待开发 | 课程系统核心 |
| `vocabulary` | 🔲 待开发 | 单词本 |
| `quiz` | 🔲 待开发 | 测验/考试 |
| `progress` | 🔲 待开发 | 进度追踪 |
| `settings` | 🔲 待开发 | 设置页面 |
| `social` | 🔲 待开发 | 好友/社交 |
| `leaderboard` | 🔲 待开发 | 排行榜 |
| `ai_speaking` | 🔲 待开发 | AI 口语对话 |
| `achievements` | 🔲 待开发 | 成就徽章系统 |

### 8.2 后端模块 (Rust)

| 模块 | 状态 | 说明 |
|------|------|------|
| `database` | 🔧 已有骨架 | SQLite 数据库 |
| `greeting` | ✅ 已有 | 演示模块 |
| `user` | 🔲 待开发 | 用户管理 |
| `course` | 🔲 待开发 | 课程内容管理 |
| `lesson` | 🔲 待开发 | 关卡/练习引擎 |
| `vocabulary` | 🔲 待开发 | 单词管理 |
| `tts` | 🔲 待开发 | 语音合成 |
| `ai` | 🔲 待开发 | AI 集成层 |

### 8.3 共享层

| 模块 | 说明 |
|------|------|
| `api.js` | Tauri IPC 通信 |
| `kernel.js` | 模块加载内核 |
| `eventBus.js` | 事件总线 |
| `useAudio.js` | 音频播放 composable |
| `useTTS.js` | 语音合成 composable |
| `useStreak.js` | 连胜逻辑 composable |
| `useXP.js` | 经验值逻辑 composable |
| `stores/user.js` | 用户状态 |
| `stores/lesson.js` | 课程状态 |
| `stores/progress.js` | 进度状态 |

---

## 9. 数据模型 (SQLite)

### 9.1 核心表设计

```sql
-- 语言定义
CREATE TABLE languages (
  id TEXT PRIMARY KEY,           -- 'en', 'zh', 'es'
  name TEXT NOT NULL,            -- 'Español', '中文', 'English'
  native_name TEXT NOT NULL,     -- 母语名称
  direction TEXT DEFAULT 'ltr',  -- 'ltr' | 'rtl'
  enabled INTEGER DEFAULT 1
);

-- 课程定义
CREATE TABLE courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  language_code TEXT NOT NULL REFERENCES languages(id),
  display_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  cefr_level TEXT,               -- 'A1', 'A2', 'B1', etc.
  enabled INTEGER DEFAULT 1
);

-- 单元定义
CREATE TABLE units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  display_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  theme_type TEXT,               -- 'grammar', 'vocabulary', 'scene'
  theme_data TEXT                -- JSON
);

-- 关卡定义
CREATE TABLE skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES units(id),
  display_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  icon TEXT,
  xp_reward INTEGER DEFAULT 10,
  prerequisites TEXT             -- JSON array of skill IDs
);

-- 练习定义
CREATE TABLE exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER NOT NULL REFERENCES skills(id),
  display_order INTEGER NOT NULL,
  exercise_type TEXT NOT NULL,   -- 'image_select', 'translate', 'sentence_sort', etc.
  prompt TEXT NOT NULL,          -- 题目内容 (JSON)
  answer TEXT NOT NULL,          -- 正确答案 (JSON)
  options TEXT,                  -- 选项 (JSON, 用于选择题类)
  audio_hint TEXT,               -- 音频文件路径
  image_hint TEXT,               -- 图片文件路径
  difficulty INTEGER DEFAULT 1,  -- 1-5
  explanation TEXT               -- 解析/讲解
);

-- 用户表
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT,
  avatar TEXT,
  native_language TEXT REFERENCES languages(id),
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  streak INTEGER DEFAULT 0,
  gems INTEGER DEFAULT 0,
  hearts INTEGER DEFAULT 5,
  league TEXT DEFAULT 'bronze',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_active_date TEXT
);

-- 用户进度表
CREATE TABLE user_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  skill_id INTEGER NOT NULL REFERENCES skills(id),
  status TEXT DEFAULT 'locked',  -- 'locked', 'available', 'in_progress', 'completed', 'mastered'
  best_score INTEGER,
  attempts INTEGER DEFAULT 0,
  completed_at DATETIME,
  UNIQUE(user_id, skill_id)
);

-- 用户练习记录
CREATE TABLE exercise_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  correct INTEGER DEFAULT 0,
  time_spent INTEGER,            -- 耗时（秒）
  attempts INTEGER DEFAULT 1,
  completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 连胜记录
CREATE TABLE streak_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,            -- 'YYYY-MM-DD'
  xp_earned INTEGER DEFAULT 0,
  lessons_completed INTEGER DEFAULT 0,
  UNIQUE(user_id, date)
);

-- 成就定义
CREATE TABLE achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,     -- 'first_lesson', 'streak_7', etc.
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  criteria TEXT                  -- JSON: 达成条件
);

-- 用户成就
CREATE TABLE user_achievements (
  user_id TEXT NOT NULL REFERENCES users(id),
  achievement_id INTEGER NOT NULL REFERENCES achievements(id),
  unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, achievement_id)
);

-- 词汇表
CREATE TABLE vocabulary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  language_code TEXT NOT NULL REFERENCES languages(id),
  word TEXT NOT NULL,
  translation TEXT NOT NULL,
  part_of_speech TEXT,
  difficulty INTEGER DEFAULT 1,
  audio_path TEXT,
  image_path TEXT,
  example_sentence TEXT,
  UNIQUE(language_code, word)
);

-- 用户词汇进度
CREATE TABLE user_vocabulary (
  user_id TEXT NOT NULL REFERENCES users(id),
  vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id),
  familiarity INTEGER DEFAULT 0,  -- 0-100
  last_reviewed DATETIME,
  next_review DATETIME,
  PRIMARY KEY (user_id, vocabulary_id)
);

-- 好友关系
CREATE TABLE friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  friend_id TEXT NOT NULL REFERENCES users(id),
  status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'blocked'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, friend_id)
);

-- 双语聊天消息
CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id TEXT NOT NULL REFERENCES users(id),
  receiver_id TEXT NOT NULL REFERENCES users(id),
  original_text TEXT NOT NULL,      -- 发送者输入的原文
  original_lang TEXT NOT NULL,      -- 原文语言代码
  translated_text TEXT NOT NULL,    -- AI 翻译后的译文
  translated_lang TEXT NOT NULL,    -- 目标语言代码
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  read INTEGER DEFAULT 0
);

-- 排行榜周记录
CREATE TABLE weekly_leaderboard (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  week_start TEXT NOT NULL,       -- 'YYYY-MM-DD'
  xp_earned INTEGER DEFAULT 0,
  league TEXT NOT NULL,
  rank INTEGER,
  UNIQUE(user_id, week_start)
);
```

---

## 10. 练习流程

### 10.1 单次练习流程
```
用户点击关卡节点
  → 加载关卡内练习列表
  → 逐题展示 (ExercisePlayer)
      → 用户作答
      → 即时反馈 (正确✓ / 错误✗ + 显示正确答案)
      → 下一题 / 重试
  → 关卡完成
      → 结算页面 (LessonComplete)
          → XP 获得动画
          → 连胜更新提示
          → 宝石获得
          → 下一个关卡解锁
```

### 10.2 反馈设计
- **正确**: 绿色 + 打勾动画 + 音效 + XP + 分数飞字
- **错误**: 红色 + 叉号动画 + 显示正确答案 + 简短解释
- **完美 (全对)**: 额外奖励 + 特殊动画

---

## 11. AI 功能设计

### 11.1 AI 口语对话
- 用户选择场景主题（餐厅、旅行、面试等）
- AI 扮演对话角色，用户用目标语言回应
- AI 实时纠正语法和用词错误
- 对话结束后提供评分和改进建议

### 11.2 AI 双语聊天翻译
- 好友聊天时，每条消息自动调用大模型翻译为目标语言
- 用户输入母语 → AI 翻译为对方的目标语言发送
- 对方回复的外语 → AI 翻译为用户母语展示
- 点击译文中的单词可添加到单词本
- 每条翻译消息获得 +2 XP 奖励

### 11.3 AI 写作助手
- 用户可自由输入目标语言文本
- AI 进行语法纠错、用词优化
- 提供更地道的表达方式

### 11.4 AI 内容生成
- 根据用户水平自动生成练习内容
- 针对薄弱环节提供额外练习
- 生成个性化例句和上下文

---

## 12. UI/UX 设计原则

### 12.1 视觉风格
- **色彩系统** (已定义 CSS 变量):
  - 主色: `#58cc02` (多邻国式绿色)
  - 辅色: `#1cb0f6` (蓝色), `#ff9600` (橙色)
  - 错误: `#ff4b4b` (红色)
  - 文字: `#4b4b4b` (深灰)
- **圆角卡片**: 大量使用圆角和卡片式布局
- **微动画**: 正确/错误反馈动画、XP 飞字、进度动画
- **拟物化**: 使用阴影和渐变增强层次感

### 12.2 交互原则
- **即时反馈**: 每个操作都有视觉/听觉反馈
- **低门槛**: 首次打开即可开始学习，无需注册
- **渐进解锁**: 内容逐步开放，避免信息过载
- **移动优先**: 设计以手机屏幕为基准 (480×800)

### 12.3 移动适配
- 窗口默认 480×800 (手机比例)
- 触摸友好的按钮大小 (≥44px)
- 底部导航栏方便拇指操作
- 支持滑动操作

---

## 13. 开发路线图

### 第一阶段：核心学习循环
```
1. [数据层] 实现 SQLite 数据库 + 基础 CRUD 命令
2. [课程模块] 晋级之路页面（CEFR 分级线性地图 UI）
3. [练习引擎] ExercisePlayer 组件 + 3种基础题型
4. [结算系统] 关卡完成 → XP/宝石结算
5. [用户系统] 本地用户创建 + 进度持久化
```

### 第二阶段：游戏化
```
6. [连胜] Streak 跟踪 + UI 展示
7. [等级] 升级系统 + 头衔
8. [每日挑战] 每日任务系统
9. [成就] 成就/徽章系统
10. [段位] 联赛系统
```

### 第三阶段：扩展功能
```
11. [单词本] 词汇复习 + 闪卡模式
12. [排行榜] 本地 + 全局排名
13. [社交] 好友系统 + 互助学习
14. [AI 口语] AI 对话练习
15. [更多语言] 添加更多语言对
```

### 第四阶段：完善
```
16. [设置] 用户设置页面
17. [多语言界面] i18n 国际化
18. [云同步] 可选的跨设备同步
19. [性能优化] 图片/音频缓存、启动优化
20. [发布] Windows + Android 商店发布
```

---

## 14. 技术实现要点

### 14.1 前端
- Vue 3 + Composition API + `<script setup>`
- Pinia 状态管理，每个主要模块独立的 store
- Vue Router 动态路由注册（通过 kernel）
- 练习组件通过 `exercise_type` 动态组件切换
- CSS 变量控制主题，无需 CSS 框架

### 14.2 后端 (Rust/Tauri)
- SQLite 通过 `tauri-plugin-sql` 或自定义 Rust 实现
- TTS 通过系统 API 或 `tauri-plugin-audio`
- AI 集成通过 HTTP 调用外部 API（如 OpenAI/Claude）
- 每个 IPC command 对应一个业务操作

### 14.3 数据存储策略
- 所有用户数据存储在本地 SQLite
- 课程内容数据：初期用 JSON 文件加载到数据库，后期可考虑远程更新
- 图片/音频资源：打包在应用内，或按需下载缓存

---

## 15. 附录：术语表

| 术语 | 英文 | 说明 |
|------|------|------|
| 语言 | Language | 一种自然语言 (en/zh/es/...) |
| 课程 | Course | 一种语言的学习课程 |
| 单元 | Unit / Section | 课程的主题分组 |
| 关卡 | Skill / Lesson | 具体技能学习节点 |
| 练习 | Exercise | 最小的互动题目单位 |
| 经验值 | XP | Experience Points |
| 连胜 | Streak | 连续学习天数 |
| 宝石 | Gems | 虚拟货币 |
| 段位 | League | 竞技等级 |
| 成就 | Achievement | 徽章/成就 |
