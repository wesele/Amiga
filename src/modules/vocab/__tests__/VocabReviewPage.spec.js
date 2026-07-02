import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";

vi.mock("@tauri-apps/plugin-shell", () => ({}));

const VocabReviewPage = (await import("@/modules/vocab/VocabReviewPage.vue")).default;

const MOCK_WORDS = [
  {
    id: 1,
    word: "hola",
    mastery: 1,
    definition_zh: "你好",
    definition_es: "saludo",
    example: "Hola, ¿cómo estás?",
    pos: "interj",
  },
  {
    id: 2,
    word: "casa",
    mastery: null,
    definition_zh: "房子",
    definition_es: "vivienda",
  },
];

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn", name: "learn", component: { template: "<div />" } },
      { path: "/vocab/review", name: "vocab-review", component: VocabReviewPage },
    ],
  });
}

function defaultInvoke(cmd) {
  if (cmd === "get_target_language_cmd") return Promise.resolve("es");
  if (cmd === "get_current_user") {
    return Promise.resolve({ id: "u1", native_language: "zh" });
  }
  if (cmd === "get_learning_goals_cmd") {
    return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
  }
  if (cmd === "get_unknown_words_cmd") return Promise.resolve(MOCK_WORDS);
  if (cmd === "update_word_mastery_cmd") return Promise.resolve();
  return Promise.resolve(null);
}

describe("VocabReviewPage", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation(defaultInvoke);
    api.__setInvoke(mockInvoke);
  });

  it("shows flashcard with first word and reinforcement badge", async () => {
    const router = makeRouter();
    await router.push("/vocab/review");
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("hola");
    expect(wrapper.text()).toContain("待巩固");
    expect(wrapper.text()).toContain("1/2");
    expect(wrapper.find(".action-btn.primary").attributes("disabled")).toBeDefined();
  });

  it("reveals definition on flip and enables mastery actions", async () => {
    const router = makeRouter();
    await router.push("/vocab/review");
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".flashcard").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("你好");
    expect(wrapper.find(".action-btn.primary").attributes("disabled")).toBeUndefined();
  });

  it("completes session after marking all words", async () => {
    const router = makeRouter();
    await router.push("/vocab/review");
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".flashcard").trigger("click");
    await wrapper.find(".review-footer .action-btn.primary").trigger("click");
    await flushPromises();

    await wrapper.find(".flashcard").trigger("click");
    await wrapper.find(".review-footer .action-btn.primary").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("复习完成");
    expect(
      mockInvoke.mock.calls.filter(([cmd]) => cmd === "update_word_mastery_cmd").length,
    ).toBe(2);
  });
});