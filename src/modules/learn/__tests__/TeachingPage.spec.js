import { afterEach, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { generateTopicTeachingPlan } from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";
import TeachingPage from "../TeachingPage.vue";
import { getTopicClassroom } from "../topicClassroom.js";

vi.mock("@/shared/api.js", () => ({ generateTopicTeachingPlan: vi.fn() }));

let wrapper;
afterEach(() => {
  wrapper?.unmount();
  sessionStorage.clear();
});

it("keeps a multiline problem on failure and opens the generated classroom on retry", async () => {
  setLocale("zh", { persist: false });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn", name: "learn", component: { template: "<div />" } },
      { path: "/learn/teaching", name: "learn-teaching", component: TeachingPage },
      {
        path: "/learn/teaching/:topicId",
        name: "learn-teaching-classroom",
        component: { template: "<div />" },
      },
    ],
  });
  await router.push({ name: "learn-teaching" });
  const goal = "配平下面的方程式\nH₂ + O₂ → H₂O";
  const plan = {
    kind: "topic",
    title: "配平化学方程式",
    version: "chemistry",
    learning_goal: goal,
  };
  generateTopicTeachingPlan
    .mockRejectedValueOnce(new Error("请求超时"))
    .mockResolvedValueOnce(plan);
  wrapper = mount(TeachingPage, { global: { plugins: [router] } });

  expect(wrapper.get("button[type=submit]").element.disabled).toBe(true);
  await wrapper.get("textarea").setValue(goal);
  await wrapper.get("form").trigger("submit");
  await flushPromises();
  expect(generateTopicTeachingPlan).toHaveBeenCalledWith(goal, "zh", expect.any(Function));
  expect(wrapper.get("[role=alert]").text()).toContain("请求超时");
  expect(wrapper.get("textarea").element.value).toBe(goal);
  expect(router.currentRoute.value.name).toBe("learn-teaching");

  await wrapper.get("form").trigger("submit");
  await flushPromises();
  expect(getTopicClassroom()).toEqual({ plan, session: null });
  expect(router.currentRoute.value.params.topicId).toBe("chemistry");
});
