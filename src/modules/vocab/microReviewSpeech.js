/** Whether the micro-review card word is a single-token TTS target (not a phrase). */
export function isMicroReviewSpeechTarget(word) {
  const trimmed = String(word || "").trim();
  if (!trimmed) return false;
  return trimmed.split(/\s+/).length === 1;
}

/** Auto-play once when a new single-word card front is shown. */
export function shouldAutoPlayMicroReviewSpeech({
  word,
  acting = false,
  ratingAck = null,
  open = false,
  enableAutoPlay = true,
} = {}) {
  return (
    open &&
    enableAutoPlay &&
    isMicroReviewSpeechTarget(word) &&
    !acting &&
    !ratingAck
  );
}