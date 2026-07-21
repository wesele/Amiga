import { describe, expect, it } from "vitest";
import {
  achievementTracksForMode,
  ACHIEVEMENT_TRACKS_DEFAULT,
  ACHIEVEMENT_TRACKS_TV,
  isTvScrollKey,
  learnSettingsSubtitleKey,
  scrollDeltaForArrowKey,
  scrollDeltaForKey,
  shouldBlockUiOnRewrite,
  shouldShowL1Nav,
  shouldShowOriginalWhileRewriting,
} from "../tvPolicy.js";

describe("tvPolicy", () => {
  it("keeps the TV side rail on the news reader while phone still hides it", () => {
    expect(shouldShowL1Nav("reader", false)).toBe(false);
    expect(shouldShowL1Nav("reader", true)).toBe(true);
    expect(shouldShowL1Nav("wizard", true)).toBe(false);
    expect(shouldShowL1Nav("learn", true)).toBe(true);
    expect(shouldShowL1Nav("chat-session", false)).toBe(false);
    expect(shouldShowL1Nav("chat-session", true)).toBe(true);
  });

  it("never blocks the living-room UI on AI rewrite", () => {
    expect(shouldBlockUiOnRewrite(false)).toBe(true);
    expect(shouldBlockUiOnRewrite(true)).toBe(false);
    expect(shouldShowOriginalWhileRewriting(true)).toBe(true);
    expect(shouldShowOriginalWhileRewriting(false)).toBe(false);
  });

  it("includes appOpen in achievement heat maps", () => {
    expect(achievementTracksForMode(false)).toEqual(ACHIEVEMENT_TRACKS_DEFAULT);
    expect(achievementTracksForMode(true)).toEqual(ACHIEVEMENT_TRACKS_TV);
    expect(achievementTracksForMode(true)).toContain("appOpen");
    expect(achievementTracksForMode(true)).toHaveLength(4);
  });

  it("maps PageUp/PageDown and edge arrows to scroll deltas", () => {
    expect(isTvScrollKey("PageDown")).toBe(true);
    expect(isTvScrollKey("PageUp")).toBe(true);
    expect(isTvScrollKey("ArrowDown")).toBe(false);
    expect(scrollDeltaForKey("PageDown", 400)).toBe(400);
    expect(scrollDeltaForKey("PageUp", 400)).toBe(-400);
    expect(scrollDeltaForArrowKey("ArrowDown", 120)).toBe(120);
    expect(scrollDeltaForArrowKey("ArrowUp", 120)).toBe(-120);
    expect(scrollDeltaForArrowKey("ArrowLeft", 120)).toBe(0);
  });

  it("uses TV-honest profile settings copy keys", () => {
    expect(learnSettingsSubtitleKey(false)).toBe("profile.learnSettingsSub");
    expect(learnSettingsSubtitleKey(true)).toBe("profile.learnSettingsSubTv");
  });
});
