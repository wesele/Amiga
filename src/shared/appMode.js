export const APP_MODE_TV = "tv";
export const APP_MODE_DEFAULT = "default";

export function resolveAppMode(env = import.meta.env) {
  return env?.VITE_AMIGA_TV === "1" ? APP_MODE_TV : APP_MODE_DEFAULT;
}

export const appMode = resolveAppMode();
export const isTvMode = appMode === APP_MODE_TV;

export function applyAppMode(root = document.documentElement) {
  if (root) root.dataset.appMode = appMode;
}
