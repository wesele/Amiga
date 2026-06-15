import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONFIG_FILE = resolve(__dirname, 'studio.config.json')
const DATA_DIR = resolve(__dirname, 'data')

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

function readConfig() {
  const defaults = { baseUrl: '', apiKey: '', model: 'gpt-4o-mini', reviewModel: 'gpt-4o' }
  if (existsSync(CONFIG_FILE)) {
    return { ...defaults, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) }
  }
  return defaults
}

/** Vite 插件：配置读写 + LLM 请求代理（支持 SSE 流式 + 绕过 CORS） */
function configApiPlugin() {
  return {
    name: 'studio-config-api',
    configureServer(server) {
      // ---- /api/config：读写 API 配置 ----
      server.middlewares.use('/api/config', (req, res, next) => {
        if (req.method === 'GET') {
          try {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(readConfig()))
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: e.message }))
          }
          return
        }
        if (req.method === 'POST') {
          const chunks = []
          req.on('data', chunk => { chunks.push(chunk) })
          req.on('end', () => {
            try {
              const body = Buffer.concat(chunks).toString('utf-8')
              const config = JSON.parse(body)
              writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))
            } catch (e) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: e.message }))
            }
          })
          return
        }
        next()
      })

      // ---- /api/data/:type 通用数据持久化（JSON 文件存储）----
      server.middlewares.use('/api/data', (req, res, next) => {
        // 从 URL 提取数据类型: /api/data/vocabulary → vocabulary
        const urlPath = req.url.split('?')[0].replace(/^\//, '')
        const type = urlPath.replace(/\.json$/, '')
        if (!type || type.includes('/') || type.includes('..')) return next()

        const filePath = join(DATA_DIR, `${type}.json`)

        if (req.method === 'GET') {
          try {
            if (existsSync(filePath)) {
              const data = readFileSync(filePath, 'utf-8')
              res.setHeader('Content-Type', 'application/json')
              res.end(data)
            } else {
              res.setHeader('Content-Type', 'application/json')
              res.end('{}')
            }
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: e.message }))
          }
          return
        }

        if (req.method === 'POST') {
          const chunks = []
          req.on('data', chunk => { chunks.push(chunk) })
          req.on('end', () => {
            try {
              const body = Buffer.concat(chunks).toString('utf-8')
              writeFileSync(filePath, body, 'utf-8')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))
            } catch (e) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: e.message }))
            }
          })
          return
        }
        next()
      })

      // ---- /api/llm：代理 LLM 请求（支持 SSE 流式 + 非流式） ----
      server.middlewares.use('/api/llm', (req, res, next) => {
        if (req.method !== 'POST') return next()

        const chunks = []
        req.on('data', chunk => { chunks.push(chunk) })
        req.on('end', async () => {
          try {
            const body = Buffer.concat(chunks).toString('utf-8')
            const config = readConfig()
            if (!config.baseUrl || !config.apiKey) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: '未配置 baseUrl 或 apiKey' }))
              return
            }

            const targetUrl = config.baseUrl.replace(/\/$/, '') + '/chat/completions'

            // 检测是否为流式请求
            let isStream = false
            try {
              isStream = JSON.parse(body).stream === true
            } catch { /* ignore */ }

            const upstream = await fetch(targetUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
              },
              body
            })

            if (!upstream.ok && !isStream) {
              // 非流式：直接转发错误响应
              res.statusCode = upstream.status
              res.setHeader('Content-Type', 'application/json')
              const text = await upstream.text()
              res.end(text)
              return
            }

            if (!upstream.ok && isStream) {
              // 流式请求出错：发送 SSE error event 然后关闭
              res.setHeader('Content-Type', 'text/event-stream')
              res.setHeader('Cache-Control', 'no-cache')
              res.setHeader('Connection', 'keep-alive')
              const errText = await upstream.text()
              res.write(`data: ${JSON.stringify({ error: { status: upstream.status, message: errText } })}\n\n`)
              res.write('data: [DONE]\n\n')
              res.end()
              return
            }

            if (isStream) {
              // ---- SSE 流式转发 ----
              res.setHeader('Content-Type', 'text/event-stream')
              res.setHeader('Cache-Control', 'no-cache')
              res.setHeader('Connection', 'keep-alive')

              const reader = upstream.body.getReader()
              const decoder = new TextDecoder()

              try {
                while (true) {
                  const { done, value } = await reader.read()
                  if (done) break
                  const chunk = decoder.decode(value, { stream: true })
                  res.write(chunk)
                }
              } catch (streamErr) {
                // 客户端断开连接等
                console.warn('[Proxy] SSE stream interrupted:', streamErr.message)
              } finally {
                try { res.end() } catch { /* ignore */ }
              }
            } else {
              // ---- 非流式转发 ----
              res.statusCode = upstream.status
              res.setHeader('Content-Type', 'application/json')
              const text = await upstream.text()
              res.end(text)
            }
          } catch (e) {
            console.error('[Proxy] Error:', e.message)
            if (!res.headersSent) {
              res.statusCode = 502
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: `代理请求失败: ${e.message}` }))
            }
          }
        })
      })
    }
  }
}

export default defineConfig({
  plugins: [vue(), configApiPlugin()],
  server: {
    port: 5180,
    open: false
  }
})
