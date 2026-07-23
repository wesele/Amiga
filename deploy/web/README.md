# Amiga Web Demo

Web Demo 复用现有 Vue/TV 界面，并在浏览器内用 JavaScript 实现 Tauri command 兼容层。用户数据保存在 IndexedDB。当前云端实例使用 `server.js` 的 Express 静态服务和固定上游 relay，完整操作见 `docs/webdemo-deployment.md`；本目录的 Nginx 配置保留为可选替代方案。

## 本地开发

```powershell
npm run dev:web -- --host 127.0.0.1
```

默认地址为 `http://127.0.0.1:1420/`。Web 模式下 Vite 会为白名单中的 LLM 提供商启用与生产环境相同的固定路径代理，因此本地服务需要具备外网访问权限。新闻仍可在上游不可用时使用内置演示数据。

## 构建

```powershell
npm run build:web
```

产物位于 `dist/`。可选的构建变量：

- `VITE_AMIGA_LLM_API_KEY`：演示环境默认 LLM key。
- `VITE_AMIGA_LLM_MODEL`：演示环境默认模型。

key 会进入浏览器构建产物，只适用于可随时回收、且已设置供应商额度限制的演示 key。

## 当前 Express 部署

服务器文件为 `server.js` 和 `package.json`，通过 PM2 运行；详见 `docs/webdemo-deployment.md`。静态 `dist/` 更新不需要重启进程，但上传后必须检查 0 字节文件并验证关键公共资源。

## 可选 Nginx 部署

1. 将 `dist/` 上传到服务器，例如 `/srv/amiga-web/dist`。
2. 复制 `nginx.conf.example` 到 Nginx 的 `http` 配置范围内。
3. 修改 `server_name`、静态目录，并配置 HTTPS 证书。
4. 执行 `nginx -t`，成功后 reload Nginx。

配置不接收任意上游 URL。浏览器只能访问 `/llm/<provider>/...` 和固定 `/news/...` 路径，Nginx 再映射到写死的 HTTPS 主机，从而避免开放代理与 SSRF。LLM 默认限制全站 24 个、单 IP 4 个并发连接；新闻默认限制全站 10 个、单 IP 4 个并发连接。超过限制返回 429。

新增 LLM 提供商时，必须同时更新前端 `src/shared/web/webLlm.js` 的主机映射、`vite.config.js` 的本地开发代理和 Nginx 的固定 location，不能加入接收用户 URL 的通用代理入口。
