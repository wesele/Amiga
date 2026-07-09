import { mount, flushPromises } from "@vue/test-utils";
import WordPopup from "../WordPopup.vue";
import * as api from "../../api.js";

describe("WordPopup", () => {
  let mockInvoke;

  beforeEach(() => {
    mockInvoke = vi.fn((cmd) => {
      if (cmd === "translate_text_cmd") return Promise.resolve("你好");
      if (cmd === "translate_word_cmd") return Promise.resolve({ translation: "你好", pos: "interj" });
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });
    api.__setInvoke(mockInvoke);
  });

  afterEach(() => {
    api.__resetInvoke();
  });

  it("uses AI text translation in text mode", async () => {
    const wrapper = mount(WordPopup, {
      props: {
        word: "hola",
        context: "hola amigo",
        sourceLang: "es",
        nativeLang: "zh",
        mode: "text",
      },
    });

    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith("translate_text_cmd", {
      text: "hola",
      sourceLang: "es",
      nativeLang: "zh",
    });
    expect(mockInvoke).not.toHaveBeenCalledWith("translate_word_cmd", expect.anything());
    expect(wrapper.find(".popup-trans").text()).toBe("你好");
  });

  it("keeps dictionary translation as the default mode", async () => {
    mount(WordPopup, {
      props: {
        word: "hola",
        context: "hola amigo",
        sourceLang: "es",
        nativeLang: "zh",
      },
    });

    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith("translate_word_cmd", {
      word: "hola",
      context: "hola amigo",
      sourceLang: "es",
      nativeLang: "zh",
    });
  });

  it("hides the know/unknown buttons while the translation is loading", async () => {
    const wrapper = mount(WordPopup, {
      props: {
        word: "hola",
        context: "hola amigo",
        sourceLang: "es",
        nativeLang: "zh",
        alwaysShowActions: true,
      },
    });

    // Before the async translation resolves, only the loading spinner shows.
    expect(wrapper.find(".popup-loading").exists()).toBe(true);
    expect(wrapper.find(".act-known").exists()).toBe(false);
    expect(wrapper.find(".act-unknown").exists()).toBe(false);

    await flushPromises();

    // After loading, the buttons are present and not duplicated.
    expect(wrapper.find(".popup-loading").exists()).toBe(false);
    expect(wrapper.findAll(".act-known")).toHaveLength(1);
    expect(wrapper.findAll(".act-unknown")).toHaveLength(1);
  });
});
