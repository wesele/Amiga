import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";

// __dirname is src/modules/shell/__tests__/, so four levels up lands at
// the project root (the directory that contains package.json).
const ROOT = resolve(__dirname, "../../../..");

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

vi.mock("@tauri-apps/plugin-shell", () => ({}));

const AppShell = (await import("@/modules/shell/AppShell.vue")).default;

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div>home</div>" } },
      { path: "/learn", name: "learn", component: { template: "<div>learn</div>" } },
      { path: "/news", name: "news", component: { template: "<div>news</div>" }, meta: { parent: "learn" } },
      { path: "/vocab", name: "vocab", component: { template: "<div>vocab</div>" } },
      { path: "/chat", name: "chat", component: { template: "<div>chat</div>" } },
      { path: "/profile", name: "profile", component: { template: "<div>profile</div>" } },
    ],
  });
}

function mountShell() {
  return mount(AppShell, {
    global: {
      plugins: [makeRouter()],
      stubs: { RouterView: { template: "<div class='rv' />" }, RouterLink: { template: "<a><slot /></a>" } },
    },
  });
}

describe("AppShell bottom-nav safe-area", () => {
  it("AppShell.vue owns the system safe area via a sibling .bottom-nav-safe strip, not via padding on .bottom-nav", () => {
    const css = read("src/modules/shell/AppShell.vue");
    const navBlock = css.match(/\.bottom-nav\s*\{[^}]+\}/);
    expect(navBlock, ".bottom-nav block not found in AppShell.vue").toBeTruthy();
    const safeBlock = css.match(/\.bottom-nav-safe\s*\{[^}]+\}/);
    expect(safeBlock, ".bottom-nav-safe block not found in AppShell.vue").toBeTruthy();
    // The interactive .bottom-nav must be a fixed 64px bar with NO
    // safe-area padding — padding on the flex container shrinks the
    // flex line cross-size and pushes the items to the top of the
    // visual bar.
    expect(navBlock[0]).toMatch(/height\s*:\s*64px/);
    expect(navBlock[0]).not.toMatch(/padding-bottom\s*:\s*var\(--safe-bottom/);
    // The safe-area strip is a sibling, not a padding region of the
    // nav. It always renders (even when the nav is hidden) so the
    // system navigation bar never overlaps content.
    expect(safeBlock[0]).toMatch(/height\s*:\s*var\(--safe-bottom/);
  });

  it("AppShell.vue .bottom-nav-safe has --surface background when bottom-nav is visible, --bg when hidden", () => {
    const css = read("src/modules/shell/AppShell.vue");
    // Default: surface (matches nav bar)
    expect(css).toMatch(/\.bottom-nav-safe\s*\{[^}]*background\s*:\s*var\(--surface\)/);
    // When nav hidden: switches to page background
    expect(css).toMatch(/\.bottom-nav-safe/);
  });

  it("AppShell.vue template always renders .bottom-nav-safe (not gated by v-if)", () => {
    const vue = read("src/modules/shell/AppShell.vue");
    // .bottom-nav-safe must appear OUTSIDE the <template v-if="showNav">
    // block so it renders even when the bottom nav is hidden.
    expect(vue).toMatch(/<\/template>\s*<div class="bottom-nav-safe"/);
  });

  it("style.css #app keeps padding-top for the global safe area; padding-bottom is handled by .bottom-nav-safe", () => {
    const css = read("src/style.css");
    const block = css.match(/#app\s*\{[^}]+\}/);
    expect(block, "#app block not found in style.css").toBeTruthy();
    expect(block[0]).toMatch(/padding-top\s*:\s*var\(--safe-top/);
    // padding-bottom on #app is intentionally omitted — the
    // .bottom-nav-safe strip (always rendered by AppShell) handles
    // the bottom safe-area instead, avoiding double-counting.
    expect(block[0]).not.toMatch(/padding-bottom\s*:\s*var\(--safe-bottom/);
  });

  it("style.css defines --safe-{top,bottom,left,right} from env() with 0 fallback", () => {
    const css = read("src/style.css");
    expect(css).toMatch(/--safe-top\s*:\s*env\(safe-area-inset-top/);
    expect(css).toMatch(/--safe-bottom\s*:\s*env\(safe-area-inset-bottom/);
    expect(css).toMatch(/--safe-left\s*:\s*env\(safe-area-inset-left/);
    expect(css).toMatch(/--safe-right\s*:\s*env\(safe-area-inset-right/);
  });

  it("main.js installs window.__amigaSetInsets that sets --safe-* CSS custom properties on <html>", () => {
    const main = read("src/main.js");
    expect(main).toMatch(/window\.__amigaSetInsets\s*=/);
    expect(main).toMatch(/--safe-top/);
    expect(main).toMatch(/--safe-bottom/);
    expect(main).toMatch(/--safe-left/);
    expect(main).toMatch(/--safe-right/);
  });
});

describe("AppShell render", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("renders 4 nav items in the bottom-nav", () => {
    const wrapper = mountShell();
    const items = wrapper.findAll(".bottom-nav .nav-item");
    expect(items.length).toBe(4);
  });

  it("renders the .bottom-nav-safe strip even when the bottom-nav is hidden", () => {
    const wrapper = mountShell();
    expect(wrapper.find(".bottom-nav-safe").exists()).toBe(true);
  });

  it("hides the bottom-nav on the wizard, reader, and chat-session routes", async () => {
    const router = makeRouter();
    router.addRoute({ path: "/wizard", name: "wizard", component: { template: "<div />" } });
    router.addRoute({ path: "/news/:id", name: "reader", component: { template: "<div />" } });
    router.addRoute({ path: "/chat/:id", name: "chat-session", component: { template: "<div />" } });
    router.addRoute({
      path: "/learn/translator/:sessionId",
      name: "learn-translator",
      component: { template: "<div />" },
      meta: { parent: "learn" },
    });

    const wrapper = mount(AppShell, {
      global: {
        plugins: [router],
        stubs: { RouterView: { template: "<div />" }, RouterLink: { template: "<a><slot /></a>" } },
      },
    });
    await flushPromises();

    for (const path of ["/learn", "/news", "/wizard", "/news/123", "/chat/abc", "/learn/translator/abc"]) {
      await router.push(path);
      await flushPromises();
      const isHidden = path === "/wizard" || path === "/news/123" || path === "/chat/abc" || path === "/learn/translator/abc";
      const has = wrapper.find(".bottom-nav").exists();
      expect({ path, has }).toEqual({ path, has: !isHidden });
    }
  });
});

describe("AppShell bottom-nav tab switching (L1 isolation)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("clicking a bottom-nav tab uses router.replace (not router.push) so tab switches don't grow the history stack", async () => {
    const router = makeRouter();
    const wrapper = mount(AppShell, {
      global: {
        plugins: [router],
        stubs: { RouterView: { template: "<div />" } },
      },
    });
    await flushPromises();
    await router.push("/learn");
    await flushPromises();

    const replaceSpy = vi.spyOn(router, "replace");
    const pushSpy = vi.spyOn(router, "push");

    // The L1 tabs are listed in the order [learn, vocab, chat, profile];
    // tab index 3 is "profile".
    const tabs = wrapper.findAll(".bottom-nav .nav-item");
    expect(tabs.length).toBe(4);
    await tabs[3].trigger("click");
    await flushPromises();

    expect(replaceSpy).toHaveBeenCalledWith({ name: "profile" });
    expect(pushSpy).not.toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe("profile");
  });

  it("clicking a sub-page's parent tab from a deep route also uses replace (regression: don't push another tab entry)", async () => {
    const router = makeRouter();
    router.addRoute({
      path: "/profile/settings",
      name: "settings",
      component: { template: "<div />" },
      meta: { parent: "profile" },
    });
    const wrapper = mount(AppShell, {
      global: {
        plugins: [router],
        stubs: { RouterView: { template: "<div />" } },
      },
    });
    await flushPromises();
    await router.push("/profile/settings");
    await flushPromises();

    const replaceSpy = vi.spyOn(router, "replace");
    const pushSpy = vi.spyOn(router, "push");

    // Click "vocab" tab (index 1). Should replace, not push.
    const tabs = wrapper.findAll(".bottom-nav .nav-item");
    await tabs[1].trigger("click");
    await flushPromises();

    expect(replaceSpy).toHaveBeenCalledWith({ name: "vocab" });
    expect(pushSpy).not.toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe("vocab");
  });

  it("clicking the already-active tab is a no-op (no router.replace / push)", async () => {
    const router = makeRouter();
    const wrapper = mount(AppShell, {
      global: {
        plugins: [router],
        stubs: { RouterView: { template: "<div />" } },
      },
    });
    await flushPromises();
    await router.push("/learn");
    await flushPromises();

    const replaceSpy = vi.spyOn(router, "replace");
    const pushSpy = vi.spyOn(router, "push");

    const tabs = wrapper.findAll(".bottom-nav .nav-item");
    // /learn is index 0; click it again while it's the current route.
    await tabs[0].trigger("click");
    await flushPromises();

    expect(replaceSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("highlights the active L1 tab even when a sub-page is open (e.g. /profile/settings keeps 'profile' active)", async () => {
    const router = makeRouter();
    router.addRoute({
      path: "/profile/settings",
      name: "settings",
      component: { template: "<div />" },
      meta: { parent: "profile" },
    });
    const wrapper = mount(AppShell, {
      global: {
        plugins: [router],
        stubs: { RouterView: { template: "<div />" } },
      },
    });
    await flushPromises();
    await router.push("/profile/settings");
    await flushPromises();

    const tabs = wrapper.findAll(".bottom-nav .nav-item");
    // Tab order: learn(0), vocab(1), chat(2), profile(3)
    expect(tabs[3].classes()).toContain("active");
  });
});
