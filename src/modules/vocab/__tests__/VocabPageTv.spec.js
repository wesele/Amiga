import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";
import VocabPage from "@/modules/vocab/VocabPage.vue";

// Mock isTvMode to be true for this test suite
vi.mock("@/shared/appMode.js", () => ({
  isTvMode: true,
  APP_MODE_TV: "tv",
  APP_MODE_DEFAULT: "default",
  resolveAppMode: () => "tv",
  appMode: "tv",
  applyAppMode: vi.fn(),
}));

describe("VocabPage TV mode details", () => {
  let rectSpy;
  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    api.__setInvoke(vi.fn((command) => {
      if (command === "get_current_user") return Promise.resolve({ id: "u1" });
      if (command === "get_target_language_cmd") return Promise.resolve("es");
      if (command === "get_user_vocab_stats_by_level_cmd") {
        return Promise.resolve([
          { level: "A1", total: 10, mastered: 2, seen: 5, unseen: 3 },
        ]);
      }
      if (command === "get_user_vocab_by_level_cmd") {
        return Promise.resolve([
          { id: "w1", word: "hola", mastery: 0 },
          { id: "w2", word: "mundo", mastery: 1 },
        ]);
      }
      return Promise.resolve(null);
    }));
    rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 100,
      height: 20,
      top: 0,
      left: 0,
      right: 100,
      bottom: 20,
    });
  });

  it("renders words with tabindex and word class, and opens WordPopup on Enter/Space keydown in TV mode", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/learn/vocab", name: "vocab", component: VocabPage },
      ],
    });
    await router.push("/learn/vocab");
    await router.isReady();

    const wrapper = mount(VocabPage, {
      global: { plugins: [router] },
      attachTo: document.body,
    });
    await flushPromises();

    // Click to enter A1 level
    const levelCard = wrapper.find(".level-card");
    expect(levelCard.exists()).toBe(true);
    await levelCard.trigger("click");
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Check words list is rendered
    const wordChips = wrapper.findAll(".word-chip");
    expect(wordChips.length).toBe(2);

    const firstWord = wordChips[0];
    expect(firstWord.text()).toBe("hola");
    // Verify tabindex and word classes are present
    expect(firstWord.attributes("tabindex")).toBe("0");
    expect(firstWord.classes()).toContain("word");

    // Verify focus shifted to the first word element
    expect(document.activeElement).toBe(firstWord.element);

    // WordPopup should not be visible initially
    expect(wrapper.findComponent({ name: "WordPopup" }).exists()).toBe(false);

    // Press Enter to open the word popup
    await firstWord.trigger("keydown", { key: "Enter" });
    await flushPromises();

    // WordPopup should be rendered now
    const popup = wrapper.findComponent({ name: "WordPopup" });
    expect(popup.exists()).toBe(true);
    expect(popup.props("word")).toBe("hola");

    // Close the popup
    await popup.vm.$emit("close");
    await flushPromises();
    expect(wrapper.findComponent({ name: "WordPopup" }).exists()).toBe(false);

    // Press Space to open the popup again
    await firstWord.trigger("keydown", { key: "Space" });
    await flushPromises();
    expect(wrapper.findComponent({ name: "WordPopup" }).exists()).toBe(true);

    // Close again to keep it clean
    const popup2 = wrapper.findComponent({ name: "WordPopup" });
    await popup2.vm.$emit("close");
    await flushPromises();

    // Click the back button to exit detail page
    const backBtn = wrapper.find(".detail-header .back-btn");
    expect(backBtn.exists()).toBe(true);
    await backBtn.trigger("click");
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify focus returned to the original A1 level card (re-fetched from fresh DOM)
    const activeLevelCard = wrapper.find(".level-card");
    expect(document.activeElement).toBe(activeLevelCard.element);

    wrapper.unmount();
    rectSpy.mockRestore();
  });
});
