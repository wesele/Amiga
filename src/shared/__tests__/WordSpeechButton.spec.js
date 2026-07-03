import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import WordSpeechButton from "@/shared/components/WordSpeechButton.vue";
import * as wordSpeech from "@/shared/wordSpeech.js";

describe("WordSpeechButton", () => {
  it("renders a speech button when synthesis is available", () => {
    vi.spyOn(wordSpeech, "isSpeechSynthesisAvailable").mockReturnValue(true);

    const wrapper = mount(WordSpeechButton, {
      props: {
        word: "hospital",
        language: "es",
        ariaLabel: "Play pronunciation",
      },
    });

    const btn = wrapper.find(".word-speech-btn");
    expect(btn.exists()).toBe(true);
    expect(btn.attributes("aria-label")).toBe("Play pronunciation");
    expect(btn.text()).toContain("🔊");
  });

  it("hides the button when synthesis is unavailable", () => {
    vi.spyOn(wordSpeech, "isSpeechSynthesisAvailable").mockReturnValue(false);

    const wrapper = mount(WordSpeechButton, {
      props: {
        word: "hospital",
        language: "es",
        ariaLabel: "Play pronunciation",
      },
    });

    expect(wrapper.find(".word-speech-btn").exists()).toBe(false);
  });

  it("speaks the word when clicked", async () => {
    vi.spyOn(wordSpeech, "isSpeechSynthesisAvailable").mockReturnValue(true);
    const speakWord = vi.spyOn(wordSpeech, "speakWord").mockResolvedValue(true);

    const wrapper = mount(WordSpeechButton, {
      props: {
        word: "hospital",
        language: "es",
        ariaLabel: "Play pronunciation",
      },
    });

    await wrapper.find(".word-speech-btn").trigger("click");
    expect(speakWord).toHaveBeenCalledWith("hospital", "es", { rate: 1 });
  });
});