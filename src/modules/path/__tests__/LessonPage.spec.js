import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";

const LessonPage = (await import("@/modules/path/LessonPage.vue")).default;

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "path", component: { template: "<div/>" } },
      {
        path: "/learn/path/:sectionId",
        name: "path-lesson",
        component: LessonPage,
      },
    ],
  });
}

describe("LessonPage choice flow", () => {
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
      if (cmd === "get_section_lesson_cmd") {
        return Promise.resolve({
          section_title_native: "Practice",
          questions: [
            {
              id: "q1",
              type: "T07",
              sourceText: "first choice",
              options: ["right", "wrong"],
              answerIdx: 0,
            },
            {
              id: "q2",
              type: "T07",
              sourceText: "second choice",
              options: ["right", "wrong"],
              answerIdx: 0,
            },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });
  });

  it("advances directly after a correct choice is checked", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: "U01-S01" } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("first choice");
    await wrapper.findAll(".option-btn")[0].trigger("click");
    await wrapper.find(".action-btn.primary").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("second choice");
    expect(wrapper.find(".feedback").exists()).toBe(false);
  });
});
