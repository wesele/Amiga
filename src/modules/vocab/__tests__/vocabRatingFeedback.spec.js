import { describe, expect, it, vi } from "vitest";
import {
  VOCAB_RATING_ACK_MS,
  playVocabRatingFeedback,
  stillLearningToneSequence,
  vocabRatingAckDelayMs,
  vocabRatingAckKind,
  vocabRatingHapticPattern,
  waitVocabRatingAck,
} from "../vocabRatingFeedback.js";

describe("vocabRatingFeedback", () => {
  it("maps mastery to acknowledgment kinds", () => {
    expect(vocabRatingAckKind(2)).toBe("positive");
    expect(vocabRatingAckKind(3)).toBe("positive");
    expect(vocabRatingAckKind(1)).toBe("learning");
  });

  it("uses a brief delay so ratings feel intentional", () => {
    expect(vocabRatingAckDelayMs()).toBe(VOCAB_RATING_ACK_MS);
  });

  it("uses lighter haptics for still-learning ratings", () => {
    expect(vocabRatingHapticPattern(2)).toEqual([12]);
    expect(vocabRatingHapticPattern(1)).toEqual([8]);
  });

  it("still-learning tone is gentle, not the incorrect buzz", () => {
    const [note] = stillLearningToneSequence();
    expect(note.gain).toBeLessThan(0.1);
    expect(note.frequency).toBeGreaterThan(250);
  });

  it("plays success feedback when the learner marks a word known", () => {
    const playSound = vi.fn();
    const vibrate = vi.fn();
    const playSequence = vi.fn();

    playVocabRatingFeedback(2, { prefs: { enabled: true }, playSound, vibrate, playSequence });

    expect(vibrate).toHaveBeenCalledWith([12]);
    expect(playSound).toHaveBeenCalledWith(true);
    expect(playSequence).not.toHaveBeenCalled();
  });

  it("plays a soft acknowledgment when still learning", () => {
    const playSound = vi.fn();
    const vibrate = vi.fn();
    const playSequence = vi.fn();

    playVocabRatingFeedback(1, { prefs: { enabled: true }, playSound, vibrate, playSequence });

    expect(vibrate).toHaveBeenCalledWith([8]);
    expect(playSound).not.toHaveBeenCalled();
    expect(playSequence).toHaveBeenCalledWith(stillLearningToneSequence());
  });

  it("respects disabled feedback preferences", () => {
    const playSound = vi.fn();
    const vibrate = vi.fn();

    playVocabRatingFeedback(2, { prefs: { enabled: false }, playSound, vibrate });

    expect(playSound).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("waitVocabRatingAck resolves after the configured delay", async () => {
    vi.useFakeTimers();
    const promise = waitVocabRatingAck(100);
    vi.advanceTimersByTime(99);
    await Promise.resolve();
    let settled = false;
    promise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    vi.advanceTimersByTime(1);
    await promise;
    expect(settled).toBe(true);
    vi.useRealTimers();
  });
});