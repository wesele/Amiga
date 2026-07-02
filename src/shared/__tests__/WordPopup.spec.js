import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";
import * as wordSpeech from "@/shared/wordSpeech.js";
import WordPopup from "@/shared/components/WordPopup.vue";

describe("WordPopup", () => {
  beforeEach(() => {
    setLocale("zh", { persist: false });
    vi.spyOn(wordSpeech, "isSpeechSynthesisAvailable").mockReturnValue(true);
    api.__setInvoke(
      vi.fn().mockImplementation((cmd) => {
        if (cmd === "translate_word_cmd") {
          return Promise.resolve({
            translation: "医院",
            pos: "n.",
            ipa: "/ospiˈtal/",
          });
        }
        return Promise.resolve(null);
      }),
    );
  });

  it("shows a pronunciation button beside the source word", async () => {
    const wrapper = mount(WordPopup, {
      props: {
        word: "hospital",
        sourceLang: "es",
        nativeLang: "zh",
      },
    });
    await flushPromises();

    const speechBtn = wrapper.find(".word-speech-btn");
    expect(speechBtn.exists()).toBe(true);
    expect(speechBtn.attributes("aria-label")).toBe("播放发音");
    expect(wrapper.find(".popup-word").text()).toBe("hospital");
  });
});