# Amiga Web Demo 部署文档

## 服务器信息

| 项目 | 值 |
|------|-----|
| IP | 49.235.121.91 |
| 用户 | ubuntu |
| SSH 证书 | `c:\wh\ssh.pem` |
| OS | Ubuntu 22.04.4 LTS |
| Node.js | 22.23.1 |
| PM2 | 已安装（用户级） |

## 部署路径

```
/srv/amiga-web/
├── dist/               # Vue 构建产物
│   ├── index.html
│   ├── assets/
│   ├── amiga-icon.png
│   ├── avatars/
│   ├── content-images/
│   └── soulmate/
├── node_modules/
├── server.js           # Express 生产服务器
├── classroom-token.js  # 固定 Google 上游的课堂短期令牌签发
├── package.json
└── package-lock.json
```

## 架构

```
浏览器 ──http──▶ 49.235.121.91:1420
                    │
                    ├── Express 静态托管 (dist/)
                    ├── /llm/<provider>  →  LLM API（代理转发，防 CORS）
                    └── /news/<feed>.xml →  RSS 源（代理转发）
```

浏览器所有请求发到同源地址，由 Node.js 服务器完成 LLM 和新闻的代理转发，避免 CORS 和混合内容问题。

## 启动方式

AI 老师课堂在服务端使用 `GEMINI_API_KEY` 签发一次性短期令牌，长期密钥不返回浏览器。更新服务端时同时上传 `deploy/web/server.js` 和 `deploy/web/classroom-token.js`。设置／修改环境变量或服务端文件后需要重启进程（PM2 使用 `--update-env`）。本地 `dev:web` 从进程环境读取同名变量，设置后需重启 Vite。缺少服务端密钥时，可在应用中配置自己的 Google Gemini Live 密钥；公共 HTTP 页面无法采集麦克风时仍可文字互动，语音采集需要 HTTPS 或 localhost。

本地需要固定验证手机布局时，可临时设置 `VITE_AMIGA_WEB_PHONE=1` 后运行
`npm run dev:web -- --host 127.0.0.1`。该开关仅用于可重复的浏览器测试；正式
Web 构建不设置时仍根据浏览器的移动设备信号自动选择手机或 TV 布局。

普通启动：
```bash
cd /srv/amiga-web
PORT=1420 node server.js
```

PM2 守护（当前）：
```bash
cd /srv/amiga-web
PORT=1420 pm2 start server.js --name amiga-web
pm2 save
```

PM2 已配置开机自启（用户级 systemd）。

## 部署更新

```bash
# 1. 本地构建
npm run build:web

# 2. 上传到服务器
scp -i c:\wh\ssh.pem -r dist ubuntu@49.235.121.91:/srv/amiga-web/

# 3. 检查上传是否出现空文件或遗漏关键公共资源
ssh -i c:\wh\ssh.pem ubuntu@49.235.121.91 "find /srv/amiga-web/dist -type f -size 0 -print && stat -c '%n %s' /srv/amiga-web/dist/soulmate/*.jpg"
```

仅更新 `dist/` 静态文件时不需要重启 PM2。修改 `server.js`、依赖或进程环境后才执行：

```bash
ssh -i c:\wh\ssh.pem ubuntu@49.235.121.91 "pm2 restart amiga-web"
```

本实例是可随时重建的 Demo，允许直接覆盖部署；服务器不保存重要用户数据。上传后仍必须检查 0 字节文件，并实际打开关键页面，避免上传中断导致图片或分包缺失。

## 代理端点

### LLM 提供商（13 个）

| 别名 | 上游地址 |
|------|---------|
| `openai` | `https://api.openai.com` |
| `nvidia` | `https://integrate.api.nvidia.com` |
| `deepseek` | `https://api.deepseek.com` |
| `groq` | `https://api.groq.com` |
| `openrouter` | `https://openrouter.ai` |
| `mistral` | `https://api.mistral.ai` |
| `xai` | `https://api.x.ai` |
| `together` | `https://api.together.xyz` |
| `fireworks` | `https://api.fireworks.ai` |
| `perplexity` | `https://api.perplexity.ai` |
| `siliconflow` | `https://api.siliconflow.cn` |
| `dashscope` | `https://dashscope.aliyuncs.com` |
| `gemini` | `https://generativelanguage.googleapis.com` |

### 新闻 RSS 源

| 路径 | 上游 |
|------|------|
| `/news/rtve/rss.xml` | `https://www.rtve.es/rss/tag_noticias.xml` |
| `/news/elmundo/rss.xml` | `https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml` |
| `/news/abc/rss.xml` | `https://www.abc.es/rss/2.xml` |
| `/news/npr/rss.xml` | `https://feeds.npr.org/1001/rss.xml` |
| `/news/nyt/rss.xml` | `https://rss.nytimes.com/services/xml/rss/nyt/World.xml` |
| `/news/chinadaily/rss.xml` | `https://www.chinadaily.com.cn/rss/world_rss.xml` |
| `/news/cgtn/rss.xml` | `https://www.cgtn.com/subscribe.rss` |
| `/news/google-search/rss?q=&hl=&gl=&ceid=` | `https://news.google.com/rss/search`（关键词全球搜索，仅转发 q/hl/gl/ceid 四个查询值，host 与 path 写死，不做开放代理） |

## 数据存储

所有用户数据存储在浏览器 IndexedDB（`amiga-web` 数据库），服务器不存储任何用户数据。

## 限制与 Demo 取舍

- **Demo 定位与运维取舍**：实例为可随时重新构建和覆盖部署的临时演示，不承载重要服务端数据，所有用户状态均在各浏览器 IndexedDB。当前公网 HTTP、简单 `scp` 覆盖、Express 单进程、无生产级鉴权、无原子发布、无持久缓存和无并发限制，均为用户接受的 Demo 取舍。除非用户要求加固或准备正式上线，不要反复把这些项目当成阻塞问题，也不要擅自引入复杂基础设施。
- **无 HTTPS**：LLM API key 在传输中为明文。如需 SSL，建议前置 nginx 做 termination（备选参考 `deploy/web/nginx.conf.example`，当前生产仅使用 Express 单进程）。
- **无语音输入**：Speaking 模块依赖 Tauri 原生能力，Web 版不可用。
- **无云同步**：不连接 Cloudflare，Cloudflare 同步相关功能在 Web 版中隐藏或禁用。
- **无多用户与服务端状态**：IndexedDB 为单浏览器实例，清缓存即重置；服务器是极轻量无状态静态托管和 API relay，不使用数据库、不缓存响应、不校验应用身份、无会话管理。
- **演示 LLM key**：`VITE_AMIGA_LLM_API_KEY` 内置在构建产物中，仅使用可回收、有额度限制的演示 key；不要把它误改成复杂的用户鉴权系统，除非用户重新要求。

## 服务器其他服务

| 端口 | 服务 |
|------|------|
| 22 | SSH |
| 80 | x-ui（Xray 代理面板，与 Amiga 无关） |
| 1420 | Amiga Web Demo |
| 443/8080/8090/20086/10086 | 其他已有服务 |

## 文件参考

| 本地文件 | 用途 |
|---------|------|
| `deploy/web/server.js` | Express 生产服务器源码 |
| `deploy/web/package.json` | 服务器依赖 |
| `deploy/web/README.md` | 本地说明与备忘 |
| `deploy/web/nginx.conf.example` | Nginx 反代备选参考配置（未启用） |
| `.env.web` | Web 模式环境变量（LLM key） |
| `vite.config.js` | 构建配置（proxy 表与 `server.js` 同步） |
