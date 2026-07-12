import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createQuestionStore } from './server/questionStore.js'

let passed = 0
function assert(value, message) {
  if (!value) throw new Error(message)
  passed++
  console.log(`  ✅ ${message}`)
}

const dir = mkdtempSync(join(tmpdir(), 'idioma-question-store-'))
try {
  const store = createQuestionStore(dir)
  const empty = store.getShard('zh-es', 'A1')
  const q1 = { id: 'q1', pairId: 'zh-es', cefr: 'A1', unit: 'U01', sectionId: 'zh-es/U01-S01' }
  const first = await store.replaceSection({
    pairId: 'zh-es', cefr: 'A1', unitId: 'U01', sectionId: 'S01', questions: [q1], expectedRevision: empty.revision
  })
  assert(first.data.length === 1, '空分片可以原子写入一个小节')

  let conflict = false
  try {
    await store.replaceSection({
      pairId: 'zh-es', cefr: 'A1', unitId: 'U01', sectionId: 'S01', questions: [q1], expectedRevision: empty.revision
    })
  } catch (error) {
    conflict = error.status === 409
  }
  assert(conflict, '过期 revision 被拒绝为 409')
  assert(store.getShard('zh-es', 'A1').data[0].id === 'q1', '冲突不会覆盖现有分片')

  let invalid = false
  try {
    await store.replaceSection({
      pairId: 'zh-es', cefr: 'A1', unitId: 'U01', sectionId: 'S01',
      questions: [{ ...q1, sectionId: 'zh-es/U01-S02' }], expectedRevision: first.revision
    })
  } catch (error) {
    invalid = error.status === 422 && error.message.includes('sectionId 应为 zh-es/U01-S01')
  }
  assert(invalid, '字段不一致的新题被拒绝为 422')
  assert(JSON.parse(readFileSync(join(dir, 'questions/zh-es/A1.json'), 'utf8'))[0].id === 'q1', '校验失败时旧题保持不变')
  assert(store.getIndex().data.shards.length === 1, 'manifest 自动登记新分片')
  console.log(`\n=== ${passed} question store tests passed ===`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
