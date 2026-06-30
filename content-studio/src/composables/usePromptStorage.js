/**
 * AI 提示词存储模块
 * 数据持久化到服务端 data/prompts.json
 * 结构: { [promptId]: { title: '...', content: '...', category: '...' } }
 */
import { ref } from 'vue'
import { IMAGE_PROMPTS_EXPORT } from '../prompts/image-prompts.js'

const DEFAULT_PROMPTS = {
  'unit-framework': {
    title: '单元框架生成',
    category: '课程设计',
    content: `You are an expert language curriculum designer. 
Design a comprehensive unit framework for learning \${lang} at the CEFR \${level} level.

Requirements:
1. Learning Experience: Ensure a logical progression from simple to complex, maximizing learning pleasure and motivation.
2. Vocabulary Coverage: All provided vocabulary must be distributed across the units.
3. Topic Coverage: Cover essential life topics and social situations required for \${level}.
4. Knowledge Coverage: Include necessary grammar and pragmatic points for \${level}.

Input Vocabulary: \${vocabulary}

Output Format: A JSON array of units. Each unit must have:
- id: 'U01', 'U02', etc.
- title: A descriptive title for the unit (e.g., "Meeting New People").
- goal: Learning objective for the unit.
- sections: An array of 3-5 sections. Each section has:
    - id: 'S01', 'S02', etc.
    - title: Specific topic or focus (e.g., "Basic Greetings").
    - vocab: List of vocabulary words from the input to cover in this section.
    - grammar: Key grammar point for this section.

Output ONLY the JSON array, no markdown, no explanation.`
  },
  ...IMAGE_PROMPTS_EXPORT,
  'question-gen': {
    title: '题目生成基础模板',
    category: '题目生产',
    content: `你是一位专业的\${langName}教材编写者，擅长为 CEFR \${cefr} 学习者设计练习题。

请生成 \${typeId}（\${typeName}）类型的题目。
交互形式：\${interaction}
训练技能：\${skill}
认知层次：\${cognitive}

特有约束：\${promptHint}

主题为"\${unitTheme}"。
词汇范围：\${vocabList}
语法范围：\${grammarList}
难度：\${difficulty}（1-5）

请生成 \${count} 道题目。每道题目必须是一个合法的 JSON 对象，参考以下格式：
\${exampleFormat}

输出要求：一个 JSON 数组，包含 \${count} 个题目对象。
content 中只允许输出 JSON，不允许包含任何非 JSON 内容。`
  }
}

const prompts = ref({ ...DEFAULT_PROMPTS })

async function saveToServer() {
  try {
    await fetch('/api/data/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prompts.value)
    })
  } catch (e) {
    console.warn('[prompts] 保存到服务端失败:', e.message)
  }
}

export function usePromptStorage() {
  function savePrompt(id, promptData) {
    prompts.value[id] = { ...prompts.value[id], ...promptData }
    saveToServer()
  }

  function getPrompt(id) {
    return prompts.value[id]?.content || ''
  }

  function deletePrompt(id) {
    delete prompts.value[id]
    saveToServer()
  }

  return {
    prompts,
    savePrompt,
    getPrompt,
    deletePrompt
  }
}

// ---- 全局初始化（main.js 调用一次） ----
export async function init() {
  let loaded = false
  try {
    const res = await fetch('/api/data/prompts')
    if (res.ok) {
      const data = await res.json()
      if (data && Object.keys(data).length > 0) {
        prompts.value = { ...DEFAULT_PROMPTS, ...data }
        loaded = true
      }
    }
  } catch { /* 无数据 */ }

  // 图片类提示词始终升级到内置最新版（SVG 模板迭代频繁）
  let imageUpgraded = false
  for (const [id, val] of Object.entries(IMAGE_PROMPTS_EXPORT)) {
    if (prompts.value[id]?.content !== val.content || prompts.value[id]?.title !== val.title) {
      prompts.value[id] = val
      imageUpgraded = true
    }
  }

  if (!loaded || imageUpgraded) {
    await saveToServer()
  }
}

export default usePromptStorage
