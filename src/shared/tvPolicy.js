/**
 * Pure TV-mode policy helpers. Kept free of Vue/DOM so unit tests can
 * drive the shipped decision logic without a WebView.
 */

/** Routes that hide L1 chrome on phone, but keep the TV side rail. */
export const PHONE_NO_NAV_ROUTES = new Set([
  "wizard",
  "reader",
  "chat-session",
  "social-chat",
  "learn-translator",
  "soulmate-setup",
  "soulmate-story",
  "soulmate-chat",
]);

/** On TV, only fullscreen immersive routes hide the L1 rail. */
export const TV_NO_NAV_ROUTES = new Set([
  "wizard",
]);

/**
 * Whether the L1 nav (bottom bar / TV side rail) should render.
 * TV keeps the rail on the news reader so living-room users always have exit.
 */
export function shouldShowL1Nav(routeName, tvMode = false) {
  if (!routeName) return true;
  const blocked = tvMode ? TV_NO_NAV_ROUTES : PHONE_NO_NAV_ROUTES;
  return !blocked.has(routeName);
}

/**
 * TV must never trap the user on a rewrite-only spinner.
 * Phone may still auto-await rewrite for a graded text.
 */
export function shouldBlockUiOnRewrite(tvMode = false) {
  return !tvMode;
}

/**
 * Whether news reader should show original body while rewrite is pending/running.
 */
export function shouldShowOriginalWhileRewriting(tvMode = false) {
  return Boolean(tvMode);
}

/** Achievement heat-map tracks exposed in the UI. */
export const ACHIEVEMENT_TRACKS_DEFAULT = ["readingAm", "news", "readingPm", "speaking"];
export const ACHIEVEMENT_TRACKS_TV = ["readingAm", "news", "readingPm"];

export function achievementTracksForMode(tvMode = false) {
  return tvMode ? [...ACHIEVEMENT_TRACKS_TV] : [...ACHIEVEMENT_TRACKS_DEFAULT];
}

export function isTvScrollKey(key) {
  return key === "PageUp" || key === "PageDown";
}

/**
 * Pixel delta for a scroll key (positive = down).
 */
export function scrollDeltaForKey(key, pageSize = 400) {
  const size = Math.max(80, Number(pageSize) || 400);
  if (key === "PageDown") return size;
  if (key === "PageUp") return -size;
  return 0;
}

/**
 * When arrow focus cannot move, scroll the nearest scrollable ancestor
 * (or the provided fallback) in that direction.
 */
export function scrollDeltaForArrowKey(key, step = 120) {
  const s = Math.max(40, Number(step) || 120);
  if (key === "ArrowDown") return s;
  if (key === "ArrowUp") return -s;
  return 0;
}

/**
 * Profile settings subtitle that matches TV-shipped capabilities
 * (no AI config section on TV).
 */
export function learnSettingsSubtitleKey(tvMode = false) {
  return tvMode ? "profile.learnSettingsSubTv" : "profile.learnSettingsSub";
}
