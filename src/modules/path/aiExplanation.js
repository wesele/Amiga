const CACHE_PREFIX = "path.ai_explanation.";
const FEEDBACK_PREFIX = "path.ai_explanation_feedback.";

export function answerHash(value) {
  const text = JSON.stringify(value ?? "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

export function explanationId(question, answer, locale = "zh") {
  return `${question?.id || "unknown"}:${answerHash(answer)}:${locale}`;
}

export function loadCachedExplanation(id, storage = window?.localStorage) {
  const raw = storage?.getItem(`${CACHE_PREFIX}${id}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveCachedExplanation(id, explanation, storage = window?.localStorage) {
  storage?.setItem(
    `${CACHE_PREFIX}${id}`,
    JSON.stringify({ ...explanation, explanation_id: id, cached_at: new Date().toISOString() }),
  );
}

export function clearExplanationCache(storage = window?.localStorage) {
  Object.keys(storage || {})
    .filter((key) => key.startsWith(CACHE_PREFIX))
    .forEach((key) => storage.removeItem(key));
}

export function fallbackExplanation(question) {
  return {
    reason: "先看标准答案，再继续下一题。",
    example: correctAnswerText(question),
    tip: "下次先抓关键词，再排除明显不合适的选项。",
    from_cache: false,
    fallback: true,
  };
}

export async function explainQuestion({
  question,
  userAnswer,
  correctAnswer,
  nativeLang,
  targetLang,
  cefr,
  chatCompletion,
  storage = window?.localStorage,
}) {
  const id = explanationId(question, userAnswer, nativeLang);
  const cached = loadCachedExplanation(id, storage);
  if (cached) return { ...cached, from_cache: true };

  try {
    const prompt = [
      "请用 80 个中文以内解释这道外语题为什么答错。",
      `题目: ${question?.prompt || question?.sourceText || question?.sentence || question?.scenario || ""}`,
      `用户答案: ${JSON.stringify(userAnswer)}`,
      `正确答案: ${correctAnswer}`,
      `母语: ${nativeLang}; 目标语: ${targetLang}; CEFR: ${cefr}`,
      "返回 JSON: {\"reason\":\"...\",\"example\":\"...\",\"tip\":\"...\"}",
    ].join("\n");
    const raw = await chatCompletion(
      [
        { role: "system", content: "你是简短、可靠的语言学习解释助手。只返回 JSON。" },
        { role: "user", content: prompt },
      ],
      nativeLang,
      targetLang,
    );
    const parsed = JSON.parse(cleanJson(raw));
    const explanation = {
      reason: String(parsed.reason || "").slice(0, 120),
      example: String(parsed.example || correctAnswer).slice(0, 120),
      tip: String(parsed.tip || "").slice(0, 120),
      from_cache: false,
      fallback: false,
    };
    saveCachedExplanation(id, explanation, storage);
    return { ...explanation, explanation_id: id };
  } catch {
    const fallback = fallbackExplanation(question);
    saveCachedExplanation(id, fallback, storage);
    return { ...fallback, explanation_id: id };
  }
}

export function saveExplanationFeedback(
  explanationIdValue,
  feedbackType,
  storage = window?.localStorage,
) {
  const record = {
    explanation_id: explanationIdValue,
    feedback_type: feedbackType,
    created_at: new Date().toISOString(),
  };
  storage?.setItem(`${FEEDBACK_PREFIX}${explanationIdValue}`, JSON.stringify(record));
  return record;
}

export function correctAnswerText(question) {
  if (!question) return "查看标准答案。";
  if (Array.isArray(question.options) && question.answerIdx != null) {
    return question.options[question.answerIdx] || "查看标准答案。";
  }
  if (question.answer) return question.answer;
  if (question.targetSentence) return question.targetSentence;
  if (Array.isArray(question.acceptedAnswers)) return question.acceptedAnswers[0] || "";
  if (Array.isArray(question.pairs)) return question.pairs.map((p) => `${p.left} = ${p.right}`).join("; ");
  return "查看标准答案。";
}

function cleanJson(raw) {
  return String(raw || "")
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
}
