import { pickReviewContext } from "./vocabReviewContext.js";
import {
  saveVocabContextRevisitPayload,
  saveVocabReviewResume,
  shouldShowContextRevisitLink,
  vocabContextRevisitRoute,
} from "./vocabContextRevisit.js";

const SNIPPET_MAX_LEN = 60;

/** Normalize session/micro-review cards so revisit checks see article context. */
export function normalizeWordForContextReinforcement(word, options = {}) {
  if (!word) return null;
  const example = String(word.example || "").trim();
  const articleId = word.context_article_id ?? word.articleId ?? options.articleId ?? null;
  if (!example || articleId == null) return null;

  const hasUserContext = word.has_user_context ?? Boolean(options.fromSession ?? true);
  if (!hasUserContext) return null;

  return {
    ...word,
    example,
    context_article_id: articleId,
    has_user_context: true,
  };
}

/** True when a still-learning rating should show the context reinforcement nudge. */
export function shouldOfferContextReinforcement(word, mastery, options = {}) {
  if (mastery !== 1) return false;
  const normalized = normalizeWordForContextReinforcement(word, options);
  if (!normalized) return false;
  return shouldShowContextRevisitLink(normalized);
}

export function truncateContextSnippet(text, maxLen = SNIPPET_MAX_LEN) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen).trimEnd()}…`;
}

export function contextSentenceForHighlight(word, sessionContextMap, options = {}) {
  const normalized = normalizeWordForContextReinforcement(word, options) ?? word;
  return pickReviewContext(normalized, sessionContextMap) || normalized?.example?.trim() || "";
}

/** Copy for the inline context reinforcement nudge. */
export function contextReinforcementCopy(word, t, sessionContextMap, options = {}) {
  const normalized = normalizeWordForContextReinforcement(word, options) ?? word;
  const snippet = truncateContextSnippet(contextSentenceForHighlight(normalized, sessionContextMap));
  return {
    title: t("vocab.contextReinforceTitle"),
    hint: t("vocab.contextReinforceHint"),
    snippet,
    actionLabel: t("vocab.contextReinforceAction"),
    skipLabel: t("vocab.contextReinforceSkip"),
  };
}

/** Persist revisit state and return the reader route. */
export function buildContextRevisitAction({ word, sessionContextMap, resume, options = {} }) {
  const normalized = normalizeWordForContextReinforcement(word, options);
  if (!normalized || !shouldShowContextRevisitLink(normalized)) return null;

  if (resume) {
    saveVocabReviewResume(resume);
  }
  saveVocabContextRevisitPayload({
    articleId: normalized.context_article_id,
    sentence: contextSentenceForHighlight(normalized, sessionContextMap),
    word: normalized.word,
  });
  return vocabContextRevisitRoute(normalized);
}