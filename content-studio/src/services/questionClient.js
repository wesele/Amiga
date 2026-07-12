export class QuestionConflictError extends Error {
  constructor(message, revision) {
    super(message)
    this.name = 'QuestionConflictError'
    this.revision = revision
  }
}

async function parseResponse(response) {
  const body = await response.json().catch(() => ({}))
  if (response.status === 409) throw new QuestionConflictError(body.error || '题库版本冲突', body.revision)
  if (!response.ok) throw new Error(body.error || `题库请求失败 (${response.status})`)
  return body
}

export async function loadQuestionIndex() {
  return parseResponse(await fetch('/api/questions'))
}

export async function loadQuestionShard(pairId, cefr) {
  return parseResponse(await fetch(`/api/questions/${encodeURIComponent(pairId)}/${encodeURIComponent(cefr)}`))
}

export async function saveQuestionShard(pairId, cefr, questions, revision) {
  return parseResponse(await fetch(`/api/questions/${encodeURIComponent(pairId)}/${encodeURIComponent(cefr)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': revision },
    body: JSON.stringify(questions)
  }))
}

export async function replaceSectionQuestions(pairId, cefr, unitId, sectionId, questions, revision) {
  const url = `/api/questions/${encodeURIComponent(pairId)}/${encodeURIComponent(cefr)}/sections/${encodeURIComponent(unitId)}/${encodeURIComponent(sectionId)}`
  return parseResponse(await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': revision },
    body: JSON.stringify({ questions })
  }))
}
