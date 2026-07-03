import { paragraphOffsets } from "./comprehensionEvidence.js";

/** Strip Markdown bold markers so TTS does not read asterisks. */
export function stripMarkdownBold(text) {
  return String(text ?? "").replace(/\*\*(.+?)\*\*/g, "$1");
}

/** Extract readable paragraphs from article body (blank-line split, no bold markers). */
export function extractReadableParagraphs(bodyText) {
  if (!bodyText) return [];
  return paragraphOffsets(bodyText)
    .map(({ text }) => stripMarkdownBold(text).trim())
    .filter(Boolean);
}

/** Clamp paragraph index into [0, total-1]; returns 0 when total is 0. */
export function clampParagraphIndex(index, total) {
  if (total <= 0) return 0;
  if (index < 0) return 0;
  if (index >= total) return total - 1;
  return index;
}

/** Whether listen-along should auto-pause due to overlapping UI. */
export function shouldPauseListenAlong({
  microReviewOpen = false,
  wordPopupOpen = false,
  selectionActive = false,
  overlayOpen = false,
} = {}) {
  return microReviewOpen || wordPopupOpen || selectionActive || overlayOpen;
}

/** Scroll article body so a paragraph sits near the vertical center. */
export function scrollToParagraph(articleBodyEl, paragraphEl) {
  if (!articleBodyEl || !paragraphEl) return false;
  const bodyRect = articleBodyEl.getBoundingClientRect();
  const elRect = paragraphEl.getBoundingClientRect();
  const targetTop =
    articleBodyEl.scrollTop +
    (elRect.top - bodyRect.top) -
    (bodyRect.height - elRect.height) / 2;
  articleBodyEl.scrollTo({
    top: Math.max(0, targetTop),
    behavior: "smooth",
  });
  return true;
}

/** Index of the paragraph whose midpoint is closest to the viewport center. */
export function findParagraphIndexInViewport(
  articleBodyEl,
  paragraphSelector = ".para-original",
) {
  if (!articleBodyEl) return 0;
  const paragraphs = articleBodyEl.querySelectorAll(paragraphSelector);
  if (!paragraphs.length) return 0;
  const bodyRect = articleBodyEl.getBoundingClientRect();
  const viewportMid = bodyRect.top + bodyRect.height / 2;
  let bestIdx = 0;
  let bestDist = Infinity;
  paragraphs.forEach((el, idx) => {
    const rect = el.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const dist = Math.abs(mid - viewportMid);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = idx;
    }
  });
  return bestIdx;
}