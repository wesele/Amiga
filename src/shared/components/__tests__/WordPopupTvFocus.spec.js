import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import * as api from "@/shared/api.js";
import { clearTranslationCache } from "@/shared/translationCache.js";
import { installTvRemoteNavigation } from "@/app/tvRemoteNavigation.js";

vi.mock("@/shared/appMode.js", () => ({
  isTvMode: true,
  isTvLayoutMode: true,
  APP_MODE_TV: "tv",
  APP_MODE_DEFAULT: "default",
  resolveAppMode: () => "tv",
  appMode: "tv",
  layoutMode: "tv",
  applyAppMode: vi.fn(),
}));

const { default: WordPopup } = await import("../WordPopup.vue");

describe("WordPopup TV page-study focus", () => {
  let mockInvoke;

  beforeEach(() => {
    clearTranslationCache();
    mockInvoke = vi.fn((cmd) => {
      if (cmd === "translate_word_cmd") {
        return Promise.resolve({ translation: "你好", pos: "interj" });
      }
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });
    api.__setInvoke(mockInvoke);
  });

  it("keeps action chrome mounted during loading so focus is not destroyed", async () => {
    let resolveSecond;
    const secondTranslation = new Promise((resolve) => {
      resolveSecond = resolve;
    });
    let call = 0;
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "translate_word_cmd") {
        call += 1;
        if (call === 1) return Promise.resolve({ translation: "你好", pos: "interj" });
        return secondTranslation;
      }
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });
    api.__setInvoke(mockInvoke);

    const wrapper = mount(WordPopup, {
      props: {
        word: "hola",
        context: "hola",
        sourceLang: "es",
        nativeLang: "zh",
        layout: "page",
        showNav: true,
        canPrev: false,
        canNext: true,
        closeOnAction: false,
      },
      attachTo: document.body,
    });
    await flushPromises();

    const knownBtn = wrapper.find(".act-known");
    expect(knownBtn.exists()).toBe(true);
    knownBtn.element.focus();
    expect(document.activeElement).toBe(knownBtn.element);

    await knownBtn.trigger("click");
    await wrapper.setProps({ word: "mundo", context: "mundo", canPrev: true });
    await flushPromises();

    // Page study keeps known/unknown mounted through the loading gap.
    expect(wrapper.find(".popup-loading").exists()).toBe(true);
    expect(wrapper.find(".act-known").exists()).toBe(true);
    expect(document.activeElement).toBe(wrapper.find(".act-known").element);
    expect(wrapper.find(".act-known").attributes("data-tv-preferred-focus")).toBe("true");

    resolveSecond({ translation: "世界", pos: "n" });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));

    expect(document.activeElement).toBe(wrapper.find(".act-known").element);
    wrapper.unmount();
  });

  it("restores focus on unknown when that was the last action", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "translate_word_cmd") {
        return Promise.resolve({ translation: "译", pos: "n" });
      }
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });
    api.__setInvoke(mockInvoke);

    const wrapper = mount(WordPopup, {
      props: {
        word: "hola",
        context: "hola",
        sourceLang: "es",
        nativeLang: "zh",
        layout: "page",
        showNav: true,
        canPrev: false,
        canNext: true,
        closeOnAction: false,
      },
      attachTo: document.body,
    });
    await flushPromises();

    clearTranslationCache();
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "translate_word_cmd") {
        return Promise.resolve({ translation: "世界", pos: "n" });
      }
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });
    api.__setInvoke(mockInvoke);

    await wrapper.find(".act-unknown").trigger("click");
    await wrapper.setProps({ word: "mundo", context: "mundo", canPrev: true });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));

    expect(document.activeElement).toBe(wrapper.find(".act-unknown").element);
    expect(wrapper.find(".act-unknown").attributes("data-tv-preferred-focus")).toBe("true");
    wrapper.unmount();
  });

  it("survives TV MutationObserver focusFirst reclaim after known advances", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/learn/vocab", name: "vocab", component: { template: "<div />" } }],
    });
    await router.push("/learn/vocab");
    await router.isReady();

    const uninstall = installTvRemoteNavigation({ router, targetWindow: window });

    let resolveSecond;
    const secondTranslation = new Promise((resolve) => {
      resolveSecond = resolve;
    });
    let call = 0;
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "translate_word_cmd") {
        call += 1;
        if (call === 1) return Promise.resolve({ translation: "你好", pos: "interj" });
        return secondTranslation;
      }
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });
    api.__setInvoke(mockInvoke);

    // Shell chrome so focusable graph looks like the real app.
    const shell = document.createElement("div");
    shell.innerHTML = `
      <nav class="bottom-nav">
        <button type="button" class="nav-item active">Learn</button>
      </nav>
      <main class="tv-content-pane"></main>
    `;
    document.body.appendChild(shell);
    const main = shell.querySelector("main");

    const wrapper = mount(WordPopup, {
      props: {
        word: "hola",
        context: "hola",
        sourceLang: "es",
        nativeLang: "zh",
        layout: "page",
        showNav: true,
        canPrev: false,
        canNext: true,
        closeOnAction: false,
      },
      attachTo: main,
    });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 60));

    const knownBtn = wrapper.find(".act-known");
    knownBtn.element.focus();
    expect(document.activeElement).toBe(knownBtn.element);

    await knownBtn.trigger("click");
    await wrapper.setProps({ word: "mundo", context: "mundo", canPrev: true });
    await flushPromises();

    // Simulate slow translation + observer ticks.
    await new Promise((r) => setTimeout(r, 80));
    resolveSecond({ translation: "世界", pos: "n" });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 120));

    expect(document.activeElement).toBe(wrapper.find(".act-known").element);

    wrapper.unmount();
    shell.remove();
    uninstall();
  });
});
