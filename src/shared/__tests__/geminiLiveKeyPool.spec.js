import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_GEMINI_LIVE_TPM_LIMIT,
  extractGeminiLiveUsageTokens,
  formatGeminiLiveQuotaWaitMessage,
  getGeminiLiveKeyStatus,
  isGeminiLiveRateLimitError,
  markGeminiLiveKeyRateLimited,
  normalizeGeminiLiveKeys,
  recordGeminiLiveUsage,
  resetGeminiLiveTpmTracker,
  selectGeminiLiveKey,
} from "../geminiLiveKeyPool.js";
import { setLocale } from "@/shared/i18n/index.js";

describe("geminiLiveKeyPool", () => {
  beforeEach(() => {
    resetGeminiLiveTpmTracker();
    setLocale("zh", { persist: false });
  });

  it("normalizes, deduplicates, and defaults tpm_limit to 65000", () => {
    const pool = normalizeGeminiLiveKeys(
      [
        { id: "p1", label: "Proj 1", api_key: " key-a ", tpm_limit: 0 },
        { id: "p2", label: "Proj 2", api_key: "key-b", tpm_limit: 80000 },
        { id: "dup", label: "Dup", api_key: "key-a", tpm_limit: 50000 },
        { id: "empty", label: "Empty", api_key: "   ", tpm_limit: 65000 },
      ],
      "fallback-key"
    );
    expect(pool).toEqual([
      { id: "p1", label: "Proj 1", api_key: "key-a", tpm_limit: DEFAULT_GEMINI_LIVE_TPM_LIMIT },
      { id: "p2", label: "Proj 2", api_key: "key-b", tpm_limit: 80000 },
    ]);

    const fallbackPool = normalizeGeminiLiveKeys([], " legacy-key ");
    expect(fallbackPool).toEqual([
      { id: "default", label: "", api_key: "legacy-key", tpm_limit: 65000 },
    ]);
  });

  it("extracts usage tokens from totalTokenCount or component breakdown", () => {
    expect(extractGeminiLiveUsageTokens({ usageMetadata: { totalTokenCount: 1234 } })).toBe(1234);
    expect(
      extractGeminiLiveUsageTokens({
        usageMetadata: {
          promptTokenCount: 500,
          responseTokenCount: 200,
          thoughtsTokenCount: 50,
        },
      })
    ).toBe(750);
    expect(extractGeminiLiveUsageTokens({})).toBe(0);
  });

  it("selects the eligible key with lowest 60s TPM and switches at 80% threshold", () => {
    const now = 1_000_000;
    const pool = [
      { id: "1", label: "A", api_key: "key-a", tpm_limit: 65000 },
      { id: "2", label: "B", api_key: "key-b", tpm_limit: 65000 },
      { id: "3", label: "C", api_key: "key-c", tpm_limit: 65000 },
    ];

    recordGeminiLiveUsage("key-a", 30000, now - 5000);
    recordGeminiLiveUsage("key-b", 10000, now - 4000);
    recordGeminiLiveUsage("key-c", 20000, now - 3000);

    // Lowest TPM is key-b (10000)
    const first = selectGeminiLiveKey(pool, { now });
    expect(first.exhausted).toBe(false);
    expect(first.key).toBe("key-b");

    // Push key-b to exactly 80% of 65000 (52000): 10000 + 42000 = 52000
    const stB = recordGeminiLiveUsage("key-b", 42000, now - 1000);
    expect(stB.overThreshold).toBe(true);

    // Next selection should skip key-b and pick lowest remaining eligible key (key-c = 20000)
    const second = selectGeminiLiveKey(pool, { now });
    expect(second.exhausted).toBe(false);
    expect(second.key).toBe("key-c");
  });

  it("expires usage events older than 60s and calculates waitMs when all keys are >= 80%", () => {
    const t0 = 2_000_000;
    const pool = [
      { id: "1", label: "A", api_key: "key-a", tpm_limit: 65000 },
      { id: "2", label: "B", api_key: "key-b", tpm_limit: 65000 },
    ];

    recordGeminiLiveUsage("key-a", 52000, t0);
    recordGeminiLiveUsage("key-b", 53000, t0 + 15000);

    const checkAt30s = selectGeminiLiveKey(pool, { now: t0 + 30_000 });
    expect(checkAt30s.exhausted).toBe(true);
    expect(checkAt30s.key).toBeNull();
    // key-a drops below 52000 at t0 + 60_000 -> waitMs = 30_000
    expect(checkAt30s.waitMs).toBe(30_000);
    expect(formatGeminiLiveQuotaWaitMessage(checkAt30s.waitMs)).toContain("30");

    // At t0 + 60_001, key-a's 52000 event expires, so key-a is eligible again
    const checkAfterExpiry = selectGeminiLiveKey(pool, { now: t0 + 60_001 });
    expect(checkAfterExpiry.exhausted).toBe(false);
    expect(checkAfterExpiry.key).toBe("key-a");
    expect(getGeminiLiveKeyStatus("key-a", t0 + 60_001).tpm).toBe(0);
  });

  it("respects 429 cooldown and rate-limit error detection", () => {
    const now = 3_000_000;
    const pool = [
      { id: "1", label: "A", api_key: "key-a", tpm_limit: 65000 },
      { id: "2", label: "B", api_key: "key-b", tpm_limit: 65000 },
    ];
    expect(isGeminiLiveRateLimitError("429 Resource has been exhausted (quota exceeded)")).toBe(true);
    expect(isGeminiLiveRateLimitError("Invalid API key")).toBe(false);

    markGeminiLiveKeyRateLimited("key-a", 45_000, now);
    const sel = selectGeminiLiveKey(pool, { now: now + 1000 });
    expect(sel.key).toBe("key-b");

    markGeminiLiveKeyRateLimited("key-b", 20_000, now);
    const exhaustedSel = selectGeminiLiveKey(pool, { now: now + 1000 });
    expect(exhaustedSel.exhausted).toBe(true);
    expect(exhaustedSel.waitMs).toBe(19_000);
  });
});
