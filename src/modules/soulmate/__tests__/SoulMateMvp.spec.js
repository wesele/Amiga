import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";
import SoulMateChat from "../SoulMateChat.vue";
import SoulMateHome from "../SoulMateHome.vue";
import SoulMateSetup from "../SoulMateSetup.vue";
import SoulMateStory from "../SoulMateStory.vue";

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn", name: "learn", component: { template: "<div />" } },
      { path: "/learn/soulmate", name: "soulmate", component: SoulMateHome },
      { path: "/learn/soulmate/setup", name: "soulmate-setup", component: SoulMateSetup },
      { path: "/learn/soulmate/story/:episodeId", name: "soulmate-story", component: SoulMateStory, props: true },
      { path: "/learn/soulmate/chat/:episodeId", name: "soulmate-chat", component: SoulMateChat, props: true },
    ],
  });
}

function baseInvoke(command) {
  if (command === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
  if (command === "get_target_language_cmd") return Promise.resolve("es");
  if (command === "get_learning_goals_cmd") return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
  return Promise.resolve(null);
}

describe("Soul Mate MVP", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn(baseInvoke);
    api.__setInvoke(mockInvoke);
  });

  it("initializes a Soul Mate after the three-step wizard", async () => {
    mockInvoke.mockImplementation((command, args) => {
      if (command === "initialize_soulmate_cmd") return Promise.resolve({ id: "w1", ...args.request });
      return baseInvoke(command);
    });
    const router = makeRouter();
    await router.push({ name: "soulmate-setup" });
    const wrapper = mount(SoulMateSetup, {
      global: { plugins: [router], stubs: { PageHeader: { template: "<header />" } } },
    });
    await flushPromises();

    await wrapper.find(".primary-btn").trigger("click");
    await wrapper.find(".primary-btn").trigger("click");
    await wrapper.find(".primary-btn").trigger("click");
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith(
      "initialize_soulmate_cmd",
      expect.objectContaining({
        request: expect.objectContaining({
          user_id: "u1",
          companion_type: "soul",
          target_lang: "es",
          cefr_level: "A1",
        }),
      }),
    );
    expect(router.currentRoute.value.name).toBe("soulmate");
  });

  it("uses the magic-wand action to generate today's first story", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_soulmate_home_cmd") {
        return Promise.resolve({
          initialized: true,
          greeting: "Te estaba esperando.",
          state: "story_available",
          episode_id: null,
          day_number: 0,
          world: {
            companion_name: "Sofía",
            companion_gender: "female",
            relationship_stage: "new",
          },
        });
      }
      if (command === "generate_soulmate_episode_cmd") return Promise.resolve({ id: "e1" });
      return baseInvoke(command);
    });
    const router = makeRouter();
    await router.push({ name: "soulmate" });
    const wrapper = mount(SoulMateHome, {
      global: { plugins: [router], stubs: { PageHeader: { template: "<header />" } } },
    });
    await flushPromises();

    expect(wrapper.find(".story-action").text()).toContain("今日故事");
    await wrapper.find(".story-action").trigger("click");
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith("generate_soulmate_episode_cmd", { userId: "u1" });
    expect(router.currentRoute.value.name).toBe("soulmate-story");
  });

  it("marks a finished story and returns to the Soul Mate home", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_soulmate_episode_cmd") {
        return Promise.resolve({ id: "e1", day_number: 1, title: "La llave", teaser: "Una pista", body: "Una historia completa." });
      }
      if (command === "mark_soulmate_story_read_cmd") return Promise.resolve({ id: "e1", status: "read" });
      return baseInvoke(command);
    });
    const router = makeRouter();
    await router.push({ name: "soulmate-story", params: { episodeId: "e1" } });
    const wrapper = mount(SoulMateStory, {
      props: { episodeId: "e1" },
      global: { plugins: [router], stubs: { PageHeader: { template: "<header />" } } },
    });
    await flushPromises();

    await wrapper.find(".finish-btn").trigger("click");
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith("mark_soulmate_story_read_cmd", { episodeId: "e1" });
    expect(router.currentRoute.value.name).toBe("soulmate");
  });

  it("opens the news-style translation popup when a story word is tapped", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_soulmate_episode_cmd") {
        return Promise.resolve({
          id: "e1",
          day_number: 1,
          title: "La llave",
          teaser: "Una pista",
          body: "Una llave antigua.",
        });
      }
      if (command === "translate_word_cmd") {
        return Promise.resolve({ translation: "一把古老的钥匙", pos: "noun" });
      }
      return baseInvoke(command);
    });
    const router = makeRouter();
    await router.push({ name: "soulmate-story", params: { episodeId: "e1" } });
    const wrapper = mount(SoulMateStory, {
      props: { episodeId: "e1" },
      global: { plugins: [router], stubs: { PageHeader: { template: "<header />" } } },
    });
    await flushPromises();

    expect(wrapper.findAll("article .word").map((word) => word.text())).toEqual([
      "Una",
      "llave",
      "antigua",
    ]);
    await wrapper.findAll("article .word")[1].trigger("click");
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith("translate_word_cmd", {
      word: "llave",
      context: "Una llave antigua.",
      sourceLang: "es",
      nativeLang: "zh",
    });
    expect(wrapper.find(".word-popup").text()).toContain("一把古老的钥匙");
  });

  it("loads story chat and sends a learner reply", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_soulmate_home_cmd") {
        return Promise.resolve({ world: { companion_name: "Sofía" } });
      }
      if (command === "get_soulmate_chat_cmd") {
        return Promise.resolve([{ id: 1, role: "assistant", content: "¿Qué harías tú?" }]);
      }
      if (command === "submit_soulmate_turn_cmd") {
        return Promise.resolve({ id: 3, role: "assistant", content: "Buena idea." });
      }
      return baseInvoke(command);
    });
    const router = makeRouter();
    await router.push({ name: "soulmate-chat", params: { episodeId: "e1" } });
    const wrapper = mount(SoulMateChat, {
      props: { episodeId: "e1" },
      global: { plugins: [router], stubs: { PageHeader: { template: "<header />" } } },
    });
    await flushPromises();

    await wrapper.find(".input-bar input").setValue("Yo buscaría la estación.");
    await wrapper.find(".input-bar").trigger("submit");
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith("submit_soulmate_turn_cmd", {
      userId: "u1",
      episodeId: "e1",
      message: "Yo buscaría la estación.",
    });
    expect(wrapper.text()).toContain("Buena idea.");
  });
});
