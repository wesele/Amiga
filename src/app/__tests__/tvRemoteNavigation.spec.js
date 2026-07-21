import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  findNextTvFocus,
  findScrollableAncestor,
  focusableElements,
  focusElement,
  getTvFocusRegion,
  isArticleWord,
  isBilingualTranslation,
  isSameTvRow,
  isTvNavItem,
  isTvQuizChoice,
  isTvRemoteBackControl,
  installTvRemoteNavigation,
  pickArticleTargetByLine,
  pickPreferredContentFocus,
  pickWordByReadingOrder,
  createTvFocusBookmark,
  resolveInitialTvFocus,
  resolveTvFocusBookmark,
  scrollTvContent,
  shouldYieldTvDirectionToControl,
} from "../tvRemoteNavigation.js";
import { isTvScrollKey, scrollDeltaForKey } from "@/shared/tvPolicy.js";

function elementAt(left, top, width = 100, height = 60, { className = "", parentClass = "", tag = "button" } = {}) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.getBoundingClientRect = () => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  });
  if (parentClass) {
    const parent = document.createElement(parentClass === "bottom-nav" ? "nav" : "div");
    parent.className = parentClass;
    parent.appendChild(element);
    document.body.appendChild(parent);
  } else {
    document.body.appendChild(element);
  }
  return element;
}

describe("TV remote navigation", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("selects the nearest candidate in the requested direction", () => {
    const current = elementAt(200, 200);
    const left = elementAt(40, 200);
    const right = elementAt(360, 200);
    const diagonal = elementAt(320, 360);
    const candidates = [current, left, right, diagonal];

    expect(findNextTvFocus(current, "ArrowLeft", candidates)).toBe(left);
    expect(findNextTvFocus(current, "ArrowRight", candidates)).toBe(right);
    expect(findNextTvFocus(current, "ArrowDown", candidates)).toBe(diagonal);
  });

  it("keeps Up/Down inside nav or content panes (no cross-pane vertical jumps)", () => {
    const learn = elementAt(20, 40, 180, 56, { className: "nav-item active", parentClass: "bottom-nav" });
    const achievements = elementAt(20, 120, 180, 56, { className: "nav-item", parentClass: "bottom-nav" });
    // Re-parent achievements into the same nav (elementAt creates its own parent)
    const nav = learn.parentElement;
    nav.appendChild(achievements);
    achievements.parentElement?.remove();

    const pathCard = elementAt(280, 80, 400, 100);
    const news = elementAt(280, 220, 180, 100);
    const reading = elementAt(500, 220, 180, 100);
    const candidates = [learn, achievements, pathCard, news, reading];

    expect(getTvFocusRegion(learn)).toBe("nav");
    expect(getTvFocusRegion(news)).toBe("content");

    // Vertical on nav stays on nav
    expect(findNextTvFocus(learn, "ArrowDown", candidates)).toBe(achievements);
    expect(findNextTvFocus(achievements, "ArrowUp", candidates)).toBe(learn);
    // Must not jump to content path card which is vertically "between" in y but wrong pane
    expect(findNextTvFocus(learn, "ArrowDown", candidates)).not.toBe(pathCard);

    // Vertical on content stays on content
    expect(findNextTvFocus(pathCard, "ArrowDown", candidates)).toBe(news);
    expect(findNextTvFocus(news, "ArrowUp", candidates)).toBe(pathCard);
    expect(findNextTvFocus(pathCard, "ArrowDown", candidates)).not.toBe(achievements);
  });

  it("crosses panes only with Left/Right keys", () => {
    const learn = elementAt(20, 40, 180, 56, { className: "nav-item active", parentClass: "bottom-nav" });
    const achievements = elementAt(20, 120, 180, 56, { className: "nav-item", parentClass: "bottom-nav" });
    const nav = learn.parentElement;
    nav.appendChild(achievements);
    achievements.parentElement?.remove();

    const news = elementAt(280, 220, 180, 100);
    const reading = elementAt(500, 220, 180, 100);
    const candidates = [learn, achievements, news, reading];

    // Right from nav → content
    expect(findNextTvFocus(learn, "ArrowRight", candidates)).toBe(news);
    // Left edge of content → active nav
    expect(findNextTvFocus(news, "ArrowLeft", candidates)).toBe(learn);
    // Horizontal within content still works (Reading → News before leaving pane)
    expect(findNextTvFocus(news, "ArrowRight", candidates)).toBe(reading);
    expect(findNextTvFocus(reading, "ArrowLeft", candidates)).toBe(news);
    // From Reading, one more Left after News would hit nav — already covered above
  });

  it("keeps Left/Right on the same visual row (no Settings language → level jump)", () => {
    // Settings-like layout: language pills on one row, CEFR levels on the next.
    const zh = elementAt(260, 100, 120, 44);
    const en = elementAt(400, 100, 120, 44);
    const es = elementAt(540, 100, 120, 44); // rightmost language
    const a1 = elementAt(260, 200, 100, 44);
    const b1 = elementAt(480, 200, 140, 44); // geometrically "to the right" of es if y ignored
    const candidates = [zh, en, es, a1, b1];

    expect(isSameTvRow(zh, en)).toBe(true);
    expect(isSameTvRow(es, b1)).toBe(false);

    expect(findNextTvFocus(zh, "ArrowRight", candidates)).toBe(en);
    expect(findNextTvFocus(en, "ArrowRight", candidates)).toBe(es);
    // Rightmost language: Right must NOT jump to Intermediate B1
    expect(findNextTvFocus(es, "ArrowRight", candidates)).toBeNull();
    // Down still reaches the level row
    expect(findNextTvFocus(es, "ArrowDown", candidates)).toBe(b1);
    // Levels move horizontally among themselves
    expect(findNextTvFocus(a1, "ArrowRight", candidates)).toBe(b1);
    expect(findNextTvFocus(b1, "ArrowLeft", candidates)).toBe(a1);
    // Rightmost level: no further right peer
    expect(findNextTvFocus(b1, "ArrowRight", candidates)).toBeNull();
  });

  it("prefers left-aligned targets when moving Up/Down (News count → A1, not B1)", () => {
    // Full-width settings row (News count) sits below a CEFR pill row.
    const a1 = elementAt(260, 200, 100, 44); // Beginner A1 (left)
    const b1 = elementAt(520, 200, 140, 44); // Intermediate B1 (right)
    const newsCount = elementAt(240, 320, 600, 56); // full-width row
    const candidates = [a1, b1, newsCount];

    // From full-width row, Up should land on left-aligned A1 (left-edge anchor),
    // not B1 which is closer to the geometric center.
    expect(findNextTvFocus(newsCount, "ArrowUp", candidates)).toBe(a1);
    expect(findNextTvFocus(a1, "ArrowDown", candidates)).toBe(newsCount);
  });

  it("moves article words by visual line on Up/Down, reading order on Left/Right", () => {
    const learn = elementAt(20, 40, 180, 56, { className: "nav-item active", parentClass: "bottom-nav" });
    // Line 1: w1 w2   Line 2: w3 (under w1)
    const w1 = elementAt(280, 120, 40, 24, { className: "word", tag: "span" });
    const w2 = elementAt(330, 120, 40, 24, { className: "word", tag: "span" });
    const w3 = elementAt(280, 160, 40, 24, { className: "word", tag: "span" });
    w1.tabIndex = 0;
    w2.tabIndex = 0;
    w3.tabIndex = 0;
    const candidates = [learn, w1, w2, w3];

    expect(isArticleWord(w1)).toBe(true);
    // Left/Right: sequential reading order on the line / wrap
    expect(pickWordByReadingOrder(w1, "ArrowRight", candidates)).toBe(w2);
    expect(findNextTvFocus(w1, "ArrowRight", candidates)).toBe(w2);
    // Up/Down: jump to next visual line (same column), not step through every word
    expect(pickArticleTargetByLine(w1, "ArrowDown", candidates)).toBe(w3);
    expect(findNextTvFocus(w1, "ArrowDown", candidates)).toBe(w3);
    expect(findNextTvFocus(w2, "ArrowDown", candidates)).toBe(w3);
    expect(findNextTvFocus(w3, "ArrowUp", candidates)).toBe(w1);
    // First word Left must NOT jump to L1 rail mid-article
    expect(findNextTvFocus(w1, "ArrowLeft", candidates)).toBeNull();
  });

  it("classifies nav items and activates inactive ones on focus", () => {
    const nav = document.createElement("nav");
    nav.className = "bottom-nav";
    const item = document.createElement("button");
    item.className = "nav-item";
    item.click = vi.fn();
    item.focus = vi.fn();
    item.scrollIntoView = vi.fn();
    nav.appendChild(item);
    document.body.appendChild(nav);

    expect(isTvNavItem(item)).toBe(true);
    focusElement(item, { activateNav: true });
    expect(item.focus).toHaveBeenCalled();
    expect(item.click).toHaveBeenCalled();

    item.classList.add("active");
    item.click.mockClear();
    focusElement(item, { activateNav: true });
    expect(item.click).not.toHaveBeenCalled();
  });

  it("recognizes PageUp/PageDown as scroll keys with page-sized deltas", () => {
    expect(isTvScrollKey("PageDown")).toBe(true);
    expect(scrollDeltaForKey("PageDown", 480)).toBe(480);
    expect(scrollDeltaForKey("PageUp", 480)).toBe(-480);
  });

  it("finds a scrollable ancestor that can accept the delta", () => {
    const outer = document.createElement("div");
    const inner = document.createElement("div");
    Object.defineProperty(inner, "scrollHeight", { value: 800, configurable: true });
    Object.defineProperty(inner, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(inner, "scrollTop", {
      value: 0,
      writable: true,
      configurable: true,
    });
    inner.style.overflowY = "auto";
    // jsdom getComputedStyle reads inline styles for overflow.
    outer.appendChild(inner);
    document.body.appendChild(outer);

    const child = document.createElement("button");
    inner.appendChild(child);

    const found = findScrollableAncestor(child, 100, document);
    expect(found).toBe(inner);

    outer.remove();
  });

  it("scrolls content via scrollTvContent using scrollBy/scrollTop", () => {
    const scroller = document.createElement("div");
    scroller.className = "app-content";
    Object.defineProperty(scroller, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(scroller, "clientHeight", { value: 400, configurable: true });
    let top = 0;
    Object.defineProperty(scroller, "scrollTop", {
      get: () => top,
      set: (v) => { top = v; },
      configurable: true,
    });
    scroller.scrollBy = vi.fn(({ top: delta }) => {
      top += delta;
    });
    scroller.style.overflowY = "auto";
    document.body.appendChild(scroller);

    const ok = scrollTvContent(200, { activeElement: scroller, documentRef: document });
    expect(ok).toBe(true);
    expect(top).toBeGreaterThan(0);

    scroller.remove();
  });

  it("does not scroll when focus is on the L1 nav rail", () => {
    const navBtn = elementAt(20, 40, 180, 56, { className: "nav-item", parentClass: "bottom-nav" });
    const scroller = document.createElement("div");
    scroller.className = "app-content";
    scroller.scrollBy = vi.fn();
    document.body.appendChild(scroller);

    const ok = scrollTvContent(200, { activeElement: navBtn, documentRef: document });
    expect(ok).toBe(false);
    expect(scroller.scrollBy).not.toHaveBeenCalled();
  });

  it("treats header back/close chrome as remote-Back only (never D-pad targets)", () => {
    const back = elementAt(200, 20, 40, 40, { className: "back-btn" });
    const close = elementAt(200, 80, 40, 40, { className: "close-btn" });
    const action = elementAt(200, 300, 120, 40, { className: "finish-btn" });
    expect(isTvRemoteBackControl(back)).toBe(true);
    expect(isTvRemoteBackControl(close)).toBe(true);
    expect(isTvRemoteBackControl(action)).toBe(false);

    // Even if back/close are nearer, directional search must skip them.
    const current = elementAt(200, 200, 100, 40);
    const candidates = [current, back, close, action];
    expect(findNextTvFocus(current, "ArrowUp", candidates)).toBe(null);
    expect(findNextTvFocus(current, "ArrowDown", candidates)).toBe(action);
  });

  it("bilingual Up/Down reaches translation by line, not only sequential words", () => {
    // Line of original words, then full-width translation, then next para word.
    const w1 = elementAt(300, 100, 40, 20, { className: "word", tag: "span" });
    const w2 = elementAt(350, 100, 40, 20, { className: "word", tag: "span" });
    const tr = elementAt(280, 150, 400, 36, { className: "para-translation", tag: "p" });
    const w3 = elementAt(300, 210, 40, 20, { className: "word", tag: "span" });
    const candidates = [w1, w2, tr, w3];

    expect(isBilingualTranslation(tr)).toBe(true);
    expect(pickArticleTargetByLine(w1, "ArrowDown", candidates)).toBe(tr);
    expect(pickArticleTargetByLine(w2, "ArrowDown", candidates)).toBe(tr);
    expect(findNextTvFocus(w1, "ArrowDown", candidates)).toBe(tr);
    expect(findNextTvFocus(tr, "ArrowDown", candidates)).toBe(w3);
    // Up from translation lands on the nearest original word on the line above (w1 or w2).
    const upFromTr = findNextTvFocus(tr, "ArrowUp", candidates);
    expect([w1, w2]).toContain(upFromTr);
  });

  it("excludes news source URL anchors from the TV focus graph", () => {
    // Regression: a[href] used to match even when tabindex=-1 / card-source.
    const navSrc = readFileSync(resolve(__dirname, "../tvRemoteNavigation.js"), "utf8");
    expect(navSrc).toMatch(/a\[href\]:not\(\[tabindex='-1'\]\)/);
    expect(navSrc).toMatch(/:not\(\.card-source\)/);
    expect(navSrc).toMatch(/:not\(\.header-source\)/);
  });

  it("keeps Left on quiz option/audio buttons inside content (no mid-question rail dump)", () => {
    const learn = elementAt(20, 40, 180, 56, { className: "nav-item active", parentClass: "bottom-nav" });
    const optA = elementAt(280, 120, 600, 56, { className: "option-btn" });
    const optB = elementAt(280, 190, 600, 56, { className: "option-btn" });
    const nextBtn = elementAt(520, 500, 200, 48, { className: "test-nav-btn" });
    const candidates = [learn, optA, optB, nextBtn];

    expect(isTvQuizChoice(optA)).toBe(true);
    // Full-width options: Left has no same-row peer → must stay put, not jump to L1.
    expect(findNextTvFocus(optA, "ArrowLeft", candidates)).toBe(null);
    expect(findNextTvFocus(optB, "ArrowLeft", candidates)).toBe(null);
    // Vertical still moves through options.
    expect(findNextTvFocus(optA, "ArrowDown", candidates)).toBe(optB);
    expect(findNextTvFocus(optB, "ArrowDown", candidates)).toBe(nextBtn);
  });

  it("prefers quiz options when no article words are present", () => {
    const learn = elementAt(20, 40, 180, 56, { className: "nav-item active", parentClass: "bottom-nav" });
    const opt = elementAt(280, 120, 600, 56, { className: "option-btn" });
    const nextBtn = elementAt(520, 500, 200, 48, { className: "test-nav-btn" });
    expect(pickPreferredContentFocus([learn, nextBtn, opt])).toBe(opt);
  });

  it("prefers primary list cards over header utility actions", () => {
    const refresh = elementAt(280, 40, 50, 40, { className: "refresh-btn" });
    const article = elementAt(280, 120, 600, 90, { className: "article-card", tag: "div" });
    article.tabIndex = 0;
    const reset = elementAt(280, 40, 100, 40, { className: "reset-all-btn" });
    const prompt = elementAt(280, 120, 600, 90, { className: "prompt-card", tag: "div" });
    prompt.tabIndex = 0;

    expect(pickPreferredContentFocus([refresh, article])).toBe(article);
    expect(pickPreferredContentFocus([reset, prompt])).toBe(prompt);
  });

  it("waits instead of focusing a utility action marked as deferred", () => {
    const levelPicker = elementAt(280, 40, 100, 40, { className: "level-btn" });
    levelPicker.setAttribute("data-tv-defer-focus", "true");
    expect(pickPreferredContentFocus([levelPicker])).toBeNull();

    levelPicker.removeAttribute("data-tv-defer-focus");
    expect(pickPreferredContentFocus([levelPicker])).toBe(levelPicker);
  });

  it("prefers article words / content over the L1 rail after content navigations", () => {
    const learn = elementAt(20, 40, 180, 56, { className: "nav-item active", parentClass: "bottom-nav" });
    const word = elementAt(300, 120, 40, 24, { className: "word", tag: "span" });
    word.tabIndex = 0;
    const modeBtn = elementAt(300, 400, 100, 40, { className: "mode-btn" });
    const candidates = [learn, word, modeBtn];

    expect(pickPreferredContentFocus(candidates)).toBe(word);

    // Accidental focus on rail after entering a reader must reclaim content.
    const reclaim = resolveInitialTvFocus({
      candidates,
      active: learn,
      force: true,
      keepNavFocus: false,
      body: document.body,
    });
    expect(reclaim.kind).toBe("content");
    expect(reclaim.element).toBe(word);

    // Explicit L1 rail tab switch may keep the active nav item.
    const keepRail = resolveInitialTvFocus({
      candidates,
      active: learn,
      force: true,
      keepNavFocus: true,
      body: document.body,
    });
    expect(keepRail.kind).toBe("nav");
    expect(keepRail.element).toBe(learn);

    // Reader still loading: only rail exists → retry, never dump onto rail.
    const loading = resolveInitialTvFocus({
      candidates: [learn],
      active: document.body,
      force: true,
      keepNavFocus: false,
      body: document.body,
    });
    expect(loading.kind).toBe("retry");
    expect(pickPreferredContentFocus([learn])).toBeNull();
  });

  it("scopes focus to the top confirm layer and excludes tabindex=-1 form controls", () => {
    const underlying = elementAt(250, 100);
    const hiddenRadio = elementAt(250, 160, 20, 20, { tag: "input" });
    hiddenRadio.type = "radio";
    hiddenRadio.tabIndex = -1;

    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    overlay.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });
    const cancel = elementAt(300, 300);
    cancel.className = "confirm-btn cancel";
    overlay.appendChild(cancel);
    document.body.appendChild(overlay);

    expect(focusableElements(document)).toEqual([cancel]);
    expect(focusableElements(document)).not.toContain(underlying);
    expect(focusableElements(document)).not.toContain(hiddenRadio);
  });

  it("lets editable controls own horizontal arrows", () => {
    const text = document.createElement("input");
    const range = document.createElement("input");
    range.type = "range";
    const button = document.createElement("button");

    expect(shouldYieldTvDirectionToControl(text, "ArrowLeft")).toBe(true);
    expect(shouldYieldTvDirectionToControl(range, "ArrowRight")).toBe(true);
    expect(shouldYieldTvDirectionToControl(text, "ArrowDown")).toBe(false);
    expect(shouldYieldTvDirectionToControl(button, "ArrowLeft")).toBe(false);
  });

  it("restores a route focus bookmark by stable key before positional fallback", () => {
    const first = elementAt(250, 100);
    const remembered = elementAt(250, 180);
    remembered.setAttribute("data-tv-focus-key", "article-42");
    const bookmark = createTvFocusBookmark(remembered, [first, remembered]);

    const replacementFirst = elementAt(250, 100);
    const replacementRemembered = elementAt(250, 180);
    replacementRemembered.setAttribute("data-tv-focus-key", "article-42");

    expect(bookmark).toEqual({ key: "article-42", index: 1 });
    expect(resolveTvFocusBookmark(bookmark, [replacementFirst, replacementRemembered]))
      .toBe(replacementRemembered);
  });

  it("keeps the route bookmark through DOM replacement races", async () => {
    let beforeHook;
    let afterHook;
    const settingsRoute = { name: "settings", params: {}, fullPath: "/profile/settings" };
    const llmRoute = { name: "llm-config", params: {}, fullPath: "/profile/llm-config" };
    const router = {
      currentRoute: { value: settingsRoute },
      beforeEach: vi.fn((hook) => { beforeHook = hook; return vi.fn(); }),
      afterEach: vi.fn((hook) => { afterHook = hook; return vi.fn(); }),
    };

    const first = elementAt(280, 80);
    first.setAttribute("data-tv-focus-key", "settings-first");
    const remembered = elementAt(280, 160);
    remembered.setAttribute("data-tv-focus-key", "settings-llm");
    const cleanup = installTvRemoteNavigation({ router, targetWindow: window });
    await new Promise((resolve) => setTimeout(resolve, 0));
    remembered.focus();

    beforeHook(llmRoute, settingsRoute);
    document.body.innerHTML = "";
    const llmChoice = elementAt(280, 100);
    llmChoice.setAttribute("data-tv-focus-key", "llm-choice");
    router.currentRoute.value = llmRoute;
    afterHook(llmRoute, settingsRoute);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(llmChoice);

    beforeHook(settingsRoute, llmRoute);
    document.body.innerHTML = "";
    const replacementFirst = elementAt(280, 80);
    replacementFirst.setAttribute("data-tv-focus-key", "settings-first");
    const replacementRemembered = elementAt(280, 160);
    replacementRemembered.setAttribute("data-tv-focus-key", "settings-llm");
    router.currentRoute.value = settingsRoute;
    afterHook(settingsRoute, llmRoute);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.activeElement).toBe(replacementRemembered);
    cleanup();
  });
});
