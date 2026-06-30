/**
 * 自动校验模块
 * 三层防线：格式合规 → 答案校验 → 选项有效性
 */

import { QUESTION_SCHEMAS } from '../data/question-types.js'

export function useValidator() {
  /**
   * 类型检查：typeof [] 返回 'object'，必须用 Array.isArray 检测数组类型
   */
  function checkType(value, expected) {
    if (expected === 'array') return Array.isArray(value)
    return typeof value === expected
  }

  /**
   * 校验单道题目
   * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
   */
  function validateQuestion(question) {
    const errors = []
    const warnings = []

    // 1. 通用字段校验
    const common = QUESTION_SCHEMAS.common
    for (const field of common.required) {
      if (question[field] === undefined || question[field] === null || question[field] === '') {
        errors.push(`缺少必填字段: ${field}`)
      }
    }
    for (const [field, type] of Object.entries(common.types)) {
      if (question[field] !== undefined && !checkType(question[field], type)) {
        errors.push(`字段 ${field} 类型应为 ${type}，实际为 ${typeof question[field]}`)
      }
    }

    // 2. 题型扩展字段校验
    const typeSchema = QUESTION_SCHEMAS[question.type]
    if (typeSchema) {
      for (const field of typeSchema.required) {
        if (question[field] === undefined || question[field] === null) {
          errors.push(`缺少题型必填字段: ${field}`)
        }
      }
      for (const [field, type] of Object.entries(typeSchema.types)) {
        if (question[field] !== undefined && !checkType(question[field], type)) {
          errors.push(`字段 ${field} 类型应为 ${type}，实际为 ${typeof question[field]}`)
        }
      }
    }

    // 3. 答案有效性校验
    if (errors.length === 0) {
      validateAnswer(question, errors, warnings)
    }

    // 4. difficulty 范围
    if (question.difficulty !== undefined) {
      if (question.difficulty < 1 || question.difficulty > 5) {
        warnings.push(`difficulty 应在 1-5 之间，当前为 ${question.difficulty}`)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * 题型特定答案校验
   */
  function validateAnswer(q, errors, warnings) {
    switch (q.type) {
      case 'T01':
      case 'T02':
      case 'T07':
      case 'T08':
      case 'T12': {
        // 选择类：answerIdx 在范围内，选项不重复
        const opts = q.options || q.imageOptions
        if (opts) {
          if (q.answerIdx < 0 || q.answerIdx >= opts.length) {
            errors.push(`answerIdx (${q.answerIdx}) 超出选项范围 [0, ${opts.length - 1}]`)
          }
          const unique = new Set(opts.map(o => typeof o === 'string' ? o.toLowerCase() : JSON.stringify(o)))
          if (unique.size !== opts.length) {
            errors.push('存在重复选项')
          }
          if (opts.length < 3) warnings.push('选项少于 3 个')
        }
        break
      }
      case 'T03': {
        // 配对：4 组，左右不重复
        if (q.pairs) {
          if (q.pairs.length !== 4) warnings.push(`配对应有 4 组，当前 ${q.pairs.length} 组`)
          const lefts = new Set(q.pairs.map(p => p.left?.toLowerCase()))
          const rights = new Set(q.pairs.map(p => p.right?.toLowerCase()))
          if (lefts.size !== q.pairs.length) errors.push('左侧存在重复项')
          if (rights.size !== q.pairs.length) errors.push('右侧存在重复项')
        }
        break
      }
      case 'T05': {
        // 补全句子：blank 应与 options[answerIdx] 一致
        if (q.blank && q.options && q.answerIdx !== undefined) {
          if (q.options[q.answerIdx]?.toLowerCase() !== q.blank.toLowerCase()) {
            errors.push(`blank (${q.blank}) 与 options[answerIdx] (${q.options[q.answerIdx]}) 不一致`)
          }
        }
        if (q.sentence && !q.sentence.includes('___')) {
          warnings.push('sentence 中未找到 ___ 占位符')
        }
        break
      }
      case 'T06': {
        // 句子排序：words 不为空，targetSentence 不为空（sentence 为别名）
        const targetSentence = q.targetSentence || q.sentence
        if (q.words && targetSentence) {
          const wordsJoined = q.words.join(' ').replace(/[¿?¡!.,]/g, '').toLowerCase()
          const target = targetSentence.replace(/[¿?¡!.,]/g, '').toLowerCase()
          // 检查单词是否大致匹配（不严格，因为标点可能不同）
          const targetWords = target.split(/\s+/)
          if (q.words.length < targetWords.length - 1) {
            warnings.push('打乱的单词数量少于目标句单词数')
          }
        }
        break
      }
      case 'T09': {
        // 拼写输入：answer 不为空
        if (!q.answer) errors.push('answer 不能为空')
        break
      }
      case 'T10': {
        // 翻译输入：至少 1 个可接受答案
        if (!q.acceptedAnswers || q.acceptedAnswers.length === 0) {
          errors.push('acceptedAnswers 不能为空')
        } else if (q.acceptedAnswers.length < 2) {
          warnings.push('建议提供至少 2 种可接受答案')
        }
        break
      }
      case 'T11': {
        // 语音跟读：audioText 不为空
        if (!q.audioText) errors.push('audioText 不能为空')
        break
      }
    }
  }

  /**
   * 批量校验
   */
  function validateBatch(questions) {
    const results = questions.map(q => ({
      question: q,
      ...validateQuestion(q)
    }))
    return {
      total: results.length,
      valid: results.filter(r => r.valid).length,
      invalid: results.filter(r => !r.valid).length,
      results
    }
  }

  return { validateQuestion, validateBatch }
}

export default useValidator
