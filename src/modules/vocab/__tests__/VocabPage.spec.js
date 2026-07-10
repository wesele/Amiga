import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";
import VocabPage from "@/modules/vocab/VocabPage.vue";

describe("VocabPage navigation", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    api.__setInvoke(vi.fn((command) => {
      if (command === "get_current_user") return Promise.resolve({ id: "u1" });
      if (command === "get_target_language_cmd") return Promise.resolve("es");
      if (command === "get_user_vocab_stats_by_level_cmd") return Promise.resolve([]);
      return Promise.resolve(null);
    }));
  });

  it("returns from the word overview to the learning parent", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/learn", name: "learn", component: { template: "<div />" } },
        { path: "/learn/vocab", name: "vocab", component: VocabPage, meta: { parent: "learn" } },
      ],
    });
    await router.push("/learn/vocab");
    await router.isReady();
    const replaceSpy = vi.spyOn(router, "replace");
    const wrapper = mount(VocabPage, { global: { plugins: [router] } });
    await flushPromises();

    const backButton = wrapper.find(".overview-header .back-btn");
    expect(backButton.exists()).toBe(true);
    await backButton.trigger("click");

    expect(replaceSpy).toHaveBeenCalledWith({ name: "learn" });
  });
});
