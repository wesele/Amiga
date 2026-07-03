import { describe, expect, it, vi } from "vitest";
import {
  resolveEvidenceSpeechText,
  shouldOfferEvidenceSpeech,
} from "../comprehensionEvidenceSpeech.js";
import {
  findEvidenceRangeForSentence,
  findEvidenceRanges,
  normalizeMatchText,
  scrollToEvidenceSentence,
} from "../comprehensionEvidence.js";

const BODY =
  "El banco central subió las tasas para frenar la inflación. La inflación sigue siendo alta este año.";

describe("resolveEvidenceSpeechText", () => {
  it("extracts trimmed evidence sentence from wrong-answer detail", () => {
    expect(
      resolveEvidenceSpeechText({
        question: { evidence_sentence: "  La inflación sigue siendo alta este año.  " },
      }),
    ).toBe("La inflación sigue siendo alta este año.");
  });

  it("returns empty string when evidence is missing", () => {
    expect(resolveEvidenceSpeechText({ question: {} })).toBe("");
    expect(resolveEvidenceSpeechText(null)).toBe("");
  });
});

describe("shouldOfferEvidenceSpeech", () => {
  it("matches context sentence speech eligibility", () => {
    expect(shouldOfferEvidenceSpeech("La inflación sigue siendo alta este año.")).toBe(true);
    expect(shouldOfferEvidenceSpeech("   ")).toBe(false);
  });
});

describe("findEvidenceRangeForSentence", () => {
  it("finds a range by normalized sentence text", () => {
    const ranges = findEvidenceRanges(BODY, [
      "El banco central subió las tasas para frenar la inflación.",
      "La inflación sigue siendo alta este año.",
    ]);
    const match = findEvidenceRangeForSentence(ranges, "La inflación sigue siendo alta este año.");
    expect(match?.sentence).toBe("La inflación sigue siendo alta este año.");
    expect(normalizeMatchText(BODY.slice(match.start, match.end))).toBe(
      "La inflación sigue siendo alta este año.",
    );
  });
});

describe("scrollToEvidenceSentence", () => {
  it("scrolls to the anchor for a specific evidence sentence", () => {
    const el = document.createElement("div");
    el.scrollTo = vi.fn();
    Object.defineProperty(el, "scrollTop", { value: 0, writable: true });
    el.getBoundingClientRect = () => ({ top: 0, height: 400 });

    const first = document.createElement("span");
    first.className = "evidence-highlight";
    first.dataset.evidenceSentence = "El banco central subió las tasas para frenar la inflación.";
    first.getBoundingClientRect = () => ({ top: 80, height: 16 });

    const second = document.createElement("span");
    second.className = "evidence-highlight";
    second.dataset.evidenceSentence = "La inflación sigue siendo alta este año.";
    second.getBoundingClientRect = () => ({ top: 240, height: 16 });

    el.append(first, second);

    expect(
      scrollToEvidenceSentence(el, "La inflación sigue siendo alta este año."),
    ).toBe(true);
    expect(el.scrollTo).toHaveBeenCalled();
  });
});