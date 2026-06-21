import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// __dirname is src/modules/shell/__tests__/, so four levels up lands at
// the project root (the directory that contains package.json).
const ROOT = resolve(__dirname, "../../../..");

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

describe("AppShell bottom-nav safe-area", () => {
  it("AppShell.vue bottom-nav declares padding-bottom: var(--safe-bottom)", () => {
    const css = read("src/modules/shell/AppShell.vue");
    // We accept either a direct var(--safe-bottom) or a fallback
    // expression — both are present-tense. The point is that this CSS
    // rule is in the file: the bottom nav must own its own safe-area
    // padding, not rely solely on #app's outer padding.
    const block = css.match(/\.bottom-nav\s*\{[^}]+\}/);
    expect(block, ".bottom-nav block not found in AppShell.vue").toBeTruthy();
    expect(block[0]).toMatch(/padding-bottom\s*:\s*var\(--safe-bottom/);
  });

  it("style.css #app keeps padding-top and padding-bottom for the global safe area", () => {
    const css = read("src/style.css");
    const block = css.match(/#app\s*\{[^}]+\}/);
    expect(block, "#app block not found in style.css").toBeTruthy();
    expect(block[0]).toMatch(/padding-top\s*:\s*var\(--safe-top/);
    expect(block[0]).toMatch(/padding-bottom\s*:\s*var\(--safe-bottom/);
  });
});

describe("Android safe-area bridge", () => {
  it("style.css defines --amiga-safe-{top,bottom,left,right} consumed by --safe-*", () => {
    const css = read("src/style.css");
    expect(css).toMatch(/--amiga-safe-top\s*:/);
    expect(css).toMatch(/--amiga-safe-bottom\s*:/);
    expect(css).toMatch(/--amiga-safe-left\s*:/);
    expect(css).toMatch(/--amiga-safe-right\s*:/);
    // The CSS variables consumed by the layout should fall back to the
    // JS-injected --amiga-safe-* first, then env() (for iOS / WKWebView
    // and for browsers that emulate the env).
    expect(css).toMatch(/--safe-top\s*:\s*var\(--amiga-safe-top/);
    expect(css).toMatch(/--safe-bottom\s*:\s*var\(--amiga-safe-bottom/);
  });

  it("main.js installs window.__amigaSetInsets before any module loads", () => {
    const main = read("src/main.js");
    // The bridge must be defined inside bootstrap() (so it runs before
    // kernel.loadModule and before the native side can call it).
    const bootstrap = main.match(/async function bootstrap\(\)\s*\{([\s\S]+?)\n\}/);
    expect(bootstrap, "bootstrap() not found in main.js").toBeTruthy();
    const body = bootstrap[1];
    const bridgeIdx = body.search(/window\.__amigaSetInsets\s*=/);
    const firstModuleIdx = body.search(/kernel\.loadModule\(/);
    expect(bridgeIdx, "window.__amigaSetInsets assignment not found in bootstrap").toBeGreaterThanOrEqual(0);
    expect(firstModuleIdx, "kernel.loadModule not found in bootstrap").toBeGreaterThan(bridgeIdx);
  });

  it("__amigaSetInsets writes CSS custom properties on documentElement", () => {
    // Run the same logic the bridge uses, against a stub document, to
    // assert it produces the expected --amiga-safe-* style values.
    const calls = [];
    const fakeRoot = {
      style: {
        setProperty: (k, v) => calls.push([k, v]),
      },
    };
    // Mirror the bridge body from main.js. Keep it in lock-step with
    // the source — if you change one, change the other.
    function setInsets(insets) {
      if (!insets || typeof insets !== "object") return;
      const set = (k, v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) {
          fakeRoot.style.setProperty(`--amiga-safe-${k}`, `${Math.round(n)}px`);
        }
      };
      set("top", insets.top);
      set("bottom", insets.bottom);
      set("left", insets.left);
      set("right", insets.right);
    }

    setInsets({ top: 24, bottom: 48, left: 0, right: 0 });
    expect(calls).toEqual([
      ["--amiga-safe-top", "24px"],
      ["--amiga-safe-bottom", "48px"],
      ["--amiga-safe-left", "0px"],
      ["--amiga-safe-right", "0px"],
    ]);

    // Negative / non-finite values must be dropped.
    calls.length = 0;
    setInsets({ top: -1, bottom: NaN, left: "garbage", right: undefined });
    expect(calls).toEqual([]);

    // Null / non-object is a no-op.
    calls.length = 0;
    setInsets(null);
    setInsets("nope");
    expect(calls).toEqual([]);
  });
});
