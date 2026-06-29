/**
 * AI 提示词存储模块
 * 数据持久化到服务端 data/prompts.json
 * 结构: { [promptId]: { title: '...', content: '...', category: '...' } }
 */
import { ref } from 'vue'

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
  'image-svg-gen': {
    title: 'SVG 图片生成',
    category: '素材生产',
    content: `Create an SVG illustration for a language-learning exercise.

Description: \${desc}
Visual reference: \${prompt}

Requirements:
- viewBox="0 0 400 400" width="400" height="400"
- xmlns="http://www.w3.org/2000/svg"
- White background rectangle covering the full canvas
- Single clear subject, visually distinct, suitable for A1-A2 learners
- No text, letters, numbers, or watermarks in the image
- Use simple geometric shapes and paths only
- Maximum ~30 SVG elements for clarity

Output ONLY the <svg>...</svg> code.`
  },
  'image-refine': {
    title: '图片提示词优化',
    category: '素材生产',
    content: `You are an expert AI image prompt engineer for a language learning app. 
Refine the following image description into a high-quality, detailed English prompt for Midjourney or Stable Diffusion.
Style: Modern, clean, high-quality flat vector illustration, consistent thick line art, vibrant educational colors, soft lighting, white background, isolated object, 4k resolution.
Content: Describe a specific, clear, and visually distinct scene that represents the concept accurately. Avoid text in the image.
Original: \${value}
Output ONLY the refined English prompt string, no other text.`
  },
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
  try {
    const res = await fetch('/api/data/prompts')
    if (res.ok) {
      const data = await res.json()
      if (data && Object.keys(data).length > 0) {
        prompts.value = data
        return
      }
    }
  } catch { /* 无数据 */ }
  // 服务端无数据时保存默认值
  await saveToServer()
}

export default usePromptStorage
