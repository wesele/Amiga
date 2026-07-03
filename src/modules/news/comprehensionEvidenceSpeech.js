import { shouldOfferContextSentenceSpeech } from "@/modules/vocab/contextSentenceSpeech.js";

/** Resolve TTS text for a comprehension wrong-answer detail. */
export function resolveEvidenceSpeechText(detail) {
  return String(detail?.question?.evidence_sentence ?? "").trim();
}

/** Whether evidence-sentence listen controls should appear. */
export function shouldOfferEvidenceSpeech(text) {
  return shouldOfferContextSentenceSpeech(text);
}