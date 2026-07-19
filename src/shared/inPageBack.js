/**
 * Stack an in-page back handler for Android system back / TV Escape.
 *
 * The native bridge (`window.__amigaGoBack` in androidBridge.js) calls
 * `window.__amigaGoBackInPage` first. Returning `"navigated"` or
 * `"at-root"` consumes the press; anything else falls through to the
 * previous in-page handler (if any), then to route-parent navigation.
 *
 * @param {() => ("navigated" | "at-root" | null | undefined | void)} handler
 * @param {{ targetWindow?: Window | null }} [options]
 * @returns {() => void} release — call on unmount to restore the previous handler
 */
export function pushInPageBackHandler(handler, options = {}) {
  const targetWindow =
    options.targetWindow ?? (typeof window === "undefined" ? null : window);
  if (!targetWindow || typeof handler !== "function") {
    return () => {};
  }

  const previous = targetWindow.__amigaGoBackInPage;
  const wrapped = () => {
    const result = handler();
    if (result === "navigated" || result === "at-root") return result;
    if (typeof previous === "function") return previous();
    return null;
  };

  targetWindow.__amigaGoBackInPage = wrapped;

  return () => {
    if (targetWindow.__amigaGoBackInPage === wrapped) {
      if (typeof previous === "function") {
        targetWindow.__amigaGoBackInPage = previous;
      } else {
        delete targetWindow.__amigaGoBackInPage;
      }
    }
  };
}
