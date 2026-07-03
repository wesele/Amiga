import { describe, expect, it, vi } from "vitest";
import {
  applyEvidenceToTokens,
  collectEvidenceSentences,
  findEvidenceRanges,
  normalizeMatchText,
  paragraphOffsets,
  rangesForParagraph,
  scrollToFirstEvidence,
  scrollToEvidenceSentence,
  findEvidenceRangeForSentence,
  tokenInEvidenceRange,
} from "../comprehensionEvidence.js";
import { tokenizeArticleText } from "../articleText.js";

const BODY =
  "El banco central subió las tasas para frenar la inflación. La inflación sigue siendo alta este año.";

describe("collectEvidenceSentences", () => {
  it("dedupes wrong-answer evidence sentences in order", () => {
    const result = {
      details: [
        {
          correct: false,
          question: { evidence_sentence: "La inflación sigue siendo alta este año." },
        },
        {
          correct: true,
          question: { evidence_sentence: "ignored" },
        },
        {
          correct: false,
          question: { evidence_sentence: "La inflación sigue siendo alta este año." },
        },
        {
          correct: false,
          question: {
            evidence_sentence: "El banco central subió las tasas para frenar la inflación.",
          },
        },
      ],
    };
    expect(collectEvidenceSentences(result)).toEqual([
      "La inflación sigue siendo alta este año.",
      "El banco central subió las tasas para frenar la inflación.",
    ]);
  });
});

describe("findEvidenceRanges", () => {
  it("finds exact and flexible-whitespace matches", () => {
    const exact = findEvidenceRanges(BODY, [
      "El banco central subió las tasas para frenar la inflación.",
    ]);
    expect(exact).toHaveLength(1);
    expect(BODY.slice(exact[0].start, exact[0].end)).toBe(
      "El banco central subió las tasas para frenar la inflación.",
    );

    const flexibleBody = "El banco central subió  las tasas para frenar la inflación.";
    const flexible = findEvidenceRanges(flexibleBody, [
      "El banco central subió las tasas para frenar la inflación.",
    ]);
    expect(flexible).toHaveLength(1);
  });

  it("normalizes NBSP for matching", () => {
    const nbspBody = "La inflación\u00a0sigue siendo alta este año.";
    const ranges = findEvidenceRanges(nbspBody, ["La inflación sigue siendo alta este año."]);
    expect(ranges).toHaveLength(1);
    expect(normalizeMatchText(nbspBody.slice(ranges[0].start, ranges[0].end))).toBe(
      "La inflación sigue siendo alta este año.",
    );
  });
});

describe("token evidence helpers", () => {
  it("marks tokens that overlap evidence ranges", () => {
    const ranges = findEvidenceRanges(BODY, ["La inflación sigue siendo alta este año."]);
    const tokens = applyEvidenceToTokens(tokenizeArticleText(BODY), ranges);
    const highlighted = tokens.filter((token) => token.inEvidence);
    expect(highlighted.length).toBeGreaterThan(0);
    expect(
      highlighted.some((token) => token.text.toLowerCase().includes("inflación")),
    ).toBe(true);
  });

  it("anchors the first token per evidence sentence for DOM lookup", () => {
    const ranges = findEvidenceRanges(BODY, [
      "El banco central subió las tasas para frenar la inflación.",
      "La inflación sigue siendo alta este año.",
    ]);
    const tokens = applyEvidenceToTokens(tokenizeArticleText(BODY), ranges);
    const anchors = tokens.filter((token) => token.evidenceAnchor);
    expect(anchors).toHaveLength(2);
    expect(anchors.map((token) => token.evidenceSentence)).toEqual([
      "El banco central subió las tasas para frenar la inflación.",
      "La inflación sigue siendo alta este año.",
    ]);
  });

  it("maps paragraph-local ranges from global offsets", () => {
    const ranges = findEvidenceRanges(BODY, [
      "El banco central subió las tasas para frenar la inflación.",
      "La inflación sigue siendo alta este año.",
    ]);
    const offsets = paragraphOffsets(BODY);
    expect(offsets).toHaveLength(1);
    const local = rangesForParagraph(ranges, offsets[0].start, offsets[0].text.length);
    expect(local).toHaveLength(2);
    expect(tokenInEvidenceRange(0, 3, local)).toBe(true);
  });
});

describe("scrollToFirstEvidence", () => {
  it("scrolls to the first highlighted element", () => {
    const el = document.createElement("div");
    el.scrollTo = vi.fn();
    const mark = document.createElement("span");
    mark.className = "evidence-highlight";
    el.appendChild(mark);
    el.getBoundingClientRect = () => ({ top: 0, height: 400 });
    mark.getBoundingClientRect = () => ({ top: 200, height: 16 });
    Object.defineProperty(el, "scrollTop", { value: 0, writable: true });

    expect(scrollToFirstEvidence(el)).toBe(true);
    expect(el.scrollTo).toHaveBeenCalled();
  });
});