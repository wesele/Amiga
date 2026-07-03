export const VOCAB_CONTEXT_REVISIT_PAYLOAD_KEY = "amiga:vocabContextRevisitPayload";
export const VOCAB_REVIEW_RESUME_KEY = "amiga:vocabReviewResume";

/** Whether the flashcard back should show a link back to the source article. */
export function shouldShowContextRevisitLink(word) {
  return Boolean(
    word?.has_user_context
    && word?.context_article_id
    && word?.example?.trim(),
  );
}

/** Build the reader deep-link for vocab context revisit. */
export function vocabContextRevisitRoute(word) {
  return {
    name: "reader",
    params: { id: String(word.context_article_id) },
    query: {
      vocabContextRevisit: "1",
      returnTo: "vocab-review",
    },
  };
}

/** Extract context sentences to highlight in the article body. */
export function contextSentencesForHighlight(word) {
  const sentence = word?.example?.trim();
  return sentence ? [sentence] : [];
}

export function saveVocabContextRevisitPayload(payload) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(VOCAB_CONTEXT_REVISIT_PAYLOAD_KEY, JSON.stringify(payload));
}

export function loadVocabContextRevisitPayload() {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(VOCAB_CONTEXT_REVISIT_PAYLOAD_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearVocabContextRevisitPayload() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(VOCAB_CONTEXT_REVISIT_PAYLOAD_KEY);
}

export function saveVocabReviewResume({ index, flipped, wordId }) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(
    VOCAB_REVIEW_RESUME_KEY,
    JSON.stringify({ index, flipped, wordId }),
  );
}

export function loadVocabReviewResume() {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(VOCAB_REVIEW_RESUME_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearVocabReviewResume() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(VOCAB_REVIEW_RESUME_KEY);
}

/** True when the reader should return to vocab review on hardware back. */
export function shouldReturnToVocabReview(route) {
  return route?.query?.returnTo === "vocab-review";
}

/** Resolve review index after returning from context revisit. */
export function resolveVocabReviewResumeIndex(words, resume) {
  if (!resume || !Array.isArray(words) || !words.length) return null;
  if (resume.wordId != null) {
    const byId = words.findIndex((entry) => entry.id === resume.wordId);
    if (byId >= 0) return byId;
  }
  if (Number.isInteger(resume.index) && resume.index >= 0 && resume.index < words.length) {
    return resume.index;
  }
  return null;
}