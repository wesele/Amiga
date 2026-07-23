import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import PageHeader from "@/shared/components/PageHeader.vue";

const ROOT = resolve(__dirname, "../../../..");

function makeRouter(parent = "learn") {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn", name: "learn", component: { template: "<div/>" } },
      {
        path: "/news",
        name: "news",
        component: { template: "<div/>" },
        meta: { parent },
      },
    ],
  });
}

describe("PageHeader", () => {
  it("renders title, back button, and actions slot", () => {
    const wrapper = mount(PageHeader, {
      props: { title: "Settings" },
      slots: {
        actions: '<button class="action-btn">Reset</button>',
      },
    });

    expect(wrapper.find(".page-title").text()).toBe("Settings");
    expect(wrapper.find(".back-btn").exists()).toBe(true);
    expect(wrapper.find(".action-btn").exists()).toBe(true);
  });

  it("hides back button when showBack is false", () => {
    const wrapper = mount(PageHeader, {
      props: { title: "Hidden", showBack: false },
    });

    expect(wrapper.find(".back-btn").exists()).toBe(false);
  });

  it("uses useParentBack by default on back click", async () => {
    const router = makeRouter("learn");
    await router.push("/news");
    await router.isReady();

    const replaceSpy = vi.spyOn(router, "replace");
    const wrapper = mount(PageHeader, {
      props: { title: "News" },
      global: { plugins: [router] },
    });

    await wrapper.find(".back-btn").trigger("click");
    await flushPromises();

    expect(replaceSpy).toHaveBeenCalledWith({ name: "learn" });
  });

  it("emits back when parent provides @back handler", async () => {
    const onBack = vi.fn();
    const wrapper = mount(PageHeader, {
      props: { title: "Custom" },
      attrs: { onBack },
    });

    await wrapper.find(".back-btn").trigger("click");
    expect(wrapper.emitted("back")).toHaveLength(1);
  });

  it("renders news variant below slot", () => {
    const wrapper = mount(PageHeader, {
      props: { title: "News", variant: "news" },
      slots: {
        below: '<span class="today-label">July 1</span>',
      },
    });

    expect(wrapper.find(".list-header").exists()).toBe(true);
    expect(wrapper.find(".today-label").text()).toBe("July 1");
  });

  it("keeps path variant back, level actions, and title vertically centered", () => {
    const source = readFileSync(resolve(ROOT, "src/shared/components/PageHeader.vue"), "utf8");
    expect(source).toMatch(/\.variant-path\s*\{[\s\S]*grid-template-columns:\s*56px minmax\(0,\s*1fr\) 56px/);
    expect(source).toMatch(/\.variant-path\s*\{[\s\S]*align-items:\s*center/);
    expect(source).toMatch(/class="path-title"/);
    expect(source).toMatch(/\.variant-path\s*\{[\s\S]*column-gap:\s*8px/);
    expect(source).toMatch(/\.variant-path \.header-actions\s*\{[\s\S]*grid-column:\s*3/);
    expect(source).toMatch(/\.variant-path \.path-title\s*\{[\s\S]*grid-column:\s*2/);
    expect(source).toMatch(/\.variant-path \.path-title\s*\{[\s\S]*justify-self:\s*center/);
    expect(source).toMatch(/\.variant-path \.path-title\s*\{[\s\S]*text-align:\s*center/);
  });

  it("makes header back non-focusable on TV (remote Back key only)", () => {
    const source = readFileSync(resolve(ROOT, "src/shared/components/PageHeader.vue"), "utf8");
    expect(source).toMatch(/backTabIndex\s*=\s*isTvLayoutMode\s*\?\s*-1/);
    expect(source).toMatch(/:tabindex="backTabIndex"/);
  });
});
