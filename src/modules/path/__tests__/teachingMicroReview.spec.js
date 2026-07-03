import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";
import {
  MICRO_REVIEW_THRESHOLD,
  shouldOfferMicroReview,
} from "@/shared/microReview.js";
import { buildTeachingMicroReviewQueue } from "@/modules/vocab/microReviewQueue.js";

const TeachingPage = (await import("@/modules/path/TeachingPage.vue")).default;

const VOCAB_NODE_ID = "zh-es/U01-VOCAB";

function vocabTeachingContent() {
  return {
    node_id: VOCAB_NODE_ID,
    kind: "vocab",
    unit_id: "U01",
    unit_title_native: "基础问候与自我介绍",
    unit_title_target: "Saludos",
    goal_native: "掌握基础问候用语",
    grammar_points: [],
    words: [
      { word: "hola", definition_zh: "你好" },
      { word: "adiós", definition_zh: "再见" },
      { word: "gracias", definition_zh: "谢谢" },
      { word: "por favor", definition_zh: "请" },
      { word: "buenos días", definition_zh: "早上好" },
    ],
    scenarios: [],
  };
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "path", component: { template: "<div/>" } },
      {
        path: "/learn/path/teach/:nodeId",
        name: "path-teaching",
        component: TeachingPage,
      },
    ],
  });
}

async function mountVocabPage(mockInvoke) {
  const router = makeRouter();
  await router.push({ name: "path-teaching", params: { nodeId: VOCAB_NODE_ID } });
  await router.isReady();
  const wrapper = mount(TeachingPage, { global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}

function vocabInvoke(mockInvoke, extra = {}) {
  mockInvoke.mockImplementation((cmd) => {
    if (cmd === "get_current_user") {
      return Promise.resolve({ id: "u1", native_language: "zh" });
    }
    if (cmd === "get_target_language_cmd") return Promise.resolve("es");
    if (cmd === "get_learning_goals_cmd") {
      return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
    }
    if (cmd === "get_teaching_content_cmd") {
      return Promise.resolve(vocabTeachingContent());
    }
    if (cmd === "get_user_vocab_by_level_cmd") {
      return Promise.resolve([
        { id: 1, word: "hola", mastery: null },
        { id: 2, word: "adiós", mastery: 1 },
        { id: 3, word: "gracias", mastery: 2 },
        { id: 4, word: "por favor", mastery: null },
        { id: 5, word: "buenos días", mastery: null },
      ]);
    }
    if (cmd === "update_word_mastery_cmd") {
      return Promise.resolve(undefined);
    }
    if (cmd === "translate_word_cmd") {
      return Promise.resolve({ translation: "你好", pos: "interj" });
    }
    if (extra[cmd]) return extra[cmd]();
    return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
  });
}

async function markUnknown(wrapper, chipIndex) {
  const chips = wrapper.findAll(".word-chip");
  await chips[chipIndex].trigger("click");
  await flushPromises();
  await wrapper.find(".act-unknown").trigger("click");
  await flushPromises();
}

describe("teachingMicroReview", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
    setLocale("zh", { persist: false });
    vocabInvoke(mockInvoke);
  });

  it("shouldOfferMicroReview respects threshold and dismiss state", () => {
    expect(
      shouldOfferMicroReview({ sessionWordCount: MICRO_REVIEW_THRESHOLD - 1 }),
    ).toBe(false);
    expect(
      shouldOfferMicroReview({ sessionWordCount: MICRO_REVIEW_THRESHOLD }),
    ).toBe(true);
    expect(
      shouldOfferMicroReview({
        sessionWordCount: MICRO_REVIEW_THRESHOLD,
        sheetDismissed: true,
      }),
    ).toBe(false);
  });

  it("shows nudge toast at 2 marks but not sheet until 3", async () => {
    const wrapper = await mountVocabPage(mockInvoke);
    await markUnknown(wrapper, 0);
    expect(wrapper.find(".word-toast").exists()).toBe(false);

    await markUnknown(wrapper, 1);
    expect(wrapper.find(".word-toast").text()).toContain("再标");

    expect(wrapper.find(".micro-review-sheet").exists()).toBe(false);

    await markUnknown(wrapper, 2);
    expect(wrapper.find(".micro-review-sheet").exists()).toBe(true);
    expect(wrapper.text()).toContain("趁热巩固");
  });

  it("dismiss shows CTA and reopen restores sheet", async () => {
    const wrapper = await mountVocabPage(mockInvoke);
    await markUnknown(wrapper, 0);
    await markUnknown(wrapper, 1);
    await markUnknown(wrapper, 2);
    expect(wrapper.find(".micro-review-sheet").exists()).toBe(true);

    await wrapper.find(".micro-review-later").trigger("click");
    expect(wrapper.find(".micro-review-sheet").exists()).toBe(false);
    expect(wrapper.find(".teaching-review-cta").exists()).toBe(true);

    await wrapper.find(".teaching-review-cta").trigger("click");
    expect(wrapper.find(".micro-review-sheet").exists()).toBe(true);
  });

  it("buildTeachingMicroReviewQueue caps at 5 words", () => {
    const words = ["a", "b", "c", "d", "e", "f"];
    const teaching = words.map((word, i) => ({ word, id: i + 1, mastery: 1 }));
    expect(buildTeachingMicroReviewQueue(words, teaching).length).toBe(5);
  });
});