import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";

const TeachingPage = (await import("@/modules/path/TeachingPage.vue")).default;

const GRAMMAR_NODE_ID = "zh-es/U01-GRAMMAR";
const GRAMMAR_POINT =
  "ser 和 estar 的基本区别：ser 用于描述永久特征，estar 用于描述临时状态";

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
        path: "/learn/path/lesson/:sectionId",
        name: "path-lesson",
        component: { template: "<div class='lesson-page'/>" },
      },
      {
        path: "/chat/:sessionId",
        name: "chat-session",
        component: { template: "<div class='chat-page'/>" },
      },
    ],
  });
}

function teachingContent() {
  return {
    node_id: GRAMMAR_NODE_ID,
    kind: "grammar",
    unit_id: "U01",
    unit_title_native: "基础问候与自我介绍",
    unit_title_target: "Saludos y presentación personal",
    goal_native: "掌握基础问候用语",
    grammar_points: [GRAMMAR_POINT],
    words: [],
    scenarios: ["初次见面打招呼"],
  };
}

async function mountTeachingPage(mockInvoke) {
  const router = makeRouter();
  await router.push({ name: "path-teaching", params: { nodeId: GRAMMAR_NODE_ID } });
  await router.isReady();
  const wrapper = mount(TeachingPage, {
    global: { plugins: [router] },
  });
  await flushPromises();
  return wrapper;
}

describe("TeachingPage grammar explain", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
    setLocale("zh", { persist: false });

    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") {
        return Promise.resolve("es");
      }
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_teaching_content_cmd") {
        return Promise.resolve(teachingContent());
      }
      if (cmd === "get_grammar_explanation_cached_cmd") {
        return Promise.resolve(null);
      }
      if (cmd === "explain_grammar_point_cmd") {
        return Promise.resolve({
          explanation: "1. Ser 表示永久特征。\n2. Estar 表示临时状态。",
          from_cache: false,
        });
      }
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });
  });

  it("loads grammar points and shows LLM explanation after tap", async () => {
    const wrapper = await mountTeachingPage(mockInvoke);
    expect(wrapper.text()).toContain(GRAMMAR_POINT);

    const pointBtn = wrapper.find(".point-btn");
    await pointBtn.trigger("click");
    await flushPromises();

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
      unitTitle: "基础问候与自我介绍",
      unitGoal: "掌握基础问候用语",
    });
    expect(wrapper.find(".detail-body").text()).toContain("Ser 表示永久特征");
    expect(wrapper.find(".detail-loading").exists()).toBe(false);
  });

  it("uses cached explanation without calling explain when cache hits", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_teaching_content_cmd") {
        return Promise.resolve(teachingContent());
      }
      if (cmd === "get_grammar_explanation_cached_cmd") {
        return Promise.resolve("缓存讲解内容");
      }
      if (cmd === "explain_grammar_point_cmd") {
        return Promise.reject(new Error("should not call explain when cache exists"));
      }
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });

    const wrapper = await mountTeachingPage(mockInvoke);
    await wrapper.find(".point-btn").trigger("click");
    await flushPromises();

    expect(wrapper.find(".detail-body").text()).toContain("缓存讲解内容");
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
        return Promise.resolve(teachingContent());
      }
      if (cmd === "get_grammar_explanation_cached_cmd") {
        return Promise.resolve(null);
      }
      if (cmd === "explain_grammar_point_cmd") {
        return Promise.reject("大模型未返回讲解内容，请重试或检查模型配置");
      }
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });

    const wrapper = await mountTeachingPage(mockInvoke);
    await wrapper.find(".point-btn").trigger("click");
    await flushPromises();

    expect(wrapper.find(".detail-error").text()).toContain("大模型未返回讲解内容");
    expect(wrapper.find(".retry-link").exists()).toBe(true);
    expect(wrapper.find(".detail-loading").exists()).toBe(false);
  });
});

const VOCAB_NODE_ID = "zh-es/U01-VOCAB";

function vocabTeachingContent() {
  return {
    node_id: VOCAB_NODE_ID,
    kind: "vocab",
    unit_id: "U01",
    unit_title_native: "基础问候与自我介绍",
    unit_title_target: "Saludos y presentación personal",
    goal_native: "掌握基础问候用语",
    grammar_points: [],
    words: [
      { word: "hola", definition_zh: "你好" },
      { word: "adiós", definition_zh: "再见" },
      { word: "gracias", definition_zh: "谢谢" },
    ],
    scenarios: [],
  };
}

async function mountVocabTeachingPage(mockInvoke) {
  const router = makeRouter();
  await router.push({ name: "path-teaching", params: { nodeId: VOCAB_NODE_ID } });
  await router.isReady();
  const wrapper = mount(TeachingPage, {
    global: { plugins: [router] },
  });
  await flushPromises();
  return wrapper;
}

describe("TeachingPage vocab list", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
    setLocale("zh", { persist: false });

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
        ]);
      }
      if (cmd === "translate_word_cmd") {
        return Promise.resolve({ translation: "你好", pos: "interj" });
      }
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });
  });

  it("renders words as colored chips in grid layout with mastery legend", async () => {
    const wrapper = await mountVocabTeachingPage(mockInvoke);
    expect(wrapper.find(".word-grid").exists()).toBe(true);
    expect(wrapper.find(".word-paragraph").exists()).toBe(false);
    expect(wrapper.find(".mastery-legend").exists()).toBe(true);
    expect(wrapper.text()).toContain("新词");
    expect(wrapper.text()).toContain("见过");
    expect(wrapper.text()).toContain("已掌握");
    expect(wrapper.findAll(".word-chip")).toHaveLength(3);
    expect(wrapper.find(".chip-unseen").text()).toContain("hola");
    expect(wrapper.find(".chip-seen").text()).toContain("adiós");
    expect(wrapper.find(".chip-mastered").text()).toContain("gracias");
  });

  it("opens WordPopup when a word chip is tapped", async () => {
    const wrapper = await mountVocabTeachingPage(mockInvoke);
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

function completeTeachingResult(overrides = {}) {
  return {
    passed: true,
    stars: 1,
    best_score: 100,
    next_section_id: "zh-es/U01-VOCAB",
    level_upgraded: false,
    streak_extended: false,
    streak_current: 0,
    daily_goal_just_met: false,
    daily_goal_lessons_today: 1,
    daily_goal_target: 3,
    weekly_goal_active_days: 2,
    weekly_goal_target_days: 5,
    ...overrides,
  };
}

function postTeachingInvoke(cmd, extra = {}) {
  if (cmd === "get_current_user") {
    return Promise.resolve({ id: "u1", native_language: "zh" });
  }
  if (cmd === "get_target_language_cmd") return Promise.resolve("es");
  if (cmd === "get_learning_goals_cmd") {
    return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
  }
  if (cmd === "get_unknown_words_cmd") {
    return Promise.resolve(extra.unknownWords ?? []);
  }
  if (cmd === "get_articles_cmd") {
    return Promise.resolve(extra.articles ?? []);
  }
  if (cmd === "get_articles_reading_status_cmd") {
    return Promise.resolve([]);
  }
  return null;
}

describe("TeachingPage completion flow", () => {
  let mockInvoke;
  let router;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
    setLocale("zh", { persist: false });
    router = makeRouter();
  });

  async function finishGrammarTeaching(resultOverrides = {}, ctx = {}) {
    mockInvoke.mockImplementation((cmd) => {
      const handled = postTeachingInvoke(cmd, ctx);
      if (handled) return handled;
      if (cmd === "get_teaching_content_cmd") {
        return Promise.resolve(teachingContent());
      }
      if (cmd === "complete_teaching_node_cmd") {
        return Promise.resolve(completeTeachingResult(resultOverrides));
      }
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });

    await router.push({ name: "path-teaching", params: { nodeId: GRAMMAR_NODE_ID } });
    await router.isReady();
    const wrapper = mount(TeachingPage, { global: { plugins: [router] } });
    await flushPromises();
    await wrapper.find(".action-btn.primary").trigger("click");
    await flushPromises();
    return { wrapper, router };
  }

  async function finishVocabTeaching(resultOverrides = {}, ctx = {}) {
    mockInvoke.mockImplementation((cmd) => {
      const handled = postTeachingInvoke(cmd, ctx);
      if (handled) return handled;
      if (cmd === "get_teaching_content_cmd") {
        return Promise.resolve(vocabTeachingContent());
      }
      if (cmd === "get_user_vocab_by_level_cmd") {
        return Promise.resolve([]);
      }
      if (cmd === "complete_teaching_node_cmd") {
        return Promise.resolve(
          completeTeachingResult({
            next_section_id: "zh-es/U01-PRACTICE",
            ...resultOverrides,
          }),
        );
      }
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });

    await router.push({ name: "path-teaching", params: { nodeId: VOCAB_NODE_ID } });
    await router.isReady();
    const wrapper = mount(TeachingPage, { global: { plugins: [router] } });
    await flushPromises();
    await wrapper.find(".action-btn.primary").trigger("click");
    await flushPromises();
    return { wrapper, router };
  }

  it("shows grammar AI practice in next-steps and opens chat on click", async () => {
    const { wrapper, router } = await finishGrammarTeaching();
    expect(wrapper.text()).toContain("和 Amiga 练刚学的语法");

    const grammarStep = wrapper
      .findAll(".next-steps-queue-item")
      .find((item) => item.text().includes("和 Amiga 练刚学的语法"));
    expect(grammarStep).toBeTruthy();

    mockInvoke.mockImplementation((cmd) => {
      const handled = postTeachingInvoke(cmd);
      if (handled) return handled;
      if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
      if (cmd === "create_chat_session_cmd") return Promise.resolve("session-1");
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });

    await grammarStep.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("chat-session");
    expect(router.currentRoute.value.query.starterId).toBe("grammar-practice");
    expect(router.currentRoute.value.query.from).toBe("grammar");
  });

  it("shows grammar summary and routes to vocab on continue", async () => {
    const { wrapper, router } = await finishGrammarTeaching();
    expect(wrapper.find(".summary-title").text()).toContain("语法预习完成");
    expect(wrapper.find(".next-steps-panel").exists()).toBe(true);
    expect(wrapper.text()).toContain("继续学词汇");
    expect(wrapper.text()).toContain("基础问候与自我介绍");

    await wrapper.find(".action-btn.primary").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("path-teaching");
    expect(router.currentRoute.value.params.nodeId).toBe("zh-es/U01-VOCAB");
  });

  it("shows vocab summary with word chips and routes to practice", async () => {
    const { wrapper, router } = await finishVocabTeaching();
    expect(wrapper.find(".summary-title").text()).toContain("词汇预习完成");
    expect(wrapper.find(".next-steps-panel").exists()).toBe(true);
    expect(wrapper.text()).toContain("开始练习");
    expect(wrapper.text()).toContain("接下来练习会用到这些词");
    expect(wrapper.findAll(".summary-word-chip")).toHaveLength(3);

    await wrapper.find(".action-btn.primary").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("path-lesson");
    expect(router.currentRoute.value.params.sectionId).toBe("zh-es/U01-PRACTICE");
  });

  it("returns to path map via later CTA", async () => {
    const { wrapper, router } = await finishGrammarTeaching();
    expect(wrapper.text()).toContain("稍后再说");
    await wrapper.find(".action-btn.secondary").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("path");
  });

  it("shows level-up celebration with daily goal primary instead of next node", async () => {
    const { wrapper, router } = await finishGrammarTeaching({
      next_section_id: "zh-es/U02-GRAMMAR",
      level_upgraded: true,
      new_cefr_level: "A2",
    });
    expect(wrapper.text()).toContain("已升级到 A2");
    expect(wrapper.text()).not.toContain("继续学词汇");
    expect(wrapper.text()).toContain("还差");
    await wrapper.find(".action-btn.primary").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("path");
  });

  it("lists due todos in the next-steps queue while next node stays primary", async () => {
    const { wrapper } = await finishGrammarTeaching(
      {},
      {
        unknownWords: [{ id: 1, word: "hola" }],
      },
    );
    expect(wrapper.text()).toContain("待办");
    expect(wrapper.text()).toContain("复习");
  });

  it("shows streak and daily goal celebration banners", async () => {
    const { wrapper } = await finishGrammarTeaching({
      streak_extended: true,
      streak_current: 5,
      daily_goal_just_met: true,
      daily_goal_lessons_today: 3,
      daily_goal_target: 3,
    });
    expect(wrapper.text()).toContain("5 天连胜");
    expect(wrapper.text()).toContain("今日目标达成");
  });
});