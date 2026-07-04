import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";

const TeachingPage = (await import("@/modules/path/TeachingPage.vue")).default;
const GrammarPointPage = (await import("@/modules/path/GrammarPointPage.vue")).default;

const GRAMMAR_NODE_ID = "zh-es/U01-GRAMMAR";
const VOCAB_NODE_ID = "zh-es/U01-VOCAB";
const GRAMMAR_POINT = "ser and estar basic contrast";
const SECOND_GRAMMAR_POINT = "articles agree with nouns";

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
      {
        path: "/learn/path/teach/:nodeId/grammar/:pointIdx",
        name: "path-grammar-point",
        component: GrammarPointPage,
      },
    ],
  });
}

function grammarTeachingContent() {
  return {
    node_id: GRAMMAR_NODE_ID,
    kind: "grammar",
    unit_id: "U01",
    unit_title_native: "Basic greetings",
    unit_title_target: "Saludos",
    goal_native: "Learn greetings",
    grammar_points: [GRAMMAR_POINT, SECOND_GRAMMAR_POINT],
    words: [],
    scenarios: ["first meeting"],
  };
}

function vocabTeachingContent() {
  return {
    node_id: VOCAB_NODE_ID,
    kind: "vocab",
    unit_id: "U01",
    unit_title_native: "Basic greetings",
    unit_title_target: "Saludos",
    goal_native: "Learn greetings",
    grammar_points: [],
    words: [
      { word: "hola", definition_zh: "hello" },
      { word: "adios", definition_zh: "bye" },
      { word: "gracias", definition_zh: "thanks" },
    ],
    scenarios: [],
  };
}

function mockLearningContext(mockInvoke) {
  mockInvoke.mockImplementation((cmd, args) => {
    if (cmd === "get_current_user") {
      return Promise.resolve({ id: "u1", native_language: "zh" });
    }
    if (cmd === "get_target_language_cmd") return Promise.resolve("es");
    if (cmd === "get_learning_goals_cmd") {
      return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
    }
    if (cmd === "get_teaching_content_cmd") {
      return Promise.resolve(grammarTeachingContent());
    }
    if (cmd === "get_grammar_explanation_cached_cmd") {
      return Promise.resolve(null);
    }
    if (cmd === "explain_grammar_point_cmd") {
      return Promise.resolve({
        explanation: `${args?.pointText || GRAMMAR_POINT} explanation`,
        from_cache: false,
      });
    }
    return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
  });
}

async function mountTeachingPage(mockInvoke, nodeId = GRAMMAR_NODE_ID) {
  const router = makeRouter();
  await router.push({ name: "path-teaching", params: { nodeId } });
  await router.isReady();
  const wrapper = mount(TeachingPage, {
    global: { plugins: [router] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe("TeachingPage grammar points", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
    setLocale("en", { persist: false });
    mockLearningContext(mockInvoke);
  });

  it("navigates to a standalone grammar point page instead of expanding inline", async () => {
    const { wrapper, router } = await mountTeachingPage(mockInvoke);

    expect(wrapper.text()).toContain(GRAMMAR_POINT);
    await wrapper.find(".point-btn").trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.name).toBe("path-grammar-point");
    expect(router.currentRoute.value.params.pointIdx).toBe("0");
    expect(wrapper.find(".detail-body").exists()).toBe(false);
    expect(
      mockInvoke.mock.calls.some(([cmd]) => cmd === "explain_grammar_point_cmd"),
    ).toBe(false);
  });
});

describe("GrammarPointPage", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
    setLocale("en", { persist: false });
    mockLearningContext(mockInvoke);
  });

  async function mountGrammarPointPage() {
    const router = makeRouter();
    await router.push({
      name: "path-grammar-point",
      params: { nodeId: GRAMMAR_NODE_ID, pointIdx: 0 },
    });
    await router.isReady();
    const wrapper = mount(GrammarPointPage, {
      global: { plugins: [router] },
    });
    await flushPromises();
    return { wrapper, router };
  }

  it("loads the selected grammar point and shows generated explanation", async () => {
    const { wrapper } = await mountGrammarPointPage();

    expect(mockInvoke).toHaveBeenCalledWith("get_grammar_explanation_cached_cmd", {
      cefr: "A1",
      unitId: "U01",
      pointText: GRAMMAR_POINT,
    });
    expect(mockInvoke).toHaveBeenCalledWith("explain_grammar_point_cmd", {
      cefr: "A1",
      targetLang: "es",
      unitId: "U01",
      pointText: GRAMMAR_POINT,
      unitTitle: "Basic greetings",
      unitGoal: "Learn greetings",
    });
    expect(wrapper.find(".detail-body").text()).toContain(`${GRAMMAR_POINT} explanation`);
  });

  it("moves between grammar points and turns final next into continue", async () => {
    const { wrapper, router } = await mountGrammarPointPage();

    const prevButton = wrapper.find(".prev-btn");
    expect(prevButton.attributes("disabled")).toBeDefined();
    expect(wrapper.find(".next-btn").text()).toBe("Next");

    await wrapper.find(".next-btn").trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.params.pointIdx).toBe("1");
    expect(wrapper.find(".point-card").text()).toContain(SECOND_GRAMMAR_POINT);
    expect(wrapper.find(".prev-btn").attributes("disabled")).toBeUndefined();
    expect(wrapper.find(".next-btn").text()).toBe("Continue");

    await wrapper.find(".prev-btn").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.params.pointIdx).toBe("0");

    await wrapper.find(".next-btn").trigger("click");
    await flushPromises();
    await wrapper.find(".next-btn").trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.name).toBe("path-teaching");
  });

  it("uses cached explanation without calling explain", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_teaching_content_cmd") {
        return Promise.resolve(grammarTeachingContent());
      }
      if (cmd === "get_grammar_explanation_cached_cmd") {
        return Promise.resolve("Cached grammar explanation");
      }
      if (cmd === "explain_grammar_point_cmd") {
        return Promise.reject(new Error("should not call explain"));
      }
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });

    const { wrapper } = await mountGrammarPointPage();

    expect(wrapper.find(".detail-body").text()).toContain("Cached grammar explanation");
    expect(
      mockInvoke.mock.calls.some(([cmd]) => cmd === "explain_grammar_point_cmd"),
    ).toBe(false);
  });

  it("shows backend error and retry affordance when explain fails", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_teaching_content_cmd") {
        return Promise.resolve(grammarTeachingContent());
      }
      if (cmd === "get_grammar_explanation_cached_cmd") {
        return Promise.resolve(null);
      }
      if (cmd === "explain_grammar_point_cmd") {
        return Promise.reject("model failed");
      }
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });

    const { wrapper } = await mountGrammarPointPage();

    expect(wrapper.find(".detail-error").text()).toContain("model failed");
    expect(wrapper.find(".retry-link").exists()).toBe(true);
  });
});

describe("TeachingPage vocab list", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
    setLocale("en", { persist: false });

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
          { id: 2, word: "adios", mastery: 1 },
          { id: 3, word: "gracias", mastery: 2 },
        ]);
      }
      if (cmd === "translate_word_cmd") {
        return Promise.resolve({ translation: "hello", pos: "interj" });
      }
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });
  });

  it("renders words as colored chips in paragraph layout", async () => {
    const { wrapper } = await mountTeachingPage(mockInvoke, VOCAB_NODE_ID);
    expect(wrapper.find(".word-paragraph").exists()).toBe(true);
    expect(wrapper.findAll(".word-chip")).toHaveLength(3);
    expect(wrapper.find(".chip-unseen").text()).toBe("hola");
    expect(wrapper.find(".chip-seen").text()).toBe("adios");
    expect(wrapper.find(".chip-mastered").text()).toBe("gracias");
  });

  it("opens WordPopup when a word chip is tapped", async () => {
    const { wrapper } = await mountTeachingPage(mockInvoke, VOCAB_NODE_ID);
    await wrapper.find(".word-chip").trigger("click");
    await flushPromises();
    expect(wrapper.find(".word-popup").exists()).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("translate_word_cmd", {
      word: "hola",
      context: "hola",
      sourceLang: "es",
      nativeLang: "zh",
    });
  });
});
