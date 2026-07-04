export const ASSESSMENT_ITEMS = [
  {
    id: "vocab-1",
    skill: "vocabulary",
    difficulty: 1,
    type: "choice",
    prompt: "西班牙语 hola 最接近哪个意思？",
    options: ["你好", "谢谢", "再见"],
    answer: 0,
  },
  {
    id: "grammar-1",
    skill: "grammar",
    difficulty: 1,
    type: "choice",
    prompt: "Yo ___ estudiante.",
    options: ["soy", "eres", "son"],
    answer: 0,
  },
  {
    id: "reading-1",
    skill: "reading",
    difficulty: 1,
    type: "choice",
    prompt: "Leo: Maria bebe agua. Maria 在做什么？",
    options: ["喝水", "看书", "睡觉"],
    answer: 0,
  },
  {
    id: "listening-1",
    skill: "listening",
    difficulty: 1,
    type: "choice",
    prompt: "听力占位：如果听到 gracias，应选？",
    options: ["谢谢", "晚上好", "多少钱"],
    answer: 0,
  },
  {
    id: "vocab-2",
    skill: "vocabulary",
    difficulty: 2,
    type: "choice",
    prompt: "rápido 的反义词更可能是？",
    options: ["lento", "verde", "nuevo"],
    answer: 0,
  },
  {
    id: "grammar-2",
    skill: "grammar",
    difficulty: 2,
    type: "choice",
    prompt: "Nosotros ___ café.",
    options: ["bebemos", "bebo", "beben"],
    answer: 0,
  },
  {
    id: "reading-2",
    skill: "reading",
    difficulty: 2,
    type: "choice",
    prompt: "El tren sale a las ocho. 火车几点出发？",
    options: ["八点", "十点", "六点"],
    answer: 0,
  },
  {
    id: "vocab-3",
    skill: "vocabulary",
    difficulty: 3,
    type: "choice",
    prompt: "aunque 通常表达？",
    options: ["虽然", "因为", "所以"],
    answer: 0,
  },
  {
    id: "grammar-3",
    skill: "grammar",
    difficulty: 3,
    type: "choice",
    prompt: "Ayer ___ al mercado.",
    options: ["fui", "voy", "iba siempre"],
    answer: 0,
  },
  {
    id: "reading-3",
    skill: "reading",
    difficulty: 3,
    type: "choice",
    prompt: "No solo estudia, sino que también trabaja. 句子强调？",
    options: ["既学习也工作", "只学习", "既不学习也不工作"],
    answer: 0,
  },
  {
    id: "expression-1",
    skill: "expression",
    difficulty: 2,
    type: "text",
    prompt: "用目标语写一句自我介绍。",
    placeholder: "例如：Me llamo...",
  },
  {
    id: "expression-2",
    skill: "expression",
    difficulty: 3,
    type: "text",
    prompt: "用目标语写一句你今天想做的事。",
    placeholder: "例如：Hoy quiero...",
  },
];

export const SKILL_LABELS = {
  vocabulary: "词汇",
  grammar: "语法",
  reading: "阅读",
  listening: "听力",
  expression: "表达",
};

export function scoreAssessment(items, answers) {
  const breakdown = Object.keys(SKILL_LABELS).reduce((acc, skill) => {
    acc[skill] = { correct: 0, total: 0, score: 0, comment: "" };
    return acc;
  }, {});

  let weightedCorrect = 0;
  let weightedTotal = 0;
  for (const item of items) {
    const bucket = breakdown[item.skill];
    bucket.total += 1;
    const weight = item.difficulty;
    weightedTotal += weight;
    const answer = answers[item.id];
    const correct = item.type === "text"
      ? String(answer || "").trim().split(/\s+/).filter(Boolean).length >= 2
      : Number(answer) === item.answer;
    if (correct) {
      bucket.correct += 1;
      weightedCorrect += weight;
    }
  }

  for (const [skill, bucket] of Object.entries(breakdown)) {
    bucket.score = bucket.total ? Math.round((bucket.correct / bucket.total) * 100) : 0;
    bucket.comment = skill === "listening" && bucket.total === 0
      ? "暂无听力数据，先保留占位。"
      : commentForScore(bucket.score);
  }

  const overall = weightedTotal ? Math.round((weightedCorrect / weightedTotal) * 100) : 0;
  const cefr = estimateCefr(overall);
  const confidence = Math.min(92, Math.max(48, Math.round(55 + items.length * 2 + overall / 5)));
  return {
    overall,
    cefr,
    confidence,
    breakdown,
    suggestions: suggestionsForBreakdown(breakdown).slice(0, 3),
  };
}

export function estimateCefr(score) {
  if (score >= 82) return "B1";
  if (score >= 58) return "A2";
  return "A1";
}

function commentForScore(score) {
  if (score >= 80) return "比较稳，可以接更真实的材料。";
  if (score >= 50) return "有基础，适合边练边补。";
  return "建议放慢一点，从短任务开始。";
}

function suggestionsForBreakdown(breakdown) {
  const entries = Object.entries(breakdown)
    .sort((a, b) => a[1].score - b[1].score);
  return entries.map(([skill, bucket]) => {
    if (skill === "listening") return "听力先按占位处理，继续用朗读和跟读热身。";
    return `${SKILL_LABELS[skill]} ${bucket.score} 分：${bucket.comment}`;
  });
}
