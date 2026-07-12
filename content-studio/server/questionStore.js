import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const locks = new Map()

function revision(data) {
  return `sha256:${createHash('sha256').update(JSON.stringify(data)).digest('hex')}`
}

function safeSegment(value, name) {
  const text = String(value || '')
  if (!/^[\w-]+$/.test(text)) throw new Error(`${name} 格式无效`)
  return text
}

function atomicWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  const body = JSON.stringify(value, null, 2) + '\n'
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`
  const backup = `${path}.bak`
  writeFileSync(temp, body, 'utf8')
  if (existsSync(path)) {
    writeFileSync(backup, readFileSync(path))
    rmSync(path, { force: true })
  }
  renameSync(temp, path)
}

function withLock(key, operation) {
  const previous = locks.get(key) || Promise.resolve()
  const current = previous.catch(() => {}).then(operation)
  locks.set(key, current)
  current.finally(() => {
    if (locks.get(key) === current) locks.delete(key)
  }).catch(() => {})
  return current
}

export function createQuestionStore(dataDir) {
  const root = join(dataDir, 'questions')
  const indexPath = join(root, 'index.json')

  function readIndex() {
    if (!existsSync(indexPath)) return { version: 1, shards: [] }
    const value = JSON.parse(readFileSync(indexPath, 'utf8'))
    if (!value || value.version !== 1 || !Array.isArray(value.shards)) throw new Error('题库 index.json 格式无效')
    return value
  }

  function shardPath(pairId, cefr) {
    return join(root, safeSegment(pairId, 'pairId'), `${safeSegment(cefr, 'cefr')}.json`)
  }

  function readShard(pairId, cefr) {
    const path = shardPath(pairId, cefr)
    if (!existsSync(path)) return []
    const value = JSON.parse(readFileSync(path, 'utf8'))
    if (!Array.isArray(value)) throw new Error(`题库分片 ${pairId}/${cefr} 必须是数组`)
    return value
  }

  function ensureIndexEntry(pairId, cefr) {
    const index = readIndex()
    if (!index.shards.some(s => s.pairId === pairId && s.cefr === cefr)) {
      index.shards.push({ pairId, cefr, file: `${pairId}/${cefr}.json` })
      index.shards.sort((a, b) => `${a.pairId}/${a.cefr}`.localeCompare(`${b.pairId}/${b.cefr}`))
      atomicWrite(indexPath, index)
    }
  }

  function getIndex() {
    const index = readIndex()
    return { data: index, revision: revision(index) }
  }

  function getShard(pairId, cefr) {
    const data = readShard(pairId, cefr)
    return { data, revision: revision(data) }
  }

  function replaceSection({ pairId, cefr, unitId, sectionId, questions, expectedRevision }) {
    const key = `${safeSegment(pairId, 'pairId')}/${safeSegment(cefr, 'cefr')}`
    return withLock(key, async () => {
      const current = readShard(pairId, cefr)
      const currentRevision = revision(current)
      if (expectedRevision !== currentRevision) {
        const error = new Error('题库已被其他窗口或脚本修改')
        error.status = 409
        error.revision = currentRevision
        throw error
      }
      if (!Array.isArray(questions)) {
        const error = new Error('questions 必须是数组')
        error.status = 422
        throw error
      }
      const fullSectionId = `${pairId}/${unitId}-${sectionId}`
      for (const question of questions) {
        if (question.pairId !== pairId || question.cefr !== cefr || question.sectionId !== fullSectionId) {
          const mismatches = []
          if (question.pairId !== pairId) mismatches.push(`pairId 应为 ${pairId}，实际为 ${question.pairId ?? '(空)'}`)
          if (question.cefr !== cefr) mismatches.push(`cefr 应为 ${cefr}，实际为 ${question.cefr ?? '(空)'}`)
          if (question.sectionId !== fullSectionId) mismatches.push(`sectionId 应为 ${fullSectionId}，实际为 ${question.sectionId ?? '(空)'}`)
          const error = new Error(`题目 ${question.id || '(无 id)'} 的归属字段不一致：${mismatches.join('；')}`)
          error.status = 422
          throw error
        }
      }
      const ids = new Set(questions.map(q => q.id))
      if (ids.has(undefined) || ids.size !== questions.length) {
        const error = new Error('新题目 id 缺失或重复')
        error.status = 422
        throw error
      }
      const retained = current.filter(q => q.sectionId !== fullSectionId)
      if (retained.some(q => ids.has(q.id))) {
        const error = new Error('新题目 id 与其他小节重复')
        error.status = 422
        throw error
      }
      const next = [...retained, ...questions]
      atomicWrite(shardPath(pairId, cefr), next)
      ensureIndexEntry(pairId, cefr)
      return { data: next, revision: revision(next), replaced: current.length - retained.length, inserted: questions.length }
    })
  }

  function putShard({ pairId, cefr, questions, expectedRevision }) {
    const key = `${safeSegment(pairId, 'pairId')}/${safeSegment(cefr, 'cefr')}`
    return withLock(key, async () => {
      const current = readShard(pairId, cefr)
      const currentRevision = revision(current)
      if (expectedRevision !== currentRevision) {
        const error = new Error('题库已被其他窗口或脚本修改')
        error.status = 409
        error.revision = currentRevision
        throw error
      }
      if (!Array.isArray(questions) || questions.some(q => q.pairId !== pairId || q.cefr !== cefr)) {
        const error = new Error('题库分片内容与 pairId/cefr 不一致')
        error.status = 422
        throw error
      }
      atomicWrite(shardPath(pairId, cefr), questions)
      ensureIndexEntry(pairId, cefr)
      return { data: questions, revision: revision(questions) }
    })
  }

  return { getIndex, getShard, putShard, replaceSection }
}
