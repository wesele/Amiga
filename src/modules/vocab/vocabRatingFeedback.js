import {
  correctToneSequence,
  playToneSequence,
  playToneFeedback,
  shouldPlayFeedback,
  triggerHaptic,
} from "@/shared/lessonFeedback.js";

/** Brief pause so learners feel the rating land before the next card. */
export const VOCAB_RATING_ACK_MS = 320;

export function vocabRatingAckDelayMs() {
  return VOCAB_RATING_ACK_MS;
}

export function vocabRatingAckKind(mastery) {
  return mastery >= 2 ? "positive" : "learning";
}

/** Softer tone when the learner is honest about still learning — not a failure buzz. */
export function stillLearningToneSequence() {
  return [{ frequency: 392, duration: 0.07, gain: 0.06 }];
}

export function vocabRatingHapticPattern(mastery) {
  return mastery >= 2 ? [12] : [8];
}

export function waitVocabRatingAck(ms = vocabRatingAckDelayMs()) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  return new AudioCtx();
}

function playStillLearningTone(deps = {}) {
  const playSequence = deps.playSequence;
  if (playSequence) {
    playSequence(stillLearningToneSequence());
    return;
  }
  const ctx = createAudioContext();
  if (!ctx) return;
  const run = () => {
    playToneSequence(stillLearningToneSequence(), ctx).catch(() => {});
  };
  if (ctx.state === "suspended") {
    ctx.resume().then(run).catch(() => {});
    return;
  }
  run();
}

/**
 * Sensory acknowledgment when a flashcard is rated.
 * Celebrates mastery without punishing an honest "still learning".
 */
export function playVocabRatingFeedback(mastery, deps = {}) {
  if (!shouldPlayFeedback(deps.prefs)) return;
  const vibrate = deps.vibrate ?? triggerHaptic;
  vibrate(vocabRatingHapticPattern(mastery));
  if (mastery >= 2) {
    const playSound = deps.playSound ?? playToneFeedback;
    playSound(true);
    return;
  }
  playStillLearningTone(deps);
}