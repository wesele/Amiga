export async function applyQueryLocale({
  targetWindow = typeof window === "undefined" ? null : window,
  setLocale,
} = {}) {
  if (!targetWindow || typeof setLocale !== "function") return;

  const params = new URLSearchParams(targetWindow.location?.search || "");
  const queryLocale = params.get("locale");
  if (queryLocale) {
    setLocale(queryLocale, { persist: false });
  }
}
