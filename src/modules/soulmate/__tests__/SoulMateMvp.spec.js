import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";
import SoulMateChat from "../SoulMateChat.vue";
import SoulMateHome from "../SoulMateHome.vue";
import SoulMateSetup from "../SoulMateSetup.vue";
import SoulMateSettings from "../SoulMateSettings.vue";
import SoulMateStory from "../SoulMateStory.vue";

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn", name: "learn", component: { template: "<div />" } },
      { path: "/learn/soulmate", name: "soulmate", component: SoulMateHome },
      { path: "/learn/soulmate/setup", name: "soulmate-setup", component: SoulMateSetup },
      { path: "/profile/soulmate", name: "soulmate-settings", component: SoulMateSettings },
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

  it("loads and updates existing Soul Mate settings", async () => {
    mockInvoke.mockImplementation((command, args) => {
      if (command === "get_soulmate_world_cmd") {
        return Promise.resolve({
          companion_type: "explore",
          companion_name: "Sofía",
          companion_gender: "female",
          personality: "curious",
          story_location: "Madrid",
          intensity: 2,
          romance_tension: 1,
          surprise: 3,
          knowledge: 2,
        });
      }
      if (command === "get_all_prompts_cmd") {
        return Promise.resolve([
          {
            key: "soulmate-story",
            name: "灵伴每日来信",
            category: "灵伴",
            system_prompt: "Write letters.",
            user_prompt_template: "Day {{DAY}}",
          },
          {
            key: "rewrite-article",
            name: "新闻文章改写",
            category: "学习功能",
            system_prompt: "Rewrite.",
            user_prompt_template: "Text",
          },
          {
            key: "soulmate-greeting",
            name: "灵伴动态问候",
            category: "灵伴",
            system_prompt: "Greet warmly.",
            user_prompt_template: "State {{STATE}}",
          },
        ]);
      }
      if (command === "update_soulmate_cmd") return Promise.resolve(args.request);
      return baseInvoke(command);
    });
    const router = makeRouter();
    await router.push({ name: "soulmate-settings" });
    const wrapper = mount(SoulMateSettings, {
      global: {
        plugins: [router],
        stubs: { PageHeader: { template: "<header />" }, Teleport: true },
      },
    });
    await flushPromises();

    expect(wrapper.find('.field-label input[maxlength="24"]').element.value).toBe("Sofía");
    expect(wrapper.text()).toContain("大模型提示词");
    expect(wrapper.text()).toContain("灵伴动态问候");
    expect(wrapper.text()).toContain("灵伴每日来信");
    expect(wrapper.text()).not.toContain("新闻文章改写");
    await wrapper.find('.field-label input[maxlength="24"]').setValue("Luna");
    await wrapper.findAll('.slider-row input[type="range"]')[0].setValue("3");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith("update_soulmate_cmd", {
      request: {
        user_id: "u1",
        companion_type: "explore",
        companion_name: "Luna",
        companion_gender: "female",
        personality: "curious",
        story_location: "Madrid",
        intensity: 3,
        romance_tension: 1,
        surprise: 3,
        knowledge: 2,
        target_lang: "es",
        native_lang: "zh",
        cefr_level: "A1",
      },
    });
    expect(wrapper.text()).toContain("灵伴设置已保存");
  });

  it("edits and saves a Soul Mate LLM prompt from settings", async () => {
    mockInvoke.mockImplementation((command, args) => {
      if (command === "get_soulmate_world_cmd") {
        return Promise.resolve({
          companion_type: "soul",
          companion_name: "Sofía",
          companion_gender: "female",
          personality: "warm",
          story_location: "Madrid",
          intensity: 2,
          romance_tension: 1,
          surprise: 2,
          knowledge: 2,
        });
      }
      if (command === "get_all_prompts_cmd") {
        return Promise.resolve([
          {
            key: "soulmate-story",
            name: "灵伴每日来信",
            category: "灵伴",
            system_prompt: "Write letters.",
            user_prompt_template: "Day {{DAY}}",
          },
        ]);
      }
      if (command === "save_prompt_cmd") return Promise.resolve(undefined);
      return baseInvoke(command);
    });
    const router = makeRouter();
    await router.push({ name: "soulmate-settings" });
    const wrapper = mount(SoulMateSettings, {
      global: {
        plugins: [router],
        stubs: { PageHeader: { template: "<header />" }, Teleport: true },
      },
    });
    await flushPromises();

    await wrapper.find(".prompt-header").trigger("click");
    await flushPromises();
    const textareas = wrapper.findAll(".prompt-textarea");
    expect(textareas.length).toBe(2);
    await textareas[0].setValue("Write warmer letters.");
    await wrapper.find(".prompt-save-btn").trigger("click");
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith(
      "save_prompt_cmd",
      expect.objectContaining({
        key: "soulmate-story",
        systemPrompt: "Write warmer letters.",
        userPromptTemplate: "Day {{DAY}}",
      }),
    );
    expect(wrapper.text()).toContain("提示词已保存");
  });

  it("resets Soul Mate from the settings page", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_soulmate_world_cmd") {
        return Promise.resolve({
          companion_type: "soul",
          companion_name: "Sofía",
          companion_gender: "female",
          personality: "warm",
          story_location: "Madrid",
          intensity: 2,
          romance_tension: 1,
          surprise: 2,
          knowledge: 2,
        });
      }
      if (command === "reset_soulmate_cmd") return Promise.resolve(true);
      return baseInvoke(command);
    });
    const router = makeRouter();
    await router.push({ name: "soulmate-settings" });
    const wrapper = mount(SoulMateSettings, {
      global: {
        plugins: [router],
        stubs: { PageHeader: { template: "<header />" }, Teleport: true },
      },
    });
    await flushPromises();

    await wrapper.find(".reset-btn").trigger("click");
    await wrapper.find(".confirm-btn.confirm").trigger("click");
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith("reset_soulmate_cmd", {
      userId: "u1",
      targetLang: "es",
    });
    expect(router.currentRoute.value.name).toBe("soulmate-setup");
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

    expect(wrapper.find(".story-action").text()).toContain("今日来信");
    expect(wrapper.find(".soulmate-home").classes()).toContain("gender-female");
    expect(wrapper.find(".portrait-image").attributes("src")).toContain(
      "companion-female.jpg",
    );
    // Cached images may fire load before the listener is attached; force ready.
    await wrapper.find(".portrait-image").trigger("load");
    expect(wrapper.find(".portrait-image").classes()).toContain("ready");
    await wrapper.find(".story-action").trigger("click");
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith("generate_soulmate_episode_cmd", {
      userId: "u1",
      targetLang: "es",
    });
    expect(router.currentRoute.value.name).toBe("soulmate-story");
  });

  it("uses a male companion background when gender is male", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_soulmate_home_cmd") {
        return Promise.resolve({
          initialized: true,
          greeting: "Te estaba esperando.",
          state: "story_available",
          episode_id: null,
          day_number: 1,
          world: {
            companion_name: "Leo",
            companion_gender: "male",
            relationship_stage: "new",
          },
        });
      }
      return baseInvoke(command);
    });
    const router = makeRouter();
    await router.push({ name: "soulmate" });
    const wrapper = mount(SoulMateHome, {
      global: { plugins: [router], stubs: { PageHeader: { template: "<header />" } } },
    });
    await flushPromises();

    expect(wrapper.find(".soulmate-home").classes()).toContain("gender-male");
    expect(wrapper.find(".portrait-image").attributes("src")).toContain(
      "companion-male.jpg",
    );
  });

  it("does not show a default companion portrait while home is loading", async () => {
    let resolveHome;
    mockInvoke.mockImplementation((command) => {
      if (command === "get_soulmate_home_cmd") {
        return new Promise((resolve) => {
          resolveHome = resolve;
        });
      }
      return baseInvoke(command);
    });
    const router = makeRouter();
    await router.push({ name: "soulmate" });
    const wrapper = mount(SoulMateHome, {
      global: { plugins: [router], stubs: { PageHeader: { template: "<header />" } } },
    });
    await flushPromises();

    expect(wrapper.find(".portrait-image").exists()).toBe(false);
    expect(wrapper.find(".soulmate-home").classes()).toContain("gender-pending");

    resolveHome({
      initialized: true,
      greeting: "Hola",
      state: "story_available",
      episode_id: null,
      day_number: 1,
      world: {
        companion_name: "Sofía",
        companion_gender: "female",
        relationship_stage: "new",
      },
    });
    await flushPromises();

    expect(wrapper.find(".portrait-image").attributes("src")).toContain(
      "companion-female.jpg",
    );
    expect(wrapper.find(".soulmate-home").classes()).toContain("gender-female");
  });

  it("keeps free-text chat input when not in TV mode", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_soulmate_world_cmd") {
        return Promise.resolve({ companion_name: "Sofía" });
      }
      if (command === "get_soulmate_chat_cmd") {
        return Promise.resolve([
          { id: 1, role: "assistant", content: "¿Qué te pareció?", created_at: "t1" },
        ]);
      }
      return baseInvoke(command);
    });
    const router = makeRouter();
    await router.push({ name: "soulmate-chat", params: { episodeId: "e1" } });
    const wrapper = mount(SoulMateChat, {
      props: { episodeId: "e1" },
      global: {
        plugins: [router],
        stubs: { PageHeader: { template: "<header />" }, WordPopup: true, Transition: false },
      },
    });
    await flushPromises();

    expect(wrapper.find(".input-bar").exists()).toBe(true);
    expect(wrapper.find(".reply-options").exists()).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "get_soulmate_reply_options_cmd",
      expect.anything(),
    );
  });

  it("loads the home for the current target language and sends setup when missing", async () => {
    mockInvoke.mockImplementation((command, args) => {
      if (command === "get_target_language_cmd") return Promise.resolve("en");
      if (command === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "en", cefr_level: "A1" }]);
      }
      if (command === "get_soulmate_home_cmd") {
        expect(args).toMatchObject({ userId: "u1", targetLang: "en" });
        return Promise.resolve({
          initialized: false,
          world: null,
          greeting: "",
          state: "uninitialized",
          episode_id: null,
          day_number: 0,
        });
      }
      return baseInvoke(command);
    });
    const router = makeRouter();
    await router.push({ name: "soulmate" });
    mount(SoulMateHome, {
      global: { plugins: [router], stubs: { PageHeader: { template: "<header />" } } },
    });
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith("get_soulmate_home_cmd", {
      userId: "u1",
      targetLang: "en",
    });
    expect(router.currentRoute.value.name).toBe("soulmate-setup");
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

  it("handles the Android Amiga selection action in a letter", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_soulmate_episode_cmd") {
        return Promise.resolve({ id: "e1", day_number: 1, title: "Una carta", teaser: "Para ti", body: "Tengo algo que contarte." });
      }
      if (command === "translate_text_cmd") return Promise.resolve("我有件事想告诉你。");
      return baseInvoke(command);
    });
    const router = makeRouter();
    await router.push({ name: "soulmate-story", params: { episodeId: "e1" } });
    const wrapper = mount(SoulMateStory, {
      props: { episodeId: "e1" },
      global: { plugins: [router], stubs: { PageHeader: { template: "<header />" } } },
    });
    await flushPromises();

    window.__amigaTranslateSelection("Tengo algo que contarte");
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith("translate_text_cmd", {
      text: "Tengo algo que contarte",
      sourceLang: "es",
      nativeLang: "zh",
    });
    expect(wrapper.find(".sel-result").text()).toBe("我有件事想告诉你。");
    wrapper.unmount();
    expect(window.__amigaTranslateSelection).toBeUndefined();
  });

  it("lets the companion speak first on chat entry, then sends a learner reply", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_soulmate_world_cmd") {
        return Promise.resolve({ companion_name: "Sofía" });
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

    expect(wrapper.find(".message-row.role-assistant .bubble").text()).toBe("¿Qué harías tú?");
    expect(wrapper.find(".input-bar input").element.value).toBe("");

    await wrapper.find(".input-bar input").setValue("Yo buscaría la estación.");
    await wrapper.find(".input-bar").trigger("submit");
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith("submit_soulmate_turn_cmd", {
      userId: "u1",
      targetLang: "es",
      episodeId: "e1",
      message: "Yo buscaría la estación.",
    });
    expect(wrapper.text()).toContain("Buena idea.");
  });

  it("scrolls to the latest message after chat history finishes rendering", async () => {
    const scrollPositions = new WeakMap();
    const scrollTopDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight");
    Object.defineProperty(Element.prototype, "scrollTop", {
      configurable: true,
      get() { return scrollPositions.get(this) || 0; },
      set(value) { scrollPositions.set(this, value); },
    });
    Object.defineProperty(Element.prototype, "scrollHeight", {
      configurable: true,
      get() { return this.querySelector?.(".message-row") ? 900 : 20; },
    });
    try {
      mockInvoke.mockImplementation((command) => {
        if (command === "get_soulmate_world_cmd") {
          return Promise.resolve({ companion_name: "Sofía" });
        }
        if (command === "get_soulmate_chat_cmd") {
          return Promise.resolve([
            { id: 1, role: "assistant", content: "Primero" },
            { id: 2, role: "user", content: "Después" },
          ]);
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
      await new Promise((resolve) => setTimeout(resolve, 50));

      const list = wrapper.find(".message-list").element;
      expect(list.querySelectorAll(".message-row")).toHaveLength(2);
      expect(list.scrollTop).toBe(900);
    } finally {
      if (scrollTopDescriptor) {
        Object.defineProperty(Element.prototype, "scrollTop", scrollTopDescriptor);
      } else {
        delete Element.prototype.scrollTop;
      }
      if (scrollHeightDescriptor) {
        Object.defineProperty(Element.prototype, "scrollHeight", scrollHeightDescriptor);
      } else {
        delete Element.prototype.scrollHeight;
      }
    }
  });

  it("keeps the same message position above the keyboard when the viewport shrinks", async () => {
    let resizeHandler;
    const viewport = {
      height: 700,
      addEventListener: vi.fn((event, handler) => {
        if (event === "resize") resizeHandler = handler;
      }),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
    let animationFrame;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback) => {
      animationFrame = callback;
      return 1;
    }));
    mockInvoke.mockImplementation((command) => {
      if (command === "get_soulmate_home_cmd") {
        return Promise.resolve({ world: { companion_name: "Sofía" } });
      }
      if (command === "get_soulmate_chat_cmd") {
        return Promise.resolve([{ id: 1, role: "assistant", content: "¿Qué harías tú?" }]);
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

    const list = wrapper.find(".message-list").element;
    let clientHeight = 400;
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(list, "clientHeight", { configurable: true, get: () => clientHeight });
    list.scrollTop = 350;
    await wrapper.find(".input-bar input").trigger("focus");

    clientHeight = 200;
    viewport.height = 500;
    resizeHandler();
    animationFrame();

    expect(list.scrollTop).toBe(550);
  });

  it("opens the news-style translation popup when a chat word is tapped", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "get_soulmate_home_cmd") {
        return Promise.resolve({ world: { companion_name: "Sofía" } });
      }
      if (command === "get_soulmate_chat_cmd") {
        return Promise.resolve([{ id: 1, role: "assistant", content: "¿Qué harías tú?" }]);
      }
      if (command === "translate_word_cmd") {
        return Promise.resolve({ translation: "做", pos: "verb" });
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

    expect(wrapper.findAll(".message-word").map((word) => word.text())).toEqual([
      "Qué",
      "harías",
      "tú",
    ]);
    await wrapper.findAll(".message-word")[1].trigger("click");
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith("translate_word_cmd", {
      word: "harías",
      context: "¿Qué harías tú?",
      sourceLang: "es",
      nativeLang: "zh",
    });
    expect(wrapper.find(".word-popup").text()).toContain("做");
  });

  it("keeps the chat input at the shell-owned safe-area boundary", () => {
    const source = readFileSync(resolve(__dirname, "../SoulMateChat.vue"), "utf8");
    const inputBarCss = source.match(/\.input-bar\s*\{[^}]+\}/);

    expect(inputBarCss).toBeTruthy();
    expect(inputBarCss[0]).toMatch(/padding:\s*10px 12px/);
    expect(inputBarCss[0]).not.toContain("--safe-bottom");
  });
});
