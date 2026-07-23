# 阿米加 - Amiga

跨平台外语学习应用：Tauri 2.x (Rust) + Vue 3。**正式客户端构建目标仅 Windows 与 Android**（无 iOS 构建）。默认窗口 480×800 移动端布局（Windows 可 resize）。仓库另含一个面向演示和有限访问量的特殊 Web TV 版本，见下节。

## 特别版本：Web TV Demo

Web TV Demo 是复用主应用 Vue 界面和 TV 布局的浏览器版本，目标是尽量与 TV 功能看齐。它是独立的演示分发形态，不是新的 Tauri 构建目标，也不取代 Windows/Android 客户端。

### 运行方式

- Web 模式由 `.env.web` 中的 `VITE_AMIGA_WEB=1` 和 `VITE_AMIGA_TV=1` 启用。
- 本地开发：`npm run dev:web -- --host 127.0.0.1`，默认地址 `http://127.0.0.1:1420/`。
- 生产构建：`npm run build:web`，产物在 `dist/`。
- 本地 Vite 需要外网权限才能转发真实 LLM 请求；只启动页面但没有网络权限时，LLM 代理会失败。

### 架构与数据边界

- 页面继续调用现有 Tauri command 风格 API；`src/shared/api.js` 在 Web 模式下改由 `src/shared/web/webBackend.js` 实现，避免为 Web 复制整套页面业务逻辑。
- WebBackend 是浏览器内的 JavaScript 兼容层，不是远程业务后台。用户、设置、课程进度、词汇、阅读、新闻和灵伴状态保存在 IndexedDB；无登录、无多用户数据库、无云同步。
- 课程框架、题库和词汇库复用仓库现有内容数据。新增或修改 command 时，应优先保持 Tauri 与 WebBackend 的参数和返回值契约一致。
- 浏览器因 CORS 无法直接调用的 LLM 与新闻源，经同源固定路径转发：本地由 Vite dev proxy，当前云端 Demo 由 `deploy/web/server.js` 的 Express 服务完成。
- 云服务器是极轻量、无状态的静态站点和 API relay：不使用数据库、不缓存响应、不校验应用身份、不连接 Cloudflare。Cloudflare 同步相关功能在 Web 版中隐藏或禁用。
- 当前实例部署在 `49.235.121.91:1420`，目录为 `/srv/amiga-web`，由 PM2 运行 Express；操作步骤、SSH 信息和已知限制见 [docs/webdemo-deployment.md](./docs/webdemo-deployment.md)。`deploy/web/nginx.conf.example` 只是未启用的备选方案，不代表当前生产形态。
- 演示 LLM key 放在浏览器构建产物中是当前明确设计，只允许使用可随时回收且已设置供应商额度限制的 key；不要把它误改成复杂的用户鉴权系统，除非用户重新要求。

### 当前 Demo 的明确取舍

- 这是可随时重新构建和覆盖部署的临时 Demo，不承载重要服务端数据。所有用户状态都在各浏览器的 IndexedDB；服务器目录丢失时直接重新部署即可。
- 当前公网 HTTP、简单 `scp` 覆盖、Express 单进程、无生产级鉴权、无原子发布、无持久缓存和无并发限制，均为用户接受的 Demo 取舍。除非用户要求加固或准备正式上线，不要反复把这些项目当成阻塞问题，也不要擅自引入复杂基础设施。
- Demo 仍需保证实际功能可用：静态资源不能缺失或为 0 字节，LLM 固定转发、新闻转发、SPA 路由和主要 TV 页面必须实测。
- 静态资源修复或覆盖 `dist/` 不需要重启 PM2；只有 `server.js`、依赖或进程环境变化时才需要 `pm2 restart amiga-web`。

### 代理安全规则

- 禁止提供接收任意上游 URL、Host 或协议的通用代理接口。
- LLM 只能使用固定供应商别名和 HTTPS 主机白名单，以避免 SSRF 和开放代理风险。
- 新增 LLM 提供商必须同步更新三处：`src/shared/web/webLlm.js` 的浏览器主机映射、`vite.config.js` 的本地开发代理、`deploy/web/server.js` 的云端 Express 固定别名；只有启用 Nginx 备选方案时才同步 `deploy/web/nginx.conf.example`。
- 不要在 WebBackend 或 Express relay 中加入数据库、持久缓存、会话等服务端状态。当前 Demo 不要求生产级并发控制；若用户以后要求限流，再在 Express 或前置代理中实现。
- LLM 连接测试必须执行受超时保护的真实小型生成，并确保最终可见输出长度大于 0；不能只用 `/models` 请求冒充带 token 指标的推理测试。

### Web 版验证

- WebBackend/代理改动至少运行 `npm run test -- src/shared/web/__tests__` 和 `npm run build:web`。
- 涉及页面行为时，在 `npm run dev:web` 下用浏览器实际验证 TV 布局和相关功能；涉及 LLM 时至少完成一次真实代理调用，不能只依赖 mock。
- 当前云端部署说明见 [docs/webdemo-deployment.md](./docs/webdemo-deployment.md)；[deploy/web/README.md](./deploy/web/README.md) 与 [deploy/web/nginx.conf.example](./deploy/web/nginx.conf.example) 保留为本地说明和 Nginx 备选参考。

## Agent 行为

### 模式

- **快捷模式**（用户明确说「快捷模式」或等价指令）：只改代码，跳过确认、截图、编译验证；汇报极简。
- **非快捷模式**（默认）：先中文确认需求与方案再实现；不清楚就问。

### 汇报

- 给结论、改了什么、如何验证；不粘贴长日志、完整 diff 或大段源码，除非用户要求。
- **若修改需要重启后台/服务才能生效，必须在汇报中明确告知用户。**
- 方案确认不算废话；避免无关客套与重复解释。

### Git

- **仅用户明确要求时**才本地 commit；格式见 [docs/conventions.md](./docs/conventions.md)。
- 不要 push，除非用户明确要求。
- 本地 `gh` 认证失效时，**不要要求用户重复登录**；优先使用 Codex 系统 GitHub 连接器读取仓库、Actions job/step/log，并使用现有 Git remote 凭据完成已授权的 push。仅在系统连接器、公开 API 与现有 Git 凭据都无法完成任务时再报告认证阻塞。

## 非快捷模式检查清单

| 改动类型 | 必须做 |
|----------|--------|
| UI（`.vue` / `.css` / 布局 / 交互呈现） | 截图验证（见下）；测完删除截图文件 |
| Rust / Tauri（`src-tauri/` 下 `.rs`、`Cargo.toml`、`tauri*.conf.json`、`capabilities/`） | `cd src-tauri && cargo build`；命令行为须在 Tauri 环境验证 |
| 任意代码 | 跑最接近的测试；跨模块/迁移/权限改动扩大到 `npm run test:all`、`cargo fmt`、`cargo clippy` |
| Android 原生 | 只改 `src-tauri/android/...`；Kotlin 改动后重启 dev 循环 |

**截图**（详见 [docs/testing.md](./docs/testing.md)）：首选 `pwsh scripts/screenshot.ps1 -OutFile screenshots/<name>.png`；Android 用 adb screencap；测完删图。

**浏览器 dev**：裸 `npm run dev` 无 Tauri shell，也不会启用 WebBackend，invoke 会 reject；特殊 Web TV 版必须使用 `npm run dev:web`。验证原生 IPC 仍使用 `run-windows.bat` / `run-android-x86.bat` / `run-android-arm.bat`。

**Android 安装**：`adb install -r -g` 覆盖安装，勿先卸载。JS-Kotlin 桥见 [docs/android-native.md](./docs/android-native.md)。

## 读什么文档

- 每轮：**本文件** + [Codex.md](./Codex.md)。
- **Amiga 主应用开发**（`src/`、`src-tauri/`）：[docs/app-development.md](./docs/app-development.md)。
- **其他主题**（Content Studio、Social 后端、发版/CI、产品背景）：[docs/README.md](./docs/README.md) 按任务选读，不要默认全读。

## 自动化任务

用户要求「提取 GitHub issue 解决」时：拉取最早 open issue → 完成开发 → 关闭 issue。
