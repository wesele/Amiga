import { nextTick } from "vue";
import { isTvScrollKey, scrollDeltaForArrowKey, scrollDeltaForKey } from "@/shared/tvPolicy.js";

const FOCUSABLE_SELECTOR = [
  "button:not(:disabled)",
  "a[href]",
  "input:not(:disabled):not([type='hidden'])",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "[role='button']:not([aria-disabled='true'])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const DIRECTION_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

function isVisible(element) {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function focusableElements(root = document) {
  const overlays = Array.from(root.querySelectorAll?.(".modal-overlay") || []).filter(isVisible);
  const scope = overlays.at(-1) || root;
  return Array.from(scope.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isVisible);
}

function center(rect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function directionalDistance(from, to, key) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let primary;
  let cross;

  if (key === "ArrowRight") { primary = dx; cross = Math.abs(dy); }
  if (key === "ArrowLeft") { primary = -dx; cross = Math.abs(dy); }
  if (key === "ArrowDown") { primary = dy; cross = Math.abs(dx); }
  if (key === "ArrowUp") { primary = -dy; cross = Math.abs(dx); }
  if (primary <= 1) return Number.POSITIVE_INFINITY;

  // Prefer elements in the same row or column before considering diagonals.
  return primary + cross * 2.5;
}

export function findNextTvFocus(current, key, candidates = focusableElements()) {
  if (!current || !DIRECTION_KEYS.has(key)) return candidates[0] || null;
  const origin = center(current.getBoundingClientRect());
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate === current) continue;
    const score = directionalDistance(origin, center(candidate.getBoundingClientRect()), key);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function canScroll(el, deltaY) {
  if (!el) return false;
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 1) return false;
  if (deltaY > 0) return el.scrollTop < max - 1;
  if (deltaY < 0) return el.scrollTop > 0;
  return false;
}

/**
 * Find the nearest scrollable ancestor of `start` (or document scrolling
 * element) that can accept `deltaY` pixels of vertical scroll.
 */
export function findScrollableAncestor(start, deltaY, documentRef = document) {
  let node = start;
  while (node && node !== documentRef.documentElement) {
    if (node.nodeType === 1) {
      const style = window.getComputedStyle(node);
      const overflowY = style.overflowY;
      const scrollable = overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
      if (scrollable && canScroll(node, deltaY)) return node;
    }
    node = node.parentElement;
  }

  const candidates = [
    documentRef.querySelector?.(".app-content"),
    documentRef.scrollingElement,
    documentRef.documentElement,
    documentRef.body,
  ].filter(Boolean);

  for (const el of candidates) {
    if (canScroll(el, deltaY)) return el;
  }
  // Prefer app-content even if already at edge so callers can still try.
  return candidates[0] || null;
}

/**
 * Scroll page content by `deltaY` relative to the focused element.
 * Returns true when a scroll container was found and scroll was applied.
 */
export function scrollTvContent(deltaY, { activeElement, documentRef = document } = {}) {
  if (!deltaY) return false;
  const start = activeElement && activeElement !== documentRef.body
    ? activeElement
    : documentRef.querySelector?.(".app-content") || documentRef.body;
  const scroller = findScrollableAncestor(start, deltaY, documentRef);
  if (!scroller) return false;
  const before = scroller.scrollTop;
  scroller.scrollBy({ top: deltaY, left: 0, behavior: "smooth" });
  // Some environments apply scrollTop instantly without smooth; both are fine.
  if (scroller.scrollTop === before) {
    scroller.scrollTop = before + deltaY;
  }
  return true;
}

function focusElement(element) {
  if (!element) return false;
  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  return true;
}

export function installTvRemoteNavigation({ router, targetWindow = window } = {}) {
  if (!targetWindow?.document) return () => {};
  const documentRef = targetWindow.document;

  const focusFirst = (force = false) => nextTick(() => {
    const candidates = focusableElements(documentRef);
    if (force || !documentRef.activeElement || documentRef.activeElement === documentRef.body) {
      focusElement(candidates[0]);
    }
  });

  const onKeyDown = (event) => {
    if (isTvScrollKey(event.key)) {
      const pageSize = Math.round((targetWindow.innerHeight || 720) * 0.75);
      const delta = scrollDeltaForKey(event.key, pageSize);
      if (scrollTvContent(delta, { activeElement: documentRef.activeElement, documentRef })) {
        event.preventDefault();
      }
      return;
    }

    if (DIRECTION_KEYS.has(event.key)) {
      const candidates = focusableElements(documentRef);
      const next = findNextTvFocus(documentRef.activeElement, event.key, candidates);
      if (next) {
        event.preventDefault();
        focusElement(next);
        return;
      }
      // No further focus target: scroll long surfaces so remote still works.
      const delta = scrollDeltaForArrowKey(event.key);
      if (delta && scrollTvContent(delta, { activeElement: documentRef.activeElement, documentRef })) {
        event.preventDefault();
      }
      return;
    }

    if (["Escape", "BrowserBack", "GoBack"].includes(event.key)) {
      event.preventDefault();
      targetWindow.__amigaGoBack?.();
    }
  };

  documentRef.addEventListener("keydown", onKeyDown, true);
  const removeAfterEach = router?.afterEach?.(() => focusFirst(true));
  const observer = new MutationObserver(() => {
    const active = documentRef.activeElement;
    const modal = Array.from(documentRef.querySelectorAll(".modal-overlay")).filter(isVisible).at(-1);
    if (modal && !modal.contains(active)) focusFirst(true);
  });
  observer.observe(documentRef.body, { childList: true, subtree: true });
  focusFirst();

  return () => {
    documentRef.removeEventListener("keydown", onKeyDown, true);
    observer.disconnect();
    removeAfterEach?.();
  };
}
