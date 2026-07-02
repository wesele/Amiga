import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FEEDBACK_PREFS,
  FEEDBACK_PREFS_KEY,
  correctToneSequence,
  getFeedbackPrefs,
  hapticPattern,
  incorrectToneSequence,
  playAnswerFeedback,
  playToneSequence,
  setFeedbackEnabled,
  shouldPlayFeedback,
} from "../lessonFeedback.js";

describe("lessonFeedback", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults feedback to enabled", () => {
    expect(getFeedbackPrefs()).toEqual(DEFAULT_FEEDBACK_PREFS);
    expect(shouldPlayFeedback()).toBe(true);
  });

  it("persists disabled feedback preference", () => {
    setFeedbackEnabled(false);
    expect(localStorage.getItem(FEEDBACK_PREFS_KEY)).toContain('"enabled":false');
    expect(shouldPlayFeedback()).toBe(false);
  });

  it("uses distinct haptic patterns for correct and incorrect answers", () => {
    expect(hapticPattern(true)).toEqual([12]);
    expect(hapticPattern(false)).toEqual([35, 40, 35]);
  });

  it("defines ascending tones for correct answers and a low buzz for incorrect", () => {
    expect(correctToneSequence()).toHaveLength(2);
    expect(correctToneSequence()[0].frequency).toBeLessThan(correctToneSequence()[1].frequency);
    expect(incorrectToneSequence()[0].frequency).toBeLessThan(correctToneSequence()[0].frequency);
  });

  it("plays sound and haptic feedback when enabled", () => {
    const playSound = vi.fn();
    const vibrate = vi.fn();
    playAnswerFeedback(true, { playSound, vibrate });
    expect(playSound).toHaveBeenCalledWith(true);
    expect(vibrate).toHaveBeenCalledWith([12]);
  });

  it("skips feedback when disabled", () => {
    const playSound = vi.fn();
    const vibrate = vi.fn();
    playAnswerFeedback(false, {
      prefs: { enabled: false },
      playSound,
      vibrate,
    });
    expect(playSound).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("schedules oscillator tones on an audio context", async () => {
    const start = vi.fn();
    const stop = vi.fn();
    const connect = vi.fn();
    const createOscillator = vi.fn(() => ({
      type: "sine",
      frequency: { value: 0 },
      connect,
      start,
      stop,
    }));
    const createGain = vi.fn(() => ({
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect,
    }));
    const audioContext = {
      currentTime: 0,
      destination: {},
      createOscillator,
      createGain,
    };

    await playToneSequence(correctToneSequence(), audioContext);

    expect(createOscillator).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledTimes(2);
  });
});