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