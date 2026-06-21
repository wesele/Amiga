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
      { path: "/news", name: "news", component: { template: "<div>news</div>" } },
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
  it("AppShell.vue bottom-nav declares padding-bottom: var(--safe-bottom)", () => {
    const css = read("src/modules/shell/AppShell.vue");
    const block = css.match(/\.bottom-nav\s*\{[^}]+\}/);
    expect(block, ".bottom-nav block not found in AppShell.vue").toBeTruthy();
    // On Android the safe area is enforced by WebView.setPadding() in
    // MainActivity, so this padding resolves to 0 there (env() returns
    // 0 on Android WebView). On iOS / WKWebView the env() returns the
    // real value and this padding keeps the nav above the home
    // indicator. The point of asserting the var is in the rule is
    // belt-and-braces: if someone deletes the safe-area hooks in
    // style.css, the fallback expression in this rule still keeps the
    // nav visible on iOS.
    expect(block[0]).toMatch(/padding-bottom\s*:\s*var\(--safe-bottom/);
  });

  it("style.css #app keeps padding-top and padding-bottom for the global safe area", () => {
    const css = read("src/style.css");
    const block = css.match(/#app\s*\{[^}]+\}/);
    expect(block, "#app block not found in style.css").toBeTruthy();
    expect(block[0]).toMatch(/padding-top\s*:\s*var\(--safe-top/);
    expect(block[0]).toMatch(/padding-bottom\s*:\s*var\(--safe-bottom/);
  });

  it("style.css defines --safe-{top,bottom,left,right} from env() with 0 fallback", () => {
    const css = read("src/style.css");
    expect(css).toMatch(/--safe-top\s*:\s*env\(safe-area-inset-top/);
    expect(css).toMatch(/--safe-bottom\s*:\s*env\(safe-area-inset-bottom/);
    expect(css).toMatch(/--safe-left\s*:\s*env\(safe-area-inset-left/);
    expect(css).toMatch(/--safe-right\s*:\s*env\(safe-area-inset-right/);
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

  it("hides the bottom-nav on the wizard, reader, and interaction-chat routes", async () => {
    const router = makeRouter();
    router.addRoute({ path: "/wizard", name: "wizard", component: { template: "<div />" } });
    router.addRoute({ path: "/news/:id", name: "reader", component: { template: "<div />" } });
    router.addRoute({ path: "/interaction/chat/:id", name: "interaction-chat", component: { template: "<div />" } });

    const wrapper = mount(AppShell, {
      global: {
        plugins: [router],
        stubs: { RouterView: { template: "<div />" }, RouterLink: { template: "<a><slot /></a>" } },
      },
    });
    await flushPromises();

    for (const path of ["/news", "/wizard", "/news/123", "/interaction/chat/abc"]) {
      await router.push(path);
      await flushPromises();
      const isHidden = path !== "/news";
      const has = wrapper.find(".bottom-nav").exists();
      expect({ path, has }).toEqual({ path, has: !isHidden });
    }
  });
});
