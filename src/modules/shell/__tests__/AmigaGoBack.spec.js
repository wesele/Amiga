import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMemoryHistory, createRouter } from "vue-router";
import { setLocale } from "@/shared/i18n";
import { installAndroidBridge } from "@/app/androidBridge.js";

/**
 * Tests for the Android hierarchical back-navigation bridge.
 *
 * The native side (see src-tauri/android/.../MainActivity.kt)
 * intercepts the system back press and evaluates
 * `window.__amigaGoBack()`, which in turn calls into the Vue Router
 * to replace with the *parent* route (declared via `meta.parent` on each
 * route). The function returns:
 *   - "navigated" → Kotlin does nothing more (we already pushed)
 *   - "at-root"   → Kotlin calls finish() on the activity
 *
 * We test the production bridge installer directly so the native side
 * contract is pinned without duplicating the implementation in tests.
 */

function makeRouter(routes) {
  return createRouter({
    history: createMemoryHistory(),
    routes: routes.map((r) => ({
      path: r.path,
      name: r.name,
      component: { template: "<div />" },
      meta: r.meta || {},
    })),
  });
}

const ROOT = resolve(__dirname, "../../../..");
function readMainJs() {
  return readFileSync(resolve(ROOT, "src/main.js"), "utf8");
}
function readRouteFile(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

function routeFileForName(name) {
  // Keep in sync with the route definitions across modules.
  switch (name) {
    case "reader":
    case "news":
      return "src/modules/news/routes.js";
    case "learn":
    case "learn-translator":
      return "src/modules/learn/routes.js";
    case "path":
    case "path-teaching":
    case "path-lesson":
      return "src/modules/path/routes.js";
    case "reading":
    case "reading-article":
    case "reading-test":
      return "src/modules/reading/routes.js";
    case "chat-session":
    case "chat-preview":
    case "social-hub":
    case "social-chat":
    case "chat":
      return "src/modules/chat/routes.js";
    case "settings":
    case "llm-config":
    case "profile":
      return "src/modules/profile/routes.js";
    case "prompts":
    case "prompt-editor":
      return "src/modules/prompts/routes.js";
    default:
      throw new Error(`routeFileForName: no mapping for ${name}`);
  }
}

describe("__amigaGoBack bridge", () => {
  beforeEach(() => {
    setLocale("zh", { persist: false });
    delete window.__amigaGoBack;
    delete window.__amigaGoBackInPage;
  });

  it("main.js installs the Android bridge after creating the router (regression: native side must see a real function)", () => {
    // Belt-and-braces: assert the assignment exists in main.js, and
    // that it sits *after* `const router = createRouter()`. The
    // previous bug (in a draft) was assigning the closure before the
    // router existed, which crashed on first back press.
    const main = readMainJs();
    expect(main).toMatch(/installAndroidBridge\s*\(\s*\{\s*router\s*\}\s*\)/);
    const createIdx = main.search(/const\s+router\s*=\s*createRouter\s*\(\s*\)/);
    const installIdx = main.search(/installAndroidBridge\s*\(\s*\{\s*router\s*\}\s*\)/);
    expect(createIdx, "createRouter() call not found").toBeGreaterThan(-1);
    expect(installIdx, "installAndroidBridge call not found").toBeGreaterThan(createIdx);
  });

  it("returns 'navigated' and replaces with the parent route when meta.parent is set", async () => {
    const router = makeRouter([
      { path: "/news", name: "news", component: { template: "<div />" } },
      {
        path: "/news/:id",
        name: "reader",
        component: { template: "<div />" },
        meta: { parent: "news" },
      },
    ]);
    installAndroidBridge({ router });
    await router.push("/news/123");
    expect(router.currentRoute.value.name).toBe("reader");

    // The contract: back uses router.replace (not push) so the
    // history stack stays aligned with the route hierarchy and the
    // browser's URL history doesn't accumulate "previous tab" entries.
    const replaceSpy = vi.spyOn(router, "replace");
    const pushSpy = vi.spyOn(router, "push");
    const result = window.__amigaGoBack();
    expect(result).toBe("navigated");
    expect(replaceSpy).toHaveBeenCalledWith({ name: "news" });
    expect(pushSpy).not.toHaveBeenCalled();
    await replaceSpy.mock.results[0].value;
    expect(router.currentRoute.value.name).toBe("news");
  });

  it("returns 'at-root' on a top-level route (parent undefined)", async () => {
    const router = makeRouter([
      { path: "/news", name: "news", component: { template: "<div />" } },
    ]);
    installAndroidBridge({ router });
    await router.push("/news");

    const pushSpy = vi.spyOn(router, "push");
    const replaceSpy = vi.spyOn(router, "replace");
    const result = window.__amigaGoBack();
    expect(result).toBe("at-root");
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("returns 'at-root' on a route with explicit meta.parent = null", async () => {
    const router = makeRouter([
      {
        path: "/explicit-root",
        name: "explicit-root",
        component: { template: "<div />" },
        meta: { parent: null },
      },
    ]);
    installAndroidBridge({ router });
    await router.push("/explicit-root");

    const pushSpy = vi.spyOn(router, "push");
    const replaceSpy = vi.spyOn(router, "replace");
    const result = window.__amigaGoBack();
    expect(result).toBe("at-root");
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("lets an in-page handler consume the back press before route-level parents", async () => {
    const router = makeRouter([
      { path: "/vocab", name: "vocab", component: { template: "<div />" } },
    ]);
    installAndroidBridge({ router });
    await router.push("/vocab");

    const replaceSpy = vi.spyOn(router, "replace");
    const inPage = vi.fn(() => "navigated");
    window.__amigaGoBackInPage = inPage;

    expect(window.__amigaGoBack()).toBe("navigated");
    expect(inPage).toHaveBeenCalledTimes(1);
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("walks multi-level chains: /profile/llm-config → /profile/settings → /profile → exit", async () => {
    const router = makeRouter([
      { path: "/profile", name: "profile", component: { template: "<div />" } },
      {
        path: "/profile/settings",
        name: "settings",
        component: { template: "<div />" },
        meta: { parent: "profile" },
      },
      {
        path: "/profile/llm-config",
        name: "llm-config",
        component: { template: "<div />" },
        meta: { parent: "settings" },
      },
    ]);
    installAndroidBridge({ router });
    await router.push("/profile/llm-config");
    expect(router.currentRoute.value.name).toBe("llm-config");

    {
      const replaceSpy = vi.spyOn(router, "replace");
      expect(window.__amigaGoBack()).toBe("navigated");
      await replaceSpy.mock.results[0].value;
      expect(router.currentRoute.value.name).toBe("settings");
      replaceSpy.mockRestore();
    }
    {
      const replaceSpy = vi.spyOn(router, "replace");
      expect(window.__amigaGoBack()).toBe("navigated");
      await replaceSpy.mock.results[0].value;
      expect(router.currentRoute.value.name).toBe("profile");
      replaceSpy.mockRestore();
    }
    expect(window.__amigaGoBack()).toBe("at-root");
  });

  it("chat-session → chat → at-root (covers the back-button UX for the translator)", async () => {
    const router = makeRouter([
      { path: "/chat", name: "chat", component: { template: "<div />" } },
      {
        path: "/chat/:id",
        name: "chat-session",
        component: { template: "<div />" },
        meta: { parent: "chat" },
      },
    ]);
    installAndroidBridge({ router });
    await router.push("/chat/abc");
    expect(router.currentRoute.value.name).toBe("chat-session");

    const replaceSpy = vi.spyOn(router, "replace");
    expect(window.__amigaGoBack()).toBe("navigated");
    await replaceSpy.mock.results[0].value;
    expect(router.currentRoute.value.name).toBe("chat");
    replaceSpy.mockRestore();

    expect(window.__amigaGoBack()).toBe("at-root");
  });

  it("all production detail routes declare meta.parent with the right name", () => {
    // Belt-and-braces: list the detail routes reachable from the
    // bottom nav and assert they have a meta.parent. This catches the
    // case where someone adds a new detail route and forgets to
    // declare its parent — that would make the back button land on
    // the wrong screen and re-introduce the "previous page" loop.
    const detailRoutes = [
      { name: "news", parent: "learn" },
      { name: "reader", parent: "news" },
      { name: "learn-translator", parent: "learn" },
      { name: "path", parent: "learn" },
      { name: "path-teaching", parent: "path" },
      { name: "path-lesson", parent: "path" },
      { name: "reading", parent: "learn" },
      { name: "reading-article", parent: "reading" },
      { name: "reading-test", parent: "reading-article" },
      { name: "social-hub", parent: "chat" },
      { name: "social-chat", parent: "chat" },
      { name: "chat-session", parent: "chat" },
      { name: "chat-preview", parent: "chat" },
      { name: "settings", parent: "profile" },
      { name: "llm-config", parent: "settings" },
      { name: "prompts", parent: "settings" },
      { name: "prompt-editor", parent: "prompts" },
    ];
    for (const r of detailRoutes) {
      const path = routeFileForName(r.name);
      const src = readRouteFile(path);
      const re = new RegExp(`meta\\s*:\\s*\\{[^}]*parent\\s*:\\s*['"]${r.parent}['"]`);
      expect(src, `expected ${r.name} (${path}) to declare meta.parent = ${r.parent}`).toMatch(re);
    }
  });
});
