export const APP_MODE_TV = "tv";
export const APP_MODE_DEFAULT = "default";

const MOBILE_USER_AGENT = /Android.*Mobile|iPhone|iPod|IEMobile|Windows Phone|BlackBerry|webOS|Opera Mini|\bMobi\b/i;

export function resolveAppMode(env = import.meta.env) {
  return env?.VITE_AMIGA_TV === "1" ? APP_MODE_TV : APP_MODE_DEFAULT;
}

/**
 * Detect a phone-class browser without treating a narrow desktop window as a
 * phone. User-Agent Client Hints and classic mobile UAs cover normal phones;
 * the touch/screen fallback covers privacy-reduced embedded browsers.
 */
export function resolveMobileBrowser({
  userAgentDataMobile,
  userAgent = "",
  maxTouchPoints = 0,
  screenWidth = Number.POSITIVE_INFINITY,
  viewportWidth = Number.POSITIVE_INFINITY,
} = {}) {
  if (userAgentDataMobile === true || MOBILE_USER_AGENT.test(userAgent)) return true;

  const availableWidth = Math.min(
    Number(screenWidth) || Number.POSITIVE_INFINITY,
    Number(viewportWidth) || Number.POSITIVE_INFINITY,
  );
  return Number(maxTouchPoints) > 0 && availableWidth <= 600;
}

export function resolveLayoutMode({ featureMode, webMode = false, mobileBrowser = false } = {}) {
  return featureMode === APP_MODE_TV && !(webMode && mobileBrowser)
    ? APP_MODE_TV
    : APP_MODE_DEFAULT;
}

export function resolveMobileWebMode({ webMode = false, forcePhone = false, signals = {} } = {}) {
  return Boolean(webMode && (forcePhone || resolveMobileBrowser(signals)));
}

function browserSignals() {
  if (typeof navigator === "undefined") return {};
  return {
    userAgentDataMobile: navigator.userAgentData?.mobile,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    screenWidth: typeof screen === "undefined" ? undefined : screen.width,
    viewportWidth: typeof window === "undefined" ? undefined : window.innerWidth,
  };
}

export const appMode = resolveAppMode();
export const isTvMode = appMode === APP_MODE_TV;
export const isWebMode = import.meta.env.VITE_AMIGA_WEB === "1";
export const isMobileWebMode = resolveMobileWebMode({
  webMode: isWebMode,
  forcePhone: import.meta.env.VITE_AMIGA_WEB_PHONE === "1",
  signals: browserSignals(),
});
export const layoutMode = resolveLayoutMode({
  featureMode: appMode,
  webMode: isWebMode,
  mobileBrowser: isMobileWebMode,
});
export const isTvLayoutMode = layoutMode === APP_MODE_TV;

export function applyAppMode(root = document.documentElement) {
  if (!root) return;
  root.dataset.appMode = layoutMode;
  root.dataset.appFeatureMode = appMode;
}
