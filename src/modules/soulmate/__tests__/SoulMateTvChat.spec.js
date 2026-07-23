import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";

vi.mock("@/shared/appMode.js", () => ({
  APP_MODE_TV: "tv",
  APP_MODE_DEFAULT: "default",
  appMode: "tv",
  isTvMode: true,
  layoutMode: "tv",
  isTvLayoutMode: true,
  resolveAppMode: () => "tv",
  applyAppMode: () => {},
}));

import SoulMateChat from "../SoulMateChat.vue";

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn/soulmate/chat/:episodeId", name: "soulmate-chat", component: SoulMateChat, props: true },
    ],
  });
}

describe("Soul Mate TV chat (option replies)", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn((command) => {
      if (command === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (command === "get_target_language_cmd") return Promise.resolve("es");
      if (command === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (command === "get_soulmate_world_cmd") {
        return Promise.resolve({ companion_name: "Sofía" });
      }
      if (command === "get_soulmate_chat_cmd") {
        return Promise.resolve([
          { id: 1, role: "assistant", content: "¿Qué te pareció la carta?", created_at: "t1" },
        ]);
      }
      if (command === "get_soulmate_reply_options_cmd") {
        return Promise.resolve(["Me gustó mucho.", "Cuéntame más.", "¿Y mañana?"]);
      }
      if (command === "submit_soulmate_turn_cmd") {
        return Promise.resolve({
          id: 2,
          role: "assistant",
          content: "Me alegra oírlo.",
          created_at: "t2",
        });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("shows reply option buttons instead of a text input on TV", async () => {
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

    expect(wrapper.classes()).toContain("tv-chat");
    expect(wrapper.find(".input-bar").exists()).toBe(false);
    expect(wrapper.findAll(".reply-option").map((node) => node.text())).toEqual([
      "Me gustó mucho.",
      "Cuéntame más.",
      "¿Y mañana?",
    ]);
    expect(mockInvoke).toHaveBeenCalledWith("get_soulmate_reply_options_cmd", {
      userId: "u1",
      targetLang: "es",
      episodeId: "e1",
    });
  });

  it("sends the chosen option and refreshes reply choices", async () => {
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

    mockInvoke.mockImplementation((command) => {
      if (command === "submit_soulmate_turn_cmd") {
        return Promise.resolve({
          id: 3,
          role: "assistant",
          content: "Genial.",
          created_at: "t3",
        });
      }
      if (command === "get_soulmate_reply_options_cmd") {
        return Promise.resolve(["De acuerdo.", "Pregúntame otra cosa."]);
      }
      return Promise.resolve(null);
    });

    await wrapper.findAll(".reply-option")[0].trigger("click");
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith("submit_soulmate_turn_cmd", {
      userId: "u1",
      targetLang: "es",
      episodeId: "e1",
      message: "Me gustó mucho.",
    });
    expect(wrapper.text()).toContain("Genial.");
    expect(wrapper.findAll(".reply-option").map((node) => node.text())).toEqual([
      "De acuerdo.",
      "Pregúntame otra cosa.",
    ]);
  });
});

describe("Soul Mate chat TV wiring (source)", () => {
  it("wires TV-layout option replies and keeps free-text for phone layout", () => {
    const source = readFileSync(resolve(__dirname, "../SoulMateChat.vue"), "utf8");
    expect(source).toMatch(/isTvLayoutMode/);
    expect(source).toMatch(/getSoulMateReplyOptions/);
    expect(source).toMatch(/v-if="!isTvLayoutMode"/);
    expect(source).toMatch(/class="reply-option"/);
    expect(source).toMatch(/sendOption/);
    expect(source).toMatch(/reply-panel/);
    expect(source).toMatch(/displayMessages/);
    // Focus only after optionsLoading is cleared so buttons are in the DOM.
    expect(source).toMatch(/focusFirstReplyOption/);
    expect(source).toMatch(/optionsLoading\.value = false/);
    expect(source).toMatch(/data-tv-preferred-focus/);
    // TV split: left transcript | right options (~1/3).
    expect(source).toMatch(/chat-body/);
    expect(source).toMatch(/\.tv-chat \.chat-body[\s\S]*flex-direction:\s*row/);
    expect(source).toMatch(/\.tv-chat \.message-list[\s\S]*flex:\s*2\s+1\s+0/);
    expect(source).toMatch(/\.tv-chat \.reply-panel[\s\S]*flex:\s*1\s+1\s+0/);
    expect(source).toMatch(/scrollBottom/);
  });
});

describe("Soul Mate home TV layout (source)", () => {
  it("uses a split layout so the CTA is never buried under the portrait on TV", () => {
    const source = readFileSync(resolve(__dirname, "../SoulMateHome.vue"), "utf8");
    expect(source).toMatch(/tv-home/);
    expect(source).toMatch(/grid-template-columns/);
    expect(source).toMatch(/actionBtn\.value\?\.focus/);
  });
});
