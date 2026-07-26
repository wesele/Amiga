import { mount, flushPromises } from "@vue/test-utils";
import WordPopup from "../WordPopup.vue";
import * as api from "../../api.js";
import { installAndroidBridge } from "@/app/androidBridge.js";
import { clearTranslationCache } from "@/shared/translationCache.js";
import * as speechTts from "@/shared/speechTts.js";

describe("WordPopup", () => {
  let mockInvoke;
  let speakSpy;
  let stopSpy;

  beforeEach(() => {
    clearTranslationCache();
    mockInvoke = vi.fn((cmd) => {
      if (cmd === "translate_text_cmd") return Promise.resolve("你好");
      if (cmd === "translate_word_cmd") {
        return Promise.resolve({ translation: "你好", pos: "interj", ipa: "/ˈola/" });
      }
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });
    api.__setInvoke(mockInvoke);
    speakSpy = vi.spyOn(speechTts, "speakText").mockImplementation((_text, _lang, { onStart, onEnd } = {}) => {
      onStart?.();
      onEnd?.();
      return true;
    });
    stopSpy = vi.spyOn(speechTts, "stopSpeech").mockImplementation(() => {});
    delete window.__amigaGoBackInPage;
    delete window.__amigaGoBack;
  });

  afterEach(() => {
    api.__resetInvoke();
    speakSpy?.mockRestore();
    stopSpy?.mockRestore();
    delete window.__amigaGoBackInPage;
    delete window.__amigaGoBack;
    clearTranslationCache();
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

  it("reuses cached word translation without calling the API again", async () => {
    const props = {
      word: "hola",
      context: "hola amigo",
      sourceLang: "es",
      nativeLang: "zh",
    };

    const first = mount(WordPopup, { props });
    await flushPromises();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = mount(WordPopup, { props });
    await flushPromises();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(second.find(".popup-trans").text()).toBe("你好");
    second.unmount();
  });

  it("does not reuse cache across different native languages", async () => {
    const first = mount(WordPopup, {
      props: { word: "hola", context: "", sourceLang: "es", nativeLang: "zh" },
    });
    await flushPromises();
    first.unmount();

    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "translate_word_cmd") return Promise.resolve({ translation: "hello", pos: "interj" });
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });

    const second = mount(WordPopup, {
      props: { word: "hola", context: "", sourceLang: "es", nativeLang: "en" },
    });
    await flushPromises();
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(second.find(".popup-trans").text()).toBe("hello");
    second.unmount();
  });

  it("refresh button forces a new API call and updates cache", async () => {
    mockInvoke
      .mockResolvedValueOnce({ translation: "你好", pos: "interj" })
      .mockResolvedValueOnce({ translation: "您好", pos: "interj" });

    const wrapper = mount(WordPopup, {
      props: {
        word: "hola",
        context: "hola amigo",
        sourceLang: "es",
        nativeLang: "zh",
      },
    });
    await flushPromises();
    expect(wrapper.find(".popup-trans").text()).toBe("你好");
    expect(wrapper.find(".act-refresh").exists()).toBe(true);

    await wrapper.find(".act-refresh").trigger("click");
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(wrapper.find(".popup-trans").text()).toBe("您好");
    wrapper.unmount();

    // New open uses the refreshed cache value
    const again = mount(WordPopup, {
      props: {
        word: "hola",
        context: "hola amigo",
        sourceLang: "es",
        nativeLang: "zh",
      },
    });
    await flushPromises();
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(again.find(".popup-trans").text()).toBe("您好");
    again.unmount();
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

  it("shows a speaker after IPA and reads the source word", async () => {
    const wrapper = mount(WordPopup, {
      props: {
        word: "hola",
        context: "hola amigo",
        sourceLang: "es",
        nativeLang: "zh",
      },
    });
    await flushPromises();

    expect(wrapper.find(".tag-ipa").text()).toBe("/ˈola/");
    const speakBtn = wrapper.find(".act-speak");
    expect(speakBtn.exists()).toBe(true);

    await speakBtn.trigger("click");
    expect(speakSpy).toHaveBeenCalledWith(
      "hola",
      "es",
      expect.objectContaining({ onStart: expect.any(Function), onEnd: expect.any(Function) }),
    );
    wrapper.unmount();
    expect(stopSpy).toHaveBeenCalled();
  });

  it("page layout keeps known/unknown open for parent navigation", async () => {
    const wrapper = mount(WordPopup, {
      props: {
        word: "hola",
        context: "hola",
        sourceLang: "es",
        nativeLang: "zh",
        layout: "page",
        showNav: true,
        canPrev: false,
        canNext: true,
        closeOnAction: false,
      },
    });
    await flushPromises();

    expect(wrapper.find(".layout-page").exists()).toBe(true);
    expect(wrapper.find(".act-nav").exists()).toBe(true);

    // Reveal translation first so action is immediate
    await wrapper.find(".popup-trans--hidden").trigger("click");

    await wrapper.find(".act-known").trigger("click");
    expect(wrapper.emitted("known")).toBeTruthy();
    expect(wrapper.emitted("close")).toBeFalsy();

    await wrapper.find(".act-unknown").trigger("click");
    expect(wrapper.emitted("unknown")).toBeTruthy();
    expect(wrapper.emitted("close")).toBeFalsy();

    await wrapper.findAll(".act-nav")[1].trigger("click");
    expect(wrapper.emitted("next")).toBeTruthy();
    wrapper.unmount();
  });

  it("consumes Android/TV back to emit close without route navigation", async () => {
    const router = {
      currentRoute: { value: { meta: { parent: "news" } } },
      replace: vi.fn(),
    };
    installAndroidBridge({ router, targetWindow: window, documentRef: document });

    const wrapper = mount(WordPopup, {
      props: {
        word: "hola",
        context: "hola amigo",
        sourceLang: "es",
        nativeLang: "zh",
      },
    });
    await flushPromises();

    expect(window.__amigaGoBack()).toBe("navigated");
    expect(wrapper.emitted("close")).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();

    wrapper.unmount();
    expect(window.__amigaGoBack()).toBe("navigated");
    expect(router.replace).toHaveBeenCalledWith({ name: "news" });
  });

  it("hides translation by default in page layout and reveals on click, preserving ipa and example", async () => {
    const wrapper = mount(WordPopup, {
      props: {
        word: "hola",
        context: "hola amigo",
        sourceLang: "es",
        nativeLang: "zh",
        layout: "page",
      },
    });
    await flushPromises();

    // IPA and extra elements should be visible immediately
    expect(wrapper.find(".tag-ipa").text()).toBe("/ˈola/");

    // Translation should be hidden in placeholder
    expect(wrapper.find(".popup-trans--hidden").exists()).toBe(true);
    expect(wrapper.find(".popup-trans").text()).not.toContain("你好");

    // Click to reveal
    await wrapper.find(".popup-trans--hidden").trigger("click");
    expect(wrapper.find(".popup-trans--hidden").exists()).toBe(false);
    expect(wrapper.find(".popup-trans").text()).toBe("你好");

    // Change word resets hidden state
    await wrapper.setProps({ word: "adios" });
    await flushPromises();
    expect(wrapper.find(".popup-trans--hidden").exists()).toBe(true);
  });

  it("reveals translation and delays 0.5s when known/unknown is clicked while hidden", async () => {
    vi.useFakeTimers();
    const wrapper = mount(WordPopup, {
      props: {
        word: "hola",
        context: "hola amigo",
        sourceLang: "es",
        nativeLang: "zh",
        layout: "page",
        closeOnAction: false,
      },
    });
    await flushPromises();

    // Initially hidden
    expect(wrapper.find(".popup-trans--hidden").exists()).toBe(true);

    // Click known button while hidden
    await wrapper.find(".act-known").trigger("click");

    // Translation should instantly reveal
    expect(wrapper.find(".popup-trans--hidden").exists()).toBe(false);
    expect(wrapper.find(".popup-trans").text()).toBe("你好");

    // Emit 'known' should not be sent immediately
    expect(wrapper.emitted("known")).toBeFalsy();

    // Advance 500ms
    vi.advanceTimersByTime(500);

    // Now emit 'known' is fired
    expect(wrapper.emitted("known")).toBeTruthy();

    vi.useRealTimers();
  });
});
