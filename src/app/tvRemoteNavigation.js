import { nextTick } from "vue";
import { isTvScrollKey, scrollDeltaForArrowKey, scrollDeltaForKey } from "@/shared/tvPolicy.js";

// Header/page back controls are remote-Back only — never enter the D-pad focus graph.
// Links with tabindex=-1 (e.g. news source URLs on TV) must stay out of D-pad focus.
const FOCUSABLE_SELECTOR = [
  "button:not(:disabled):not([tabindex='-1']):not(.back-btn):not(.close-btn)",
  "a[href]:not([tabindex='-1']):not(.back-btn):not(.card-source):not(.header-source)",
  "input:not(:disabled):not([type='hidden']):not([tabindex='-1'])",
  "select:not(:disabled):not([tabindex='-1'])",
  "textarea:not(:disabled):not([tabindex='-1'])",
  "[role='button']:not([aria-disabled='true']):not([tabindex='-1']):not(.back-btn):not(.close-btn)",
  "[tabindex]:not([tabindex='-1']):not(.back-btn):not(.close-btn)",
].join(",");

const DIRECTION_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const TV_OVERLAY_SELECTOR = [
  ".modal-overlay",
  ".confirm-overlay",
  ".popup-overlay",
  ".sel-overlay",
  ".level-overlay",
  ".restore-overlay",
].join(", ");

/** True for UI back/close chrome that must never take D-pad focus on TV. */
export function isTvRemoteBackControl(element) {
  if (!element?.classList) return false;
  return element.classList.contains("back-btn") || element.classList.contains("close-btn");
}

function isVisible(element) {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * TV focus regions: left L1 rail (nav) vs main content pane.
 * Up/Down stay inside one region; Left/Right cross between them.
 */
export function getTvFocusRegion(element) {
  if (!element || element === element?.ownerDocument?.body) return null;
  if (element.closest?.("nav.bottom-nav, .bottom-nav")) return "nav";
  return "content";
}

export function isTvNavItem(element) {
  return Boolean(
    element?.classList?.contains("nav-item") && element.closest?.("nav.bottom-nav, .bottom-nav"),
  );
}

export function focusableElements(root = document) {
  // Only the top visible layer participates in the focus graph. This includes
  // shared confirm dialogs and the first-launch restore layer, not only modals.
  const overlays = visibleTvOverlays(root);
  const scope = overlays.at(-1) || root;
  return Array.from(scope.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => isVisible(el) && !isTvRemoteBackControl(el),
  );
}

export function visibleTvOverlays(root = document) {
  return Array.from(root.querySelectorAll?.(TV_OVERLAY_SELECTOR) || []).filter(isVisible);
}

/** Text/range controls own horizontal arrows while the user edits a value. */
export function shouldYieldTvDirectionToControl(element, key) {
  if (!element || (key !== "ArrowLeft" && key !== "ArrowRight")) return false;
  if (element.matches?.("textarea, select")) return true;
  if (!element.matches?.("input")) return false;
  const type = String(element.getAttribute?.("type") || "text").toLowerCase();
  return !new Set([
    "button", "checkbox", "color", "file", "hidden", "image", "radio", "reset", "submit",
  ]).has(type);
}

function center(rect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Anchor used for spatial scoring.
 * Vertical moves bias to the left edge so full-width rows (e.g. Settings
 * "News count") prefer the leftmost control above/below (Beginner A1),
 * not a right-side peer that happens to be closer to the geometric center.
 */
export function focusAnchor(element, key, options = {}) {
  const rect = element.getBoundingClientRect();
  const lastX = options.lastX;
  if (key === "ArrowUp" || key === "ArrowDown") {
    let x = rect.left + Math.min(20, Math.max(0, rect.width * 0.12));
    if (typeof lastX === "number" && lastX >= rect.left && lastX <= rect.right) {
      x = lastX;
    }
    return {
      x,
      y: rect.top + rect.height / 2,
    };
  }
  return center(rect);
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

/**
 * True when two elements share a visual row (horizontal peers).
 * Used so Left/Right stay on language pills and never jump down to level pills.
 */
export function isSameTvRow(a, b) {
  if (!a || !b) return false;
  const ra = a.getBoundingClientRect();
  const rb = b.getBoundingClientRect();
  const ay = ra.top + ra.height / 2;
  const by = rb.top + rb.height / 2;
  // Allow a bit of wrap misalignment; still tighter than a full section gap.
  const tol = Math.max(20, Math.min(ra.height, rb.height) * 0.55);
  return Math.abs(ay - by) <= tol;
}

/** Article body words (news / daily reading) — navigated in reading order. */
export function isArticleWord(element) {
  return Boolean(element?.classList?.contains("word"));
}

/** Bilingual translation block under each original paragraph. */
export function isBilingualTranslation(element) {
  return Boolean(element?.classList?.contains("para-translation"));
}

/**
 * Full-width quiz/test choices (reading test, path lesson).
 * Left must not dump into the L1 rail mid-question — remote Back / bottom Prev leaves.
 */
export function isTvQuizChoice(element) {
  if (!element?.classList) return false;
  return (
    element.classList.contains("option-btn")
    || element.classList.contains("audio-btn")
    || element.classList.contains("match-item")
  );
}

/** Word tokens + translation paragraphs — vertical reading stream on TV. */
export function isArticleReadingTarget(element) {
  return isArticleWord(element) || isBilingualTranslation(element);
}

function sortByDocumentOrder(elements) {
  return [...elements].sort((a, b) => {
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
}

function pickByDirection(current, key, candidates, options = {}) {
  if (!current || !candidates.length) return null;
  const origin = focusAnchor(current, key, options);
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate === current) continue;
    const score = directionalDistance(origin, focusAnchor(candidate, key, options), key);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/** Closest candidate by vertical center distance (for pane-crossing L/R). */
function pickClosestVertically(current, candidates) {
  if (!candidates.length) return null;
  if (!current) return candidates[0];
  const originY = center(current.getBoundingClientRect()).y;
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const dy = Math.abs(center(candidate.getBoundingClientRect()).y - originY);
    if (dy < bestScore) {
      best = candidate;
      bestScore = dy;
    }
  }
  return best;
}

/** Next/prev article word in DOM order (line wrap friendly). */
export function pickWordByReadingOrder(current, key, candidates) {
  if (!isArticleWord(current)) return null;
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;
  const words = sortByDocumentOrder(candidates.filter(isArticleWord));
  const idx = words.indexOf(current);
  if (idx < 0) return null;
  if (key === "ArrowRight") return words[idx + 1] || null;
  return words[idx - 1] || null;
}

/**
 * Spatial Up/Down among article words + translation blocks.
 * Moves by visual line (skip same-line peers), keeping column when possible —
 * not one-by-one document order through every word.
 */
export function pickArticleTargetByLine(current, key, candidates) {
  if (!isArticleReadingTarget(current)) return null;
  if (key !== "ArrowUp" && key !== "ArrowDown") return null;

  const pool = candidates.filter(isArticleReadingTarget);
  if (!pool.length) return null;

  const cur = current.getBoundingClientRect();
  const originX = cur.left + cur.width / 2;
  const originY = cur.top + cur.height / 2;
  // Same visual line: similar vertical center (word height band).
  const lineTol = Math.max(10, cur.height * 0.65);

  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of pool) {
    if (candidate === current) continue;
    const rect = candidate.getBoundingClientRect();
    const cy = rect.top + rect.height / 2;
    const dy = cy - originY;
    const primary = key === "ArrowDown" ? dy : -dy;
    // Must be clearly below / above (different line), not a same-line neighbor.
    if (primary <= lineTol * 0.45) continue;

    let cx = rect.left + rect.width / 2;
    let cross = Math.abs(cx - originX);
    // Full-width translation: if current column falls inside the block, perfect match.
    if (isBilingualTranslation(candidate)) {
      if (originX >= rect.left && originX <= rect.right) cross = 0;
      else {
        cross = Math.min(
          Math.abs(originX - rect.left),
          Math.abs(originX - rect.right),
        );
      }
    }

    // Prefer nearest line first, then nearest column (text-cursor style).
    const score = primary + cross * 0.45;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/**
 * Region-aware TV spatial navigation:
 * - ArrowUp / ArrowDown: same pane; left-edge bias (not center/right)
 * - ArrowLeft/Right within content: same visual row (pills/tiles)
 * - Article .word: Left/Right follow reading order; never jump to L1 nav
 * - Article words + .para-translation: Up/Down by visual line (column-stable)
 * - ArrowLeft at left edge of non-word content → L1 nav
 * - ArrowRight from nav → nearest content focusable
 */
export function findNextTvFocus(current, key, candidates = focusableElements(), options = {}) {
  if (!current || !DIRECTION_KEYS.has(key)) return candidates[0] || null;

  // Never land D-pad focus on page-back chrome (remote Back key owns that).
  candidates = candidates.filter((c) => !isTvRemoteBackControl(c));
  if (!candidates.length) return null;

  const region = getTvFocusRegion(current);
  const navCandidates = candidates.filter((c) => getTvFocusRegion(c) === "nav");
  const contentCandidates = candidates.filter((c) => getTvFocusRegion(c) === "content");
  // Horizontal peers only (e.g. CN | EN | ES, not CN → B1 below).
  const sameRowContent = contentCandidates.filter((c) => c === current || isSameTvRow(current, c));

  // Body words + bilingual translations: Up/Down by visual line (not word-by-word order).
  if (isArticleReadingTarget(current) && (key === "ArrowUp" || key === "ArrowDown")) {
    const nextLine = pickArticleTargetByLine(current, key, contentCandidates);
    if (nextLine) return nextLine;
    // Past first/last reading line: allow spatial move (e.g. Down → mode bar).
    const samePane = candidates.filter((c) => getTvFocusRegion(c) === region);
    return pickByDirection(current, key, samePane, options);
  }

  if (key === "ArrowUp" || key === "ArrowDown") {
    const samePane = candidates.filter((c) => getTvFocusRegion(c) === region);
    return pickByDirection(current, key, samePane, options);
  }

  // Body words: sequential reading order (wraps across lines).
  if (isArticleWord(current) && (key === "ArrowLeft" || key === "ArrowRight")) {
    const nextWord = pickWordByReadingOrder(current, key, contentCandidates);
    if (nextWord) return nextWord;
    // First/last word: stay put (do not dump into L1 rail mid-article).
    return null;
  }

  // On a translation block: Left stays in content (do not dump to rail mid-article).
  if (isBilingualTranslation(current) && (key === "ArrowLeft" || key === "ArrowRight")) {
    return null;
  }

  if (key === "ArrowLeft") {
    if (region === "content") {
      // Same-row left only (Reading → News, EN → CN). Never jump to a row above.
      const within = pickByDirection(current, key, sameRowContent, options);
      if (within) return within;
      // Quiz / test choices are full-width stacked rows: Left must not dump into
      // the L1 rail mid-question (remote Back or bottom Prev leaves the quiz).
      if (isTvQuizChoice(current)) {
        return null;
      }
      // Left edge of this row → L1 rail (active tab when possible).
      if (navCandidates.length) {
        const activeNav = navCandidates.find((c) => c.classList?.contains("active"));
        return activeNav || pickClosestVertically(current, navCandidates);
      }
      return null;
    }
    // Already on nav — stay in rail (no pane to the left).
    return pickByDirection(current, key, navCandidates, options);
  }

  if (key === "ArrowRight") {
    if (region === "nav") {
      // Right from rail always enters content.
      return (
        pickClosestVertically(current, contentCandidates)
        || pickByDirection(current, key, contentCandidates, options)
      );
    }
    // Same-row right only. Rightmost pill / full-width row → no move (not next section).
    return pickByDirection(current, key, sameRowContent, options);
  }

  return pickByDirection(current, key, candidates, options);
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
  // Never scroll when focus is on the L1 nav rail.
  if (getTvFocusRegion(activeElement) === "nav") return false;
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

/**
 * @param {Element} element
 * @param {{ activateNav?: boolean }} [options]
 *   activateNav: when true, focusing a L1 nav item immediately switches the tab
 *   (no Enter/OK needed). Used for Up/Down on the rail, not for focusFirst.
 */
export function focusElement(element, { activateNav = false } = {}) {
  if (!element) return false;
  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  if (activateNav && isTvNavItem(element) && !element.classList.contains("active")) {
    element.click();
  }
  return true;
}

/**
 * Prefer in-pane content over the L1 rail.
 * Used after route changes so readers/lists never open stuck on the sidebar.
 * Order: explicit preferred → reply options (TV chat) → article words → first content.
 */
export function pickPreferredContentFocus(candidates = []) {
  const content = candidates.filter((c) => getTvFocusRegion(c) === "content");
  if (!content.length) return null;
  const nonDeferred = content.filter((c) => !c.hasAttribute?.("data-tv-defer-focus"));
  return (
    content.find((c) => c.hasAttribute?.("data-tv-preferred-focus"))
    || content.find((c) => c.classList?.contains("reply-option"))
    || content.find((c) => c.classList?.contains("option-btn"))
    || content.find((c) => c.classList?.contains("audio-btn"))
    || content.find((c) => c.classList?.contains("story-action"))
    || content.find((c) => c.classList?.contains("result-btn"))
    || content.find((c) => c.classList?.contains("article-card"))
    || content.find((c) => c.classList?.contains("path-node"))
    || content.find((c) => c.classList?.contains("level-card"))
    || content.find((c) => c.classList?.contains("prompt-card"))
    || content.find((c) => isArticleWord(c))
    || nonDeferred[0]
    || null
  );
}

/** Build a stable-enough bookmark for restoring focus after route round-trips. */
export function createTvFocusBookmark(element, candidates = []) {
  if (!element || getTvFocusRegion(element) !== "content") return null;
  const content = candidates.filter((candidate) => getTvFocusRegion(candidate) === "content");
  const index = content.indexOf(element);
  if (index < 0) return null;
  const key =
    element.getAttribute?.("data-tv-focus-key")
    || element.id
    || element.getAttribute?.("data-level")
    || element.getAttribute?.("data-article-id")
    || element.getAttribute?.("data-node-id")
    || element.getAttribute?.("name")
    || "";
  return { key, index };
}

/** Resolve a route bookmark against the newly-mounted page DOM. */
export function resolveTvFocusBookmark(bookmark, candidates = []) {
  if (!bookmark) return null;
  const content = candidates.filter((candidate) => getTvFocusRegion(candidate) === "content");
  if (bookmark.key) {
    const keyed = content.find((candidate) => {
      const keys = [
        candidate.getAttribute?.("data-tv-focus-key"),
        candidate.id,
        candidate.getAttribute?.("data-level"),
        candidate.getAttribute?.("data-article-id"),
        candidate.getAttribute?.("data-node-id"),
        candidate.getAttribute?.("name"),
      ];
      return keys.includes(bookmark.key);
    });
    if (keyed) return keyed;
  }
  return content[bookmark.index] || null;
}

/**
 * Pure policy for where TV focus should go after a route change / focus reset.
 * - keepNavFocus: only after explicit L1 rail tab activation (Up/Down on rail)
 * - never fall back to the rail just because content is still loading
 * - if focus accidentally landed on the rail after a content navigation, reclaim content
 *
 * @returns {{ kind: 'nav'|'content'|'retry'|'none', element?: Element|null }}
 */
export function resolveInitialTvFocus({
  candidates = [],
  active = null,
  force = false,
  keepNavFocus = false,
  body = null,
  restored = null,
} = {}) {
  if (force && keepNavFocus) {
    const activeNav = candidates.find(
      (c) => isTvNavItem(c) && c.classList.contains("active"),
    );
    if (activeNav) return { kind: "nav", element: activeNav };
  }

  const contentFirst = restored || pickPreferredContentFocus(candidates);
  const stuckOnNav = Boolean(active && getTvFocusRegion(active) === "nav");
  const activeIsUsable = Boolean(active && candidates.includes(active));
  const needsContentFocus =
    force
    || !active
    || (body && active === body)
    || stuckOnNav
    || !activeIsUsable;

  if (needsContentFocus && contentFirst) {
    return { kind: "content", element: contentFirst };
  }
  // Content page still mounting (reader spinner, async article) — retry shortly.
  if (force && !contentFirst) {
    return { kind: "retry", element: null };
  }
  return { kind: "none", element: null };
}

export function installTvRemoteNavigation({ router, targetWindow = window } = {}) {
  if (!targetWindow?.document) return () => {};
  const documentRef = targetWindow.document;
  /** After Up/Down activates a L1 tab, keep focus on the rail across route swap. */
  let keepNavFocus = false;
  let contentFocusRetryTimer = null;
  let contentFocusRetryAttempts = 0;
  let lastContentFocusX = null;
  const routeFocusMemory = new Map();
  let lastOverlay = null;
  let focusBeforeOverlay = null;
  let routeTransitionBookmark = null;
  let routeTransitionFocusPending = false;

  const routeKey = (route) => {
    if (!route?.name) return route?.fullPath || "";
    return `${String(route.name)}:${JSON.stringify(route.params || {})}`;
  };

  function rememberRouteFocus(route) {
    if (!route || visibleTvOverlays(documentRef).length) return;
    const candidates = focusableElements(documentRef);
    const bookmark = createTvFocusBookmark(documentRef.activeElement, candidates);
    if (bookmark) routeFocusMemory.set(routeKey(route), bookmark);
  }

  function clearContentFocusRetry() {
    if (contentFocusRetryTimer != null) {
      targetWindow.clearTimeout?.(contentFocusRetryTimer);
      contentFocusRetryTimer = null;
    }
    contentFocusRetryAttempts = 0;
  }

  /** Retry until content focusables appear (readers, slow LLM option lists). */
  function scheduleContentFocusRetry(bookmark = null) {
    clearContentFocusRetry();
    const tick = () => {
      contentFocusRetryAttempts += 1;
      if (keepNavFocus) {
        clearContentFocusRetry();
        return;
      }
      const active = documentRef.activeElement;
      const stuck =
        !active
        || active === documentRef.body
        || getTvFocusRegion(active) === "nav"
        || !active.isConnected;
      const candidates = focusableElements(documentRef);
      const restored = resolveTvFocusBookmark(bookmark, candidates);
      const preferred = restored || pickPreferredContentFocus(candidates);
      // Returning lists may mount their controls after an async fetch. Wait for
      // the remembered item instead of briefly focusing an unrelated header action.
      if (bookmark && !restored && contentFocusRetryAttempts < 120) {
        contentFocusRetryTimer = targetWindow.setTimeout?.(tick, 50) ?? null;
        return;
      }
      // Prefer reply options / marked targets even if focus already sat on something weak.
      if (preferred?.classList?.contains("reply-option") || preferred?.hasAttribute?.("data-tv-preferred-focus")) {
        if (stuck || active !== preferred) {
          focusElement(preferred, { activateNav: false });
        }
        routeTransitionFocusPending = false;
        clearContentFocusRetry();
        return;
      }
      if (!stuck) {
        clearContentFocusRetry();
        return;
      }
      if (preferred) {
        focusElement(preferred, { activateNav: false });
        routeTransitionFocusPending = false;
        clearContentFocusRetry();
        return;
      }
      // ~6s for LLM-backed UI (soulmate options); do not dump onto L1 rail.
      if (contentFocusRetryAttempts < 120) {
        contentFocusRetryTimer = targetWindow.setTimeout?.(tick, 50) ?? null;
      } else {
        clearContentFocusRetry();
      }
    };
    contentFocusRetryTimer = targetWindow.setTimeout?.(tick, 50) ?? null;
  }

  const focusFirst = (force = false, bookmark = null) => nextTick(() => {
    const candidates = focusableElements(documentRef);
    const active = documentRef.activeElement;
    const restored = resolveTvFocusBookmark(bookmark, candidates);
    if (force && bookmark && !restored) {
      scheduleContentFocusRetry(bookmark);
      return;
    }
    const decision = resolveInitialTvFocus({
      candidates,
      active,
      force,
      keepNavFocus,
      body: documentRef.body,
      restored,
    });

    if (decision.kind === "nav") {
      keepNavFocus = false;
      decision.element?.focus?.({ preventScroll: true });
      routeTransitionFocusPending = false;
      return;
    }

    if (decision.kind === "content") {
      keepNavFocus = false;
      focusElement(decision.element, { activateNav: false });
      lastContentFocusX = center(decision.element.getBoundingClientRect()).x;
      routeTransitionFocusPending = false;
      return;
    }

    if (decision.kind === "retry") {
      keepNavFocus = false;
      scheduleContentFocusRetry(bookmark);
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
      if (event.isComposing || shouldYieldTvDirectionToControl(documentRef.activeElement, event.key)) {
        return;
      }
      const candidates = focusableElements(documentRef);
      // A blocking/loading overlay with no actions must not leak navigation or
      // scrolling into the obscured page underneath it.
      if (!candidates.length && visibleTvOverlays(documentRef).length) {
        event.preventDefault();
        return;
      }
      if (lastContentFocusX === null && documentRef.activeElement) {
        lastContentFocusX = center(documentRef.activeElement.getBoundingClientRect()).x;
      }
      
      const next = findNextTvFocus(documentRef.activeElement, event.key, candidates, { lastX: lastContentFocusX });
      if (next) {
        event.preventDefault();
        
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          lastContentFocusX = center(next.getBoundingClientRect()).x;
        }
        
        // Focusing a L1 rail item activates that tab immediately (no Enter).
        const activateNav = isTvNavItem(next);
        if (activateNav && !next.classList.contains("active")) {
          keepNavFocus = true;
        }
        focusElement(next, { activateNav });
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
  const removeBeforeEach = router?.beforeEach?.((to, from) => {
    if (routeKey(to) !== routeKey(from)) rememberRouteFocus(from);
    return true;
  });
  const removeAfterEach = router?.afterEach?.((to) => {
    routeTransitionBookmark = routeFocusMemory.get(routeKey(to)) || null;
    routeTransitionFocusPending = true;
    focusFirst(true, routeTransitionBookmark);
  });
  const observer = new MutationObserver(() => {
    const active = documentRef.activeElement;
    const modal = visibleTvOverlays(documentRef).at(-1) || null;

    if (modal && !lastOverlay) {
      focusBeforeOverlay = active && active !== documentRef.body ? active : null;
      lastOverlay = modal;
      focusFirst(true);
      return;
    }
    if (!modal && lastOverlay) {
      lastOverlay = null;
      const returnTarget = focusBeforeOverlay;
      focusBeforeOverlay = null;
      const candidates = focusableElements(documentRef);
      if (returnTarget?.isConnected && candidates.includes(returnTarget)) {
        focusElement(returnTarget);
      } else {
        focusFirst(true, routeFocusMemory.get(routeKey(router?.currentRoute?.value)) || null);
      }
      return;
    }
    if (modal && modal !== lastOverlay) {
      lastOverlay = modal;
      focusFirst(true);
      return;
    }
    if (modal) {
      const modalCandidates = focusableElements(documentRef);
      if (!modal.contains(active) || !modalCandidates.includes(active)) focusFirst(true);
      return;
    }

    // Page-local state changes replace controls without changing routes (wizard
    // steps, quiz questions, vocab drill-down). Reclaim focus only when the old
    // target actually disappeared/disabled; never yank a valid rail selection.
    const candidates = focusableElements(documentRef);
    if (!active || active === documentRef.body || !active.isConnected || !candidates.includes(active)) {
      focusFirst(true, routeTransitionFocusPending ? routeTransitionBookmark : null);
    }
  });
  observer.observe(documentRef.body, { childList: true, subtree: true });
  focusFirst();

  return () => {
    documentRef.removeEventListener("keydown", onKeyDown, true);
    observer.disconnect();
    removeBeforeEach?.();
    removeAfterEach?.();
    clearContentFocusRetry();
  };
}
