import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMemoryHistory, createRouter } from "vue-router";
import { setLocale } from "@/shared/i18n";

/**
 * Tests for the Android hierarchical back-navigation bridge.
 *
 * The native side (see src-tauri/android/.../MainActivity.kt)
 * intercepts the system back press and evaluates
 * `window.__amigaGoBack()`, which in turn calls into the Vue Router
 * to push the *parent* route (declared via `meta.parent` on each
 * route). The function returns:
 *   - "navigated" → Kotlin does nothing more (we already pushed)
 *   - "at-root"   → Kotlin calls finish() on the activity
 *
 * We test the same protocol by re-implementing the function the same
 * way main.js does, in front of a mock router. The point is to pin
 * the contract — if main.js and the test disagree, the native side
 * will misbehave in production.
 */

// Mirror of the function installed by main.js. Keep in lock-step with
// src/main.js. If you change one, change the other.
function installAmigaGoBack(router) {
  window.__amigaGoBack = () => {
    const route = router.currentRoute.value;
    const parent = route?.meta?.parent;
    if (parent) {
      router.replace({ name: parent });
      return "navigated";
    }
    return "at-root";
  };
}

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
    case "chat-session":
    case "chat-preview":
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
  });

  it("main.js installs window.__amigaGoBack after creating the router (regression: native side must see a real function)", () => {
    // Belt-and-braces: assert the assignment exists in main.js, and
    // that it sits *after* `const router = createRouter()`. The
    // previous bug (in a draft) was assigning the closure before the
    // router existed, which crashed on first back press.
    const main = readMainJs();
    expect(main).toMatch(/window\.__amigaGoBack\s*=/);
    const createIdx = main.search(/const\s+router\s*=\s*createRouter\s*\(\s*\)/);
    const installIdx = main.search(/window\.__amigaGoBack\s*=/);
    expect(createIdx, "createRouter() call not found").toBeGreaterThan(-1);
    expect(installIdx, "__amigaGoBack assignment not found").toBeGreaterThan(createIdx);
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
    installAmigaGoBack(router);
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
    installAmigaGoBack(router);
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
    installAmigaGoBack(router);
    await router.push("/explicit-root");

    const pushSpy = vi.spyOn(router, "push");
    const replaceSpy = vi.spyOn(router, "replace");
    const result = window.__amigaGoBack();
    expect(result).toBe("at-root");
    expect(pushSpy).not.toHaveBeenCalled();
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
    installAmigaGoBack(router);
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
    installAmigaGoBack(router);
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
      { name: "reader", parent: "news" },
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
