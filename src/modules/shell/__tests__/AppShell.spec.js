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
    // nav. It inherits the nav's surface background so the two read
    // as a single visual bar.
    expect(safeBlock[0]).toMatch(/height\s*:\s*var\(--safe-bottom/);
    expect(safeBlock[0]).toMatch(/background\s*:\s*var\(--surface/);
  });

  it("AppShell.vue template renders .bottom-nav and .bottom-nav-safe as siblings", () => {
    const vue = read("src/modules/shell/AppShell.vue");
    // The two elements must be siblings under the same v-if so they
    // appear and disappear together.
    expect(vue).toMatch(/<nav class="bottom-nav">[\s\S]*?<\/nav>\s*<div class="bottom-nav-safe"/);
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

  it("renders the .bottom-nav-safe strip alongside the bottom-nav", () => {
    const wrapper = mountShell();
    expect(wrapper.find(".bottom-nav-safe").exists()).toBe(true);
  });

  it("hides the bottom-nav on the wizard, reader, and chat-session routes", async () => {
    const router = makeRouter();
    router.addRoute({ path: "/wizard", name: "wizard", component: { template: "<div />" } });
    router.addRoute({ path: "/news/:id", name: "reader", component: { template: "<div />" } });
    router.addRoute({ path: "/chat/:id", name: "chat-session", component: { template: "<div />" } });

    const wrapper = mount(AppShell, {
      global: {
        plugins: [router],
        stubs: { RouterView: { template: "<div />" }, RouterLink: { template: "<a><slot /></a>" } },
      },
    });
    await flushPromises();

    for (const path of ["/news", "/wizard", "/news/123", "/chat/abc"]) {
      await router.push(path);
      await flushPromises();
      const isHidden = path !== "/news";
      const has = wrapper.find(".bottom-nav").exists();
      expect({ path, has }).toEqual({ path, has: !isHidden });
    }
  });
});
