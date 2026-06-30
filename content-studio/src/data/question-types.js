/**
 * 题型定义与 Prompt 模板
 * 基于 content-production.html 规范
 */

export const QUESTION_TYPES = {
  T01: {
    id: 'T01',
    name: '图片识词',
    interaction: '看图片 → 四选一',
    skill: '阅读 · 词汇',
    cognitive: '识别',
    tier: 1,
    extendedFields: ['imageDesc', 'imagePrompt', 'options', 'answerIdx'],
    promptHint: 'imageDesc 用母语简洁描述画面（必须对应正确答案 options[answerIdx] 的含义，学习者看图应能选出正确选项）；imagePrompt 用英文写 SVG 可画要素（主体+动作+2-3个道具/场景线索，如 "young person waving hand, casual shirt, friendly smile, white background"，禁止写 4k/Midjourney/光影等栅格图术语）；干扰项须为同类词且语义接近；正确答案不能靠排除法得出'
  },
  T02: {
    id: 'T02',
    name: '听音选图',
    interaction: '听发音 → 选对应图',
    skill: '听力 · 词汇',
    cognitive: '识别',
    tier: 1,
    extendedFields: ['audioText', 'imageOptions', 'answerIdx'],
    promptHint: '需标注发音文本（TTS 播放内容）；imageOptions 为 4 项数组，每项含 desc（母语简洁描述）和 prompt（英文 SVG 要素：不同场景/主体/主色，如 indoor kitchen vs outdoor park，确保四图一眼可区分）；正确项 desc 须与 audioText 语义一致；选项间不可有包含关系'
  },
  T03: {
    id: 'T03',
    name: '双向配对',
    interaction: '拖拽配对 4 组',
    skill: '阅读 · 记忆',
    cognitive: '识别',
    tier: 1,
    extendedFields: ['pairs'],
    promptHint: '固定 4 组配对；左右两列各自不重复；配对项须在同一语义域'
  },
  T05: {
    id: 'T05',
    name: '补全句子',
    interaction: '选词填空（3-4 选 1）',
    skill: '阅读 · 语法',
    cognitive: '理解',
    tier: 2,
    extendedFields: ['sentence', 'blank', 'options', 'answerIdx'],
    promptHint: '空位只能是一个词或短语；3~4 个选项含且仅含 1 个正确答案；干扰项须为合理语法变体'
  },
  T06: {
    id: 'T06',
    name: '句子排序',
    interaction: '拖拽单词排成句',
    skill: '语法 · 语序',
    cognitive: '应用',
    tier: 2,
    extendedFields: ['words', 'targetSentence'],
    promptHint: '拆分单词须完整无遗漏；目标句须语法正确且语义自然；打乱顺序不可与原序相同'
  },
  T07: {
    id: 'T07',
    name: '翻译选择',
    interaction: '看源语 → 四选一',
    skill: '阅读 · 翻译',
    cognitive: '理解',
    tier: 2,
    extendedFields: ['sourceText', 'sourceLang', 'options', 'answerIdx'],
    promptHint: '源语句子须自然地道；干扰项与正确答案语义相关但错误；不可使用逐字翻译作为正确答案'
  },
  T08: {
    id: 'T08',
    name: '听力选择',
    interaction: '听句子 → 三选一',
    skill: '听力 · 理解',
    cognitive: '理解',
    tier: 2,
    extendedFields: ['audioText', 'question', 'options', 'answerIdx'],
    promptHint: '需标注完整听力文本；选项为文字描述；答案须仅从听力内容即可得出'
  },
  T09: {
    id: 'T09',
    name: '拼写输入',
    interaction: '听音 + 看释义 → 打字',
    skill: '拼写 · 听力',
    cognitive: '应用',
    tier: 3,
    extendedFields: ['audioText', 'hint', 'answer', 'commonMistakes'],
    promptHint: '需标注发音文本和释义；答案仅接受一种拼写（含重音符号）；须注明常见错误拼写'
  },
  T10: {
    id: 'T10',
    name: '翻译输入',
    interaction: '看源语 → 键盘输入',
    skill: '写作 · 翻译',
    cognitive: '应用',
    tier: 3,
    extendedFields: ['sourceText', 'sourceLang', 'acceptedAnswers', 'hint'],
    promptHint: '须列出 2~3 种可接受答案；答案须语法正确且自然；避免需要文化背景知识的翻译'
  },
  T11: {
    id: 'T11',
    name: '语音跟读',
    interaction: '听 → 录音 → AI 评分',
    skill: '口语 · 发音',
    cognitive: '应用',
    tier: 3,
    extendedFields: ['audioText', 'scoringDimensions', 'difficultyNotes'],
    promptHint: '句子长度 5~15 词；须标注评分维度（发音/流利度/完整度）；句子须为日常对话常用句'
  },
  T12: {
    id: 'T12',
    name: '情景回应',
    interaction: '阅读场景 → 选最佳回应',
    skill: '语用 · 交际',
    cognitive: '应用',
    tier: 3,
    extendedFields: ['scenario', 'options', 'answerIdx', 'pragmaticsNote'],
    promptHint: '场景描述须简洁清晰；3 个选项中 1 正确 2 干扰；干扰项须在语境中看似合理但有语用缺陷'
  }
}

/** 按 CEFR 级别可用的题型 */
export const CEFR_TYPE_MAP = {
  'A1-early': ['T01', 'T02', 'T03'],
  'A1-late': ['T01', 'T02', 'T03', 'T05', 'T06', 'T07', 'T08'],
  'A1': ['T01', 'T02', 'T03', 'T05', 'T06', 'T07', 'T08'],
  'A2': ['T01', 'T02', 'T03', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10', 'T11', 'T12']
}

/** 题型 JSON Schema 定义，用于校验 LLM 输出 */
export const QUESTION_SCHEMAS = {
  common: {
    required: ['id', 'type', 'typeName', 'language', 'cefr', 'unit', 'unitTheme', 'difficulty', 'tags'],
    types: {
      id: 'string', type: 'string', typeName: 'string',
      language: 'string', cefr: 'string', unit: 'string',
      unitTheme: 'string', difficulty: 'number', tags: 'array'
    }
  },
  T01: {
    required: ['imageDesc', 'options', 'answerIdx'],
    types: {
      imageDesc: 'string', imagePrompt: 'string', imageSvg: 'string', imageUrl: 'string',
      options: 'array', answerIdx: 'number'
    }
  },
  T02: {
    required: ['audioText', 'imageOptions', 'answerIdx'],
    types: {
      audioText: 'string', imageOptions: 'array', imageUrl: 'string', answerIdx: 'number'
    }
  },
  T03: {
    required: ['pairs'],
    types: { pairs: 'array' }
  },
  T05: {
    required: ['sentence', 'blank', 'options', 'answerIdx'],
    types: { sentence: 'string', blank: 'string', options: 'array', answerIdx: 'number' }
  },
  T06: {
    required: ['words', 'targetSentence'],
    types: { words: 'array', targetSentence: 'string' }
  },
  T07: {
    required: ['sourceText', 'sourceLang', 'options', 'answerIdx'],
    types: { sourceText: 'string', sourceLang: 'string', options: 'array', answerIdx: 'number' }
  },
  T08: {
    required: ['audioText', 'question', 'options', 'answerIdx'],
    types: { audioText: 'string', question: 'string', options: 'array', answerIdx: 'number' }
  },
  T09: {
    required: ['audioText', 'hint', 'answer'],
    types: { audioText: 'string', hint: 'string', answer: 'string', commonMistakes: 'array' }
  },
  T10: {
    required: ['sourceText', 'sourceLang', 'acceptedAnswers'],
    types: { sourceText: 'string', sourceLang: 'string', acceptedAnswers: 'array', hint: 'string' }
  },
  T11: {
    required: ['audioText', 'scoringDimensions'],
    types: { audioText: 'string', scoringDimensions: 'array', difficultyNotes: 'string' }
  },
  T12: {
    required: ['scenario', 'options', 'answerIdx'],
    types: { scenario: 'string', options: 'array', answerIdx: 'number', pragmaticsNote: 'string' }
  }
}

/**
 * 构建 Prompt
 */
export function buildPrompt({ questionType, language, cefr, unit, unitTheme, vocabulary, grammar, difficulty, count }) {
  const qt = QUESTION_TYPES[questionType]
  if (!qt) throw new Error(`Unknown question type: ${questionType}`)

  const vocabList = vocabulary ? vocabulary.join(', ') : '（未指定）'
  const grammarList = grammar ? grammar.join(', ') : '（未指定）'

  const EXAMPLE_VALUES = {
    imageDesc: '"描述图片的中文文字"',
    imagePrompt: '"[main subject + action], [2-3 visual props], flat vector, centered, white background, no text in image"',
    options: '["选项1", "选项2", "选项3", "选项4"]',
    answerIdx: '0',
    audioText: '"发音文本"',
    imageOptions: '[{"desc":"图片1描述", "prompt":"AI prompt 1"}, {"desc":"图片2描述", "prompt":"AI prompt 2"}, {"desc":"图片3描述", "prompt":"AI prompt 3"}, {"desc":"图片4描述", "prompt":"AI prompt 4"}]',
    pairs: '[{"left":"词语A","right":"含义1"},{"left":"词语B","right":"含义2"},{"left":"词语C","right":"含义3"},{"left":"词语D","right":"含义4"}]',
    sentence: '"包含 ___ 空位的句子"',
    blank: '"正确答案"',
    words: '["打乱", "的", "单词", "顺序"]',
    targetSentence: '"正确的句子顺序"',
    sourceText: '"源语言文本"',
    sourceLang: '"en"',
    question: '"与听力内容相关的问题"',
    hint: '"提示文字"',
    answer: '"正确答案"',
    commonMistakes: '["常见错误1", "常见错误2"]',
    acceptedAnswers: '["答案1", "答案2"]',
    scoringDimensions: '["发音", "流利度", "完整度"]',
    difficultyNotes: '"难度说明"',
    scenario: '"场景描述"',
    pragmaticsNote: '"语用说明"'
  }

  return `你是一位专业的${language === 'es' ? '西班牙语' : language}教材编写者，擅长为 CEFR ${cefr} 学习者设计练习题。

请生成 ${qt.id}（${qt.name}）类型的题目。
交互形式：${qt.interaction}
训练技能：${qt.skill}
认知层次：${qt.cognitive}

特有约束：${qt.promptHint}

主题为"${unitTheme}"。
词汇范围：${vocabList}
语法范围：${grammarList}
难度：${difficulty}（1-5）

请生成 ${count} 道题目。每道题目必须是一个合法的 JSON 对象，参考以下格式（内容替换为本任务的主题和词汇）：
{
  "id": "${language.toLowerCase()}-${cefr.toLowerCase()}-${unit.toLowerCase()}-${qt.id.toLowerCase()}-001",
  "type": "${qt.id}",
  "typeName": "${qt.name}",
  "language": "${language}",
  "cefr": "${cefr}",
  "unit": "${unit}",
  "unitTheme": "${unitTheme}",
  "difficulty": ${difficulty},
  "tags": ["主题标签1", "语法标签2"],
${qt.extendedFields.map(f => `  "${f}": ${EXAMPLE_VALUES[f] || '"示例"'}`).join(',\n')}
}

输出要求：一个 JSON 数组，包含 ${count} 个题目对象，序号从 001 开始递增。
数组中每个元素的字段结构必须与上述格式完全相同，仅替换内容值。
content 中只允许输出 JSON，不允许包含任何非 JSON 内容、markdown 代码块标记、解释。
生成的 JSON 必须可被 JSON.parse() 正确解析。

现在直接输出 JSON 数组：`
}

export default QUESTION_TYPES
