/** Collect evidence sentences from wrong comprehension answers (deduped, ordered). */
export function collectEvidenceSentences(comprehensionResult) {
  if (!comprehensionResult?.details?.length) return [];
  const seen = new Set();
  const sentences = [];
  for (const detail of comprehensionResult.details) {
    if (detail.correct) continue;
    const sentence = detail.question?.evidence_sentence?.trim();
    if (!sentence || seen.has(sentence)) continue;
    seen.add(sentence);
    sentences.push(sentence);
  }
  return sentences;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Normalize whitespace and NBSP for flexible substring matching. */
export function normalizeMatchText(text) {
  return String(text ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Locate evidence sentences in article body text.
 * Returns [{ start, end, sentence }] using original body indices.
 */
export function findEvidenceRanges(bodyText, sentences) {
  if (!bodyText || !sentences?.length) return [];
  const ranges = [];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    let start = bodyText.indexOf(trimmed);
    if (start >= 0) {
      ranges.push({ start, end: start + trimmed.length, sentence: trimmed });
      continue;
    }

    const flexible = new RegExp(
      escapeRegex(trimmed).replace(/\s+/g, "\\s+"),
      "iu",
    );
    const match = bodyText.match(flexible);
    if (match?.index != null) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
        sentence: trimmed,
      });
    }
  }

  return ranges.sort((a, b) => a.start - b.start);
}

/** Whether a token span overlaps any evidence range. */
export function tokenInEvidenceRange(charStart, charEnd, ranges) {
  if (!ranges?.length) return false;
  return ranges.some((range) => charStart < range.end && charEnd > range.start);
}

/** Map global evidence ranges to one paragraph's local coordinates. */
export function rangesForParagraph(allRanges, paraStart, paraLength) {
  const paraEnd = paraStart + paraLength;
  return allRanges
    .filter((range) => range.start < paraEnd && range.end > paraStart)
    .map((range) => ({
      start: Math.max(0, range.start - paraStart),
      end: Math.min(paraLength, range.end - paraStart),
      sentence: range.sentence,
    }));
}

function stripEvidenceFields(token) {
  if (!token.inEvidence && !token.evidenceSentence && !token.evidenceAnchor) return token;
  const {
    inEvidence: _inEvidence,
    evidenceSentence: _evidenceSentence,
    evidenceAnchor: _evidenceAnchor,
    ...rest
  } = token;
  return rest;
}

/** Annotate tokens with inEvidence based on char offsets within a paragraph. */
export function applyEvidenceToTokens(tokens, ranges) {
  if (!Array.isArray(tokens)) return [];
  if (!ranges?.length) {
    return tokens.map(stripEvidenceFields);
  }

  const anchoredSentences = new Set();
  let offset = 0;
  return tokens.map((token) => {
    const charStart = offset;
    const charEnd = offset + token.text.length;
    offset = charEnd;
    const matchingRange = ranges.find((range) =>
      tokenInEvidenceRange(charStart, charEnd, [range]),
    );
    if (!matchingRange) return stripEvidenceFields(token);

    const sentence = matchingRange.sentence;
    const evidenceAnchor = !anchoredSentences.has(sentence);
    if (evidenceAnchor) anchoredSentences.add(sentence);
    return {
      ...token,
      inEvidence: true,
      evidenceSentence: sentence,
      evidenceAnchor,
    };
  });
}

/** Find a single evidence range by sentence text (normalized whitespace). */
export function findEvidenceRangeForSentence(ranges, sentence) {
  if (!ranges?.length || !sentence) return null;
  const normalized = normalizeMatchText(sentence);
  return (
    ranges.find((range) => normalizeMatchText(range.sentence) === normalized) ?? null
  );
}

/** Build paragraph start offsets for a body split on blank lines. */
export function paragraphOffsets(bodyText) {
  const paragraphs = bodyText
    .split("\n\n")
    .map((part) => part.trim())
    .filter(Boolean);
  const offsets = [];
  let searchFrom = 0;
  for (const para of paragraphs) {
    const idx = bodyText.indexOf(para, searchFrom);
    const start = idx >= 0 ? idx : searchFrom;
    offsets.push({ text: para, start });
    searchFrom = start + para.length;
  }
  return offsets;
}

function scrollElementIntoArticleBody(articleBodyEl, el) {
  const bodyRect = articleBodyEl.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const targetTop = articleBodyEl.scrollTop + (elRect.top - bodyRect.top) - 24;
  articleBodyEl.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
}

/** Scroll article body to the first highlighted evidence token. */
export function scrollToFirstEvidence(articleBodyEl) {
  if (!articleBodyEl) return false;
  const first = articleBodyEl.querySelector(".evidence-highlight");
  if (!first) return false;
  scrollElementIntoArticleBody(articleBodyEl, first);
  return true;
}

/** Scroll article body to the first anchor for a specific evidence sentence. */
export function scrollToEvidenceSentence(articleBodyEl, sentence) {
  if (!articleBodyEl || !sentence) return false;
  const normalized = normalizeMatchText(sentence);
  const anchors = articleBodyEl.querySelectorAll("[data-evidence-sentence]");
  for (const el of anchors) {
    if (normalizeMatchText(el.dataset.evidenceSentence) === normalized) {
      scrollElementIntoArticleBody(articleBodyEl, el);
      return true;
    }
  }
  return false;
}

/** @deprecated Use scrollToFirstEvidence — kept for tests referencing scroll offset helper. */
export function evidenceScrollTarget(ranges) {
  if (!ranges?.length) return null;
  return { start: ranges[0].start };
}