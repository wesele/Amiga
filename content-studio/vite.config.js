import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync, writeFileSync, copyFileSync, renameSync, unlinkSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createQuestionStore } from './server/questionStore.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONFIG_FILE = resolve(__dirname, 'studio.config.json')
const DATA_DIR = resolve(__dirname, 'data')
const IMAGES_DIR = resolve(DATA_DIR, 'images')
const questionStore = createQuestionStore(DATA_DIR)
const DATA_TYPES = new Map([
  ['tasks', 'array'],
  ['production-log', 'array'],
  ['system-config', 'object'],
  ['vocabulary', 'object'],
  ['unit-framework', 'object'],
  ['prompts', 'object'],
  ['question-types', 'array']
])

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
if (!existsSync(IMAGES_DIR)) mkdirSync(IMAGES_DIR, { recursive: true })

function readConfig() {
  const defaults = {
    baseUrl: '', apiKey: '', model: 'gpt-4o-mini', imageModel: 'gpt-4o-mini', reviewModel: 'gpt-4o',
    temperature: 0.3, topP: null, maxTokens: null,
    frequencyPenalty: null, presencePenalty: null,
    minUnits: 5, maxUnits: 8,
    minSectionsPerUnit: 3, maxSectionsPerUnit: 5,
    questionsPerSection: 5, maxQuestionTypesPerSection: 3
  }
  if (existsSync(CONFIG_FILE)) {
    return { ...defaults, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) }
  }
  return defaults
}

function writeAtomic(filePath, body, { backup = true } = {}) {
  const parsed = JSON.parse(body)
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  const backupPath = `${filePath}.bak`
  writeFileSync(tempPath, body, 'utf-8')
  if (backup && existsSync(filePath)) copyFileSync(filePath, backupPath)
  if (existsSync(filePath)) unlinkSync(filePath)
  renameSync(tempPath, filePath)
  return parsed
}

function validateData(type, value) {
  const expected = DATA_TYPES.get(type)
  if (!expected) throw new Error(`不支持的数据类型: ${type}`)
  if (expected === 'array' && !Array.isArray(value)) throw new Error(`${type} 必须是数组`)
  if (expected === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) {
    throw new Error(`${type} 必须是对象`)
  }
  return value
}

/** Vite 插件：配置读写 + LLM 请求代理（支持 SSE 流式 + 绕过 CORS） */
function configApiPlugin() {
  return {
    name: 'studio-config-api',
    configureServer(server) {
      // ---- 分片题库：按 pairId + CEFR 独立版本化 ----
      server.middlewares.use('/api/questions', (req, res, next) => {
        const parts = req.url.split('?')[0].split('/').filter(Boolean).map(decodeURIComponent)
        const send = (status, body) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        try {
          if (req.method === 'GET' && parts.length === 0) return send(200, questionStore.getIndex())
          if (req.method === 'GET' && parts.length === 2) return send(200, questionStore.getShard(parts[0], parts[1]))
          if (req.method === 'PUT' && parts.length === 2) {
            const chunks = []
            req.on('data', chunk => chunks.push(chunk))
            req.on('end', async () => {
              try {
                const questions = JSON.parse(Buffer.concat(chunks).toString('utf8'))
                const result = await questionStore.putShard({
                  pairId: parts[0], cefr: parts[1], questions,
                  expectedRevision: req.headers['if-match']
                })
                send(200, result)
              } catch (error) {
                send(error.status || 500, { error: error.message, revision: error.revision })
              }
            })
            return
          }
          if (req.method === 'PUT' && parts.length === 5 && parts[2] === 'sections') {
            const chunks = []
            req.on('data', chunk => chunks.push(chunk))
            req.on('end', async () => {
              try {
                const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
                const result = await questionStore.replaceSection({
                  pairId: parts[0], cefr: parts[1], unitId: parts[3], sectionId: parts[4],
                  questions: body.questions, expectedRevision: req.headers['if-match']
                })
                send(200, result)
              } catch (error) {
                send(error.status || 500, { error: error.message, revision: error.revision })
              }
            })
            return
          }
          next()
        } catch (error) {
          send(error.status || 500, { error: error.message })
        }
      })

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
              if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('配置必须是对象')
              writeAtomic(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', { backup: false })
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

      // ---- /api/models：获取 OpenAI 兼容 API 的模型列表 ----
      server.middlewares.use('/api/models', (req, res, next) => {
        if (req.method !== 'POST') return next()

        const chunks = []
        req.on('data', chunk => { chunks.push(chunk) })
        req.on('end', async () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
            const config = readConfig()
            const baseUrl = String(body.baseUrl || config.baseUrl || '').replace(/\/$/, '')
            const apiKey = body.apiKey || config.apiKey
            if (!baseUrl || !apiKey) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: '请先填写 API Base URL 和 API Key' }))
              return
            }

            const upstream = await fetch(`${baseUrl}/models`, {
              headers: { Authorization: `Bearer ${apiKey}` }
            })
            const text = await upstream.text()
            res.statusCode = upstream.status
            res.setHeader('Content-Type', 'application/json')
            if (!upstream.ok) {
              res.end(JSON.stringify({ error: `模型列表接口返回 ${upstream.status}`, detail: text.slice(0, 500) }))
              return
            }
            res.end(text)
          } catch (e) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: `获取模型列表失败: ${e.message}` }))
          }
        })
      })

      // ---- /api/data/:type 通用数据持久化（JSON 文件存储）----
      server.middlewares.use('/api/data', (req, res, next) => {
        // 从 URL 提取数据类型: /api/data/vocabulary → vocabulary
        const urlPath = req.url.split('?')[0].replace(/^\//, '')
        const segments = urlPath.split('/').filter(Boolean)

        // 槽位级保存：PUT /api/data/unit-framework/:pairId/:level
        // 读取磁盘最新内容后只合并指定 (语言, 级别) 槽位，避免多标签页并行生成时互相覆盖整份文件
        if (segments[0] === 'unit-framework' && segments.length === 3 && req.method === 'PUT') {
          const [, pairId, level] = segments
          if (!pairId || !level || pairId.includes('..') || level.includes('..')) return next()
          const chunks = []
          req.on('data', chunk => chunks.push(chunk))
          req.on('end', () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
              if (!body || typeof body !== 'object' || !Array.isArray(body.units)) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                return res.end(JSON.stringify({ error: 'unit-framework 槽位保存需要 { units: [...] }' }))
              }
              const filePath = join(DATA_DIR, 'unit-framework.json')
              const current = existsSync(filePath) ? JSON.parse(readFileSync(filePath, 'utf-8')) : {}
              current[pairId] = current[pairId] || {}
              current[pairId][level] = { units: body.units }
              writeAtomic(filePath, JSON.stringify(current) + '\n')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))
            } catch (e) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: e.message }))
            }
          })
          return
        }

        // 槽位级删除：DELETE /api/data/unit-framework/:pairId/:level
        // 读取磁盘最新内容后删除指定 (语言, 级别) 槽位，避免整文件覆盖
        if (segments[0] === 'unit-framework' && segments.length === 3 && req.method === 'DELETE') {
          const [, pairId, level] = segments
          if (!pairId || !level || pairId.includes('..') || level.includes('..')) return next()
          try {
            const filePath = join(DATA_DIR, 'unit-framework.json')
            const current = existsSync(filePath) ? JSON.parse(readFileSync(filePath, 'utf-8')) : {}
            if (current[pairId]) {
              delete current[pairId][level]
              if (Object.keys(current[pairId]).length === 0) delete current[pairId]
            }
            writeAtomic(filePath, JSON.stringify(current) + '\n')
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true }))
          } catch (e) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: e.message }))
          }
          return
        }

        const type = urlPath.replace(/\.json$/, '')
        if (!type || type.includes('/') || type.includes('..')) return next()
        if (!DATA_TYPES.has(type)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: `不支持的数据类型: ${type}` }))
          return
        }

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
              const parsed = validateData(type, JSON.parse(body))
              writeAtomic(filePath, JSON.stringify(parsed))
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

      // ---- /api/images：图片持久化（JPEG/PNG base64 → 文件） ----
      server.middlewares.use('/api/images', (req, res, next) => {
        const urlPath = req.url.split('?')[0]

        if (req.method === 'POST' && urlPath === '/delete') {
          const chunks = []
          req.on('data', chunk => { chunks.push(chunk) })
          req.on('end', () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
              const filenames = Array.isArray(body.filenames) ? body.filenames : []
              for (const filename of filenames) {
                if (!/^[\w.-]+\.(jpe?g|png)$/i.test(filename)) continue
                const filePath = join(IMAGES_DIR, filename)
                if (existsSync(filePath)) unlinkSync(filePath)
              }
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, deleted: filenames.length }))
            } catch (e) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: e.message }))
            }
          })
          return
        }

        // GET /api/images/:filename
        if (req.method === 'GET' && urlPath.length > 1) {
          const filename = urlPath.replace(/^\//, '')
          if (!filename || filename.includes('..') || filename.includes('/')) return next()

          const filePath = join(IMAGES_DIR, filename)
          if (!existsSync(filePath)) {
            res.statusCode = 404
            res.end(JSON.stringify({ error: '图片不存在' }))
            return
          }
          const ext = filename.split('.').pop()?.toLowerCase()
          const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
          res.setHeader('Content-Type', mime)
          res.setHeader('Cache-Control', 'no-cache')
          res.end(readFileSync(filePath))
          return
        }

        // POST /api/images — { filename, dataUrl }
        if (req.method === 'POST' && (urlPath === '' || urlPath === '/')) {
          const chunks = []
          req.on('data', chunk => { chunks.push(chunk) })
          req.on('end', () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
              const filename = body.filename
              const dataUrl = body.dataUrl

              if (!filename || !dataUrl) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: '缺少 filename 或 dataUrl' }))
                return
              }
              if (!/^[\w.-]+\.(jpe?g|png)$/i.test(filename)) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'filename 格式无效' }))
                return
              }

              if (!/^data:image\/(?:jpe?g|png);base64,/i.test(dataUrl)) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'dataUrl 必须是 JPEG 或 PNG 的 base64 数据' }))
                return
              }
              const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
              const image = Buffer.from(base64, 'base64')
              if (!image.length) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: '图片数据为空' }))
                return
              }
              writeFileSync(join(IMAGES_DIR, filename), image)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, url: `/api/images/${filename}` }))
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
