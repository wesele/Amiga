/** DOM id for a path section node used by scroll-into-view. */
export function currentSectionDomId(section) {
  return section?.id ? `path-node-${section.id}` : null;
}

/** Whether the floating jump-to-current entry should show. */
export function shouldShowJumpToCurrent({
  hasCurrent = false,
  currentVisible = true,
  curriculumActive = true,
} = {}) {
  return curriculumActive && hasCurrent && !currentVisible;
}

/**
 * Whether `el` is sufficiently visible inside a scrollable parent.
 * @param {number} threshold - minimum visible height ratio (0–1)
 */
export function isElementVisibleInScrollParent(el, scrollParent, { threshold = 0.35 } = {}) {
  if (!el || !scrollParent) return false;
  const elRect = el.getBoundingClientRect();
  const parentRect = scrollParent.getBoundingClientRect();
  const visibleTop = Math.max(elRect.top, parentRect.top);
  const visibleBottom = Math.min(elRect.bottom, parentRect.bottom);
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);
  const elHeight = elRect.height || 1;
  return visibleHeight / elHeight >= threshold;
}

export const PATH_FOCUS_QUERY = "current";

/** Route to path map with intent to scroll to the current section. */
export function pathRouteWithCurrentFocus() {
  return { name: "path", query: { focus: PATH_FOCUS_QUERY } };
}