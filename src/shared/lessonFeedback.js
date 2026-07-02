import { readLocalJson, writeLocalJson } from "./localJsonStore.js";

export const FEEDBACK_PREFS_KEY = "lesson_feedback_prefs";

export const DEFAULT_FEEDBACK_PREFS = {
  enabled: true,
};

export function getFeedbackPrefs() {
  const stored = readLocalJson(FEEDBACK_PREFS_KEY, DEFAULT_FEEDBACK_PREFS);
  return { ...DEFAULT_FEEDBACK_PREFS, ...stored };
}

export function setFeedbackEnabled(enabled) {
  writeLocalJson(FEEDBACK_PREFS_KEY, { enabled: Boolean(enabled) });
}

export function shouldPlayFeedback(prefs = getFeedbackPrefs()) {
  return Boolean(prefs?.enabled);
}

/** Vibration pattern in ms; empty when haptics unavailable. */
export function hapticPattern(isCorrect) {
  return isCorrect ? [12] : [35, 40, 35];
}

export function correctToneSequence() {
  return [
    { frequency: 523.25, duration: 0.08, gain: 0.12 },
    { frequency: 659.25, duration: 0.12, gain: 0.14 },
  ];
}

export function incorrectToneSequence() {
  return [{ frequency: 200, duration: 0.15, gain: 0.1, type: "square" }];
}

export async function playToneSequence(sequence, audioContext) {
  if (!audioContext || !sequence?.length) return;
  let time = audioContext.currentTime;
  for (const note of sequence) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = note.type || "sine";
    osc.frequency.value = note.frequency;
    gain.gain.setValueAtTime(note.gain, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + note.duration);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(time);
    osc.stop(time + note.duration);
    time += note.duration * 0.85;
  }
}

function createAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  return new AudioCtx();
}

export function playToneFeedback(isCorrect) {
  const ctx = createAudioContext();
  if (!ctx) return;
  const sequence = isCorrect ? correctToneSequence() : incorrectToneSequence();
  const run = () => {
    playToneSequence(sequence, ctx).catch(() => {});
  };
  if (ctx.state === "suspended") {
    ctx.resume().then(run).catch(() => {});
    return;
  }
  run();
}

export function triggerHaptic(pattern) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (!pattern?.length) return;
  navigator.vibrate(pattern);
}

export function playAnswerFeedback(isCorrect, deps = {}) {
  if (!shouldPlayFeedback(deps.prefs)) return;
  const playSound = deps.playSound ?? playToneFeedback;
  const vibrate = deps.vibrate ?? triggerHaptic;
  playSound(isCorrect);
  vibrate(hapticPattern(isCorrect));
}