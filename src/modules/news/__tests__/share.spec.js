import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildShareText } from "../utils.js";

/**
 * Mirror of the share handler in NewsReader.vue:onShare. We replicate
 * it here (instead of importing the component, which needs the full
 * Vue/Tauri stack) so the share contract — Web Share API, abort
 * handling, clipboard fallback, success/failure toast — is covered
 * by unit tests.
 *
 * Keep in lock-step with src/modules/news/NewsReader.vue.
 */

// Mirror of copyToClipboard in NewsReader.vue.
function makeCopyToClipboard({ writeTextImpl, execCmdImpl, execCmdOk }) {
  return async function copyToClipboard(text) {
    if (typeof navigator.clipboard?.writeText === "function") {
      try {
        if (writeTextImpl) {
          await writeTextImpl(text);
        } else {
          await navigator.clipboard.writeText(text);
        }
        return true;
      } catch (_) { /* fall through to legacy path */ }
    }
    if (execCmdImpl) {
      const v = execCmdImpl(text);
      return !!v;
    }
    return !!execCmdOk;
  };
}

function makeOnShare({
  article,
  t,
  navigatorRef,         // the navigator-like object to read .share / .clipboard from
  copyImpl,             // (text) => bool | Promise<bool>
  buildShare = buildShareText,
} = {}) {
  return async function onShare() {
    const state = { sharing: false, shareStatus: "", statusTimer: null };
    const copyToClipboard = copyImpl;

    state.run = async function run() {
      if (!article || state.sharing) return;
      state.sharing = true;
      try {
        const title = article.original_title || "";
        const body = article.rewritten_body || article.original_body || "";
        const source = article.source || "";
        const text = buildShare({
          title, body, source,
          prompt: t("news.sharePrompt", { target: "Spanish" }),
          sourceLabel: t("news.shareSource"),
        });

        if (typeof navigatorRef.share === "function") {
          try {
            await navigatorRef.share({
              title: title || t("news.shareTitle"),
              text,
              url: source || undefined,
            });
            return; // success or user dismissed without error
          } catch (e) {
            if (e && e.name === "AbortError") return;
          }
        }

        if (await copyToClipboard(text)) {
          state.shareStatus = t("news.shareCopied");
        } else {
          state.shareStatus = t("news.shareFail");
        }
      } catch (_) {
        state.shareStatus = t("news.shareFail");
      } finally {
        state.sharing = false;
      }
    };
    return state;
  };
}

const ARTICLE = {
  id: 1,
  original_title: "El cambio climático",
  rewritten_body: "El planeta se calienta.",
  original_body: "El planeta se calienta mucho.",
  source: "https://example.com/news/1",
};

const T = (key, params) => {
  const dict = {
    "news.sharePrompt": "I'm learning {target} and want to discuss this article.",
    "news.shareSource": "Source: ",
    "news.shareTitle": "Share this article",
    "news.shareCopied": "Copied to clipboard",
    "news.shareFail": "Share failed",
  };
  let v = dict[key] || key;
  if (params) {
    for (const [k, val] of Object.entries(params)) {
      v = v.replace(`{${k}}`, val);
    }
  }
  return v;
};

describe("NewsReader onShare", () => {
  let origNavigator;

  beforeEach(() => {
    origNavigator = global.navigator;
  });

  afterEach(() => {
    // restore the real navigator (and its .share / .clipboard) by
    // reassigning the properties we touched; the vitest jsdom env
    // doesn't have a navigator.share by default, so we add it.
    try { delete global.navigator.share; } catch (_) { /* noop */ }
    try { delete global.navigator.clipboard; } catch (_) { /* noop */ }
  });

  function setNavigator({ share, clipboard }) {
    Object.defineProperty(global.navigator, "share", {
      value: share,
      configurable: true,
      writable: true,
    });
    if (clipboard !== undefined) {
      Object.defineProperty(global.navigator, "clipboard", {
        value: clipboard,
        configurable: true,
        writable: true,
      });
    }
  }

  it("calls navigator.share with title, text, and url when available", async () => {
    const share = vi.fn().mockResolvedValue();
    setNavigator({ share });
    const copy = vi.fn().mockResolvedValue(true);
    const factory = makeOnShare({ article: ARTICLE, t: T, navigatorRef: global.navigator, copyImpl: copy });
    const s = await factory();
    await s.run();

    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0][0];
    expect(arg.title).toBe("El cambio climático");
    expect(arg.text).toContain("I'm learning Spanish and want to discuss this article.");
    expect(arg.text).toContain("El cambio climático");
    expect(arg.text).toContain("El planeta se calienta.");
    expect(arg.text).toContain("Source: https://example.com/news/1");
    expect(arg.url).toBe("https://example.com/news/1");
    // No fallback to clipboard when share succeeds.
    expect(copy).not.toHaveBeenCalled();
    expect(s.shareStatus).toBe("");
  });

  it("treats AbortError as a silent no-op (no toast, no clipboard)", async () => {
    const err = new Error("cancel");
    err.name = "AbortError";
    const share = vi.fn().mockRejectedValue(err);
    setNavigator({ share });
    const copy = vi.fn().mockResolvedValue(true);
    const factory = makeOnShare({ article: ARTICLE, t: T, navigatorRef: global.navigator, copyImpl: copy });
    const s = await factory();
    await s.run();

    expect(share).toHaveBeenCalledTimes(1);
    expect(copy).not.toHaveBeenCalled();
    expect(s.shareStatus).toBe("");
  });

  it("falls back to clipboard when navigator.share throws a non-abort error", async () => {
    const share = vi.fn().mockRejectedValue(new Error("network"));
    setNavigator({ share });
    const copy = vi.fn().mockResolvedValue(true);
    const factory = makeOnShare({ article: ARTICLE, t: T, navigatorRef: global.navigator, copyImpl: copy });
    const s = await factory();
    await s.run();

    expect(share).toHaveBeenCalledTimes(1);
    expect(copy).toHaveBeenCalledTimes(1);
    expect(s.shareStatus).toBe("Copied to clipboard");
  });

  it("uses clipboard when navigator.share is not a function (e.g. desktop)", async () => {
    setNavigator({ share: undefined });
    const copy = vi.fn().mockResolvedValue(true);
    const factory = makeOnShare({ article: ARTICLE, t: T, navigatorRef: global.navigator, copyImpl: copy });
    const s = await factory();
    await s.run();

    expect(copy).toHaveBeenCalledTimes(1);
    const text = copy.mock.calls[0][0];
    expect(text).toContain("El cambio climático");
    expect(text).toContain("El planeta se calienta.");
    expect(text).toContain("Source: https://example.com/news/1");
    expect(s.shareStatus).toBe("Copied to clipboard");
  });

  it("shows fail toast when clipboard also fails", async () => {
    setNavigator({ share: undefined });
    const copy = vi.fn().mockResolvedValue(false);
    const factory = makeOnShare({ article: ARTICLE, t: T, navigatorRef: global.navigator, copyImpl: copy });
    const s = await factory();
    await s.run();

    expect(copy).toHaveBeenCalledTimes(1);
    expect(s.shareStatus).toBe("Share failed");
  });

  it("is a no-op when article is missing", async () => {
    const share = vi.fn();
    setNavigator({ share });
    const copy = vi.fn();
    const factory = makeOnShare({ article: null, t: T, navigatorRef: global.navigator, copyImpl: copy });
    const s = await factory();
    await s.run();

    expect(share).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
  });

  it("omits the url field in navigator.share when article has no source", async () => {
    const share = vi.fn().mockResolvedValue();
    setNavigator({ share });
    const copy = vi.fn();
    const noSource = { ...ARTICLE, source: "" };
    const factory = makeOnShare({ article: noSource, t: T, navigatorRef: global.navigator, copyImpl: copy });
    const s = await factory();
    await s.run();

    const arg = share.mock.calls[0][0];
    expect(arg.url).toBeUndefined();
    // Source line should not be in the text either.
    expect(arg.text).not.toContain("Source:");
  });

  it("uses rewritten_body in the share text (the version the user just read)", async () => {
    const share = vi.fn().mockResolvedValue();
    setNavigator({ share });
    const copy = vi.fn();
    const factory = makeOnShare({ article: ARTICLE, t: T, navigatorRef: global.navigator, copyImpl: copy });
    const s = await factory();
    await s.run();

    const arg = share.mock.calls[0][0];
    expect(arg.text).toContain("El planeta se calienta.");
    // original_body contains "mucho"; rewritten_body does not.
    expect(arg.text).not.toContain("mucho");
  });

  it("falls back to original_body if rewritten_body is missing", async () => {
    const share = vi.fn().mockResolvedValue();
    setNavigator({ share });
    const copy = vi.fn();
    const noRewrite = { ...ARTICLE, rewritten_body: null, original_body: "Original text here." };
    const factory = makeOnShare({ article: noRewrite, t: T, navigatorRef: global.navigator, copyImpl: copy });
    const s = await factory();
    await s.run();

    const arg = share.mock.calls[0][0];
    expect(arg.text).toContain("Original text here.");
  });

  it("resets sharing flag after completion (so the next tap can fire)", async () => {
    const share = vi.fn().mockResolvedValue();
    setNavigator({ share });
    const copy = vi.fn();
    const factory = makeOnShare({ article: ARTICLE, t: T, navigatorRef: global.navigator, copyImpl: copy });
    const s = await factory();
    await s.run();
    expect(s.sharing).toBe(false);

    // Run again — share should be called twice.
    await s.run();
    expect(share).toHaveBeenCalledTimes(2);
  });
});

describe("copyToClipboard fallback chain (mirror of NewsReader.vue)", () => {
  it("uses navigator.clipboard.writeText when available", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(global.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    const copy = makeCopyToClipboard({});
    const ok = await copy("hello");
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
    try { delete global.navigator.clipboard; } catch (_) { /* noop */ }
  });

  it("falls back to execCommand when navigator.clipboard rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(global.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    const copy = makeCopyToClipboard({ execCmdOk: true });
    const ok = await copy("hello");
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalled();
    try { delete global.navigator.clipboard; } catch (_) { /* noop */ }
  });

  it("returns false when both clipboard paths fail", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(global.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    const copy = makeCopyToClipboard({ execCmdOk: false });
    const ok = await copy("hello");
    expect(ok).toBe(false);
    try { delete global.navigator.clipboard; } catch (_) { /* noop */ }
  });
});
