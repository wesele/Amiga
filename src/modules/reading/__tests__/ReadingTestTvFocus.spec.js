import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(__dirname, "../ReadingTest.vue"), "utf8");

describe("ReadingTest TV remote focus policy", () => {
  it("keeps options focusable on TV after answering (aria-disabled, not hard-disabled)", () => {
    expect(source).toMatch(/optionsHardDisabled/);
    expect(source).toMatch(/!isTvLayoutMode && isCurrentAnswered/);
    expect(source).toMatch(/:aria-disabled="isCurrentAnswered \? 'true' : undefined"/);
    // Phone still hard-disables options after answer.
    expect(source).toMatch(/:disabled="optionsHardDisabled"/);
  });

  it("manages focus across load, answer, question change, and result", () => {
    expect(source).toMatch(/focusQuestionPrimary/);
    expect(source).toMatch(/focusPrimaryNav/);
    expect(source).toMatch(/focusResultPrimary/);
    expect(source).toMatch(/watch\(currentQuestionIndex/);
    expect(source).toMatch(/watch\(submitted/);
    // Wrong answer → Next/Submit; correct → auto-advance then question focus.
    expect(source).toMatch(/focusPrimaryNav\(\)/);
    expect(source).toMatch(/scheduleAutoAdvance/);
  });

  it("scopes the score dialog so remote cannot land on buried options", () => {
    expect(source).toMatch(/class="popup-overlay result-overlay"/);
    expect(source).toMatch(/v-else-if="!submitted"/);
    expect(source).toMatch(/data-tv-preferred-focus/);
    expect(source).toMatch(/class="[^"]*result-btn/);
  });

  it("uses test-nav-btn (not bare nav-btn) so bottom controls are not confused with L1 rail", () => {
    expect(source).toMatch(/test-nav-btn/);
    // Bare class token "nav-btn" (not "test-nav-btn") must not appear.
    expect(source).not.toMatch(/(?:^|[\s"'])nav-btn(?:[\s"']|$)/m);
  });
});
