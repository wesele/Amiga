import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ContextSpeechControls from "@/shared/components/ContextSpeechControls.vue";

describe("ContextSpeechControls", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "speechSynthesis", {
      configurable: true,
      value: { speak: vi.fn(), cancel: vi.fn() },
    });
  });

  it("renders listen controls when visible with context text", () => {
    const wrapper = mount(ContextSpeechControls, {
      props: {
        text: "Cruzaron la frontera al amanecer.",
        language: "es",
        visible: true,
      },
    });
    const buttons = wrapper.findAll(".context-speech-btn");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].attributes("aria-label")).toBe("听整句例句");
    expect(buttons[1].attributes("aria-label")).toBe("慢速听例句");
  });

  it("hides controls when context text is empty", () => {
    const wrapper = mount(ContextSpeechControls, {
      props: {
        text: "",
        language: "es",
        visible: true,
      },
    });
    expect(wrapper.find(".context-speech-controls").exists()).toBe(false);
  });

  it("hides controls when not visible", () => {
    const wrapper = mount(ContextSpeechControls, {
      props: {
        text: "Cruzaron la frontera al amanecer.",
        language: "es",
        visible: false,
      },
    });
    expect(wrapper.find(".context-speech-controls").exists()).toBe(false);
  });
});