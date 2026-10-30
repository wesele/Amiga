import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import * as api from "@/shared/api.js";
import CoursewareModal from "@/modules/reading/CoursewareModal.vue";

const ReadingReader = (await import("@/modules/reading/ReadingReader.vue")).default;

describe("Courseware & Chapter Splitting", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  const demoChapter = {
    id: 501,
    article_id: 101,
    chapter_index: 0,
    title: "第 1 章 · 开场问候",
    start_para_idx: 0,
    end_para_idx: 1,
    start_sec: 0,
    end_sec: 25.5,
    courseware_status: "ready",
    viewed_pages: 0,
    total_pages: 2,
    slides: [
      {
        slide_type: "vocab",
        term: "bienvenidos",
        lemma: "bienvenido",
        pos: "adj.",
        pronunciation: "bjen.beˈni.ðos",
        meaning: "欢迎",
        explanation: "常用热情问候语",
        context_sentence: "Hola y bienvenidos al video.",
        context_translation: "你好，欢迎来到视频。",
        para_idx: 0,
        start_sec: 0,
        end_sec: 5.0,
        svg: "<svg viewBox='0 0 320 180' xmlns='http://www.w3.org/2000/svg'><circle cx='50' cy='50' r='20' fill='#10b981'/></svg>",
      },
      {
        slide_type: "phrase",
        term: "de vez en cuando",
        lemma: "de vez en cuando",
        pos: "phrase",
        pronunciation: "",
        meaning: "偶尔 / 有时",
        explanation: "字面义：从一次到何时 → 语境义：偶尔，不经常地",
        context_sentence: "Viajo de vez en cuando.",
        context_translation: "我偶尔会旅行。",
        para_idx: 1,
        start_sec: 6.0,
        end_sec: 12.0,
        svg: "<svg viewBox='0 0 320 180' xmlns='http://www.w3.org/2000/svg'><rect width='320' height='180' fill='#eef2ff'/></svg>",
      },
    ],
  };

  it("renders CoursewareModal slide details, badges and progress correctly", async () => {
    const wrapper = mount(CoursewareModal, {
      props: {
        show: true,
        chapter: demoChapter,
        targetLang: "es",
        nativeLang: "zh",
        userId: "u1",
      },
    });

    await flushPromises();

    // Title and chapter name
    expect(wrapper.text()).toContain("第 1 章 · 开场问候");
    expect(wrapper.text()).toContain("1 / 2");

    // First slide is vocab: "bienvenidos"
    expect(wrapper.text()).toContain("生词排除");
    expect(wrapper.text()).toContain("bienvenidos");
    expect(wrapper.text()).toContain("欢迎");
    expect(wrapper.text()).toContain("常用热情问候语");
    expect(wrapper.text()).toContain("Hola y bienvenidos al video.");
    expect(wrapper.text()).toContain("你好，欢迎来到视频。");

    // SVG container rendered
    expect(wrapper.find(".svg-container svg").exists()).toBe(true);

    // Turn to next slide
    const nextBtn = wrapper.find(".btn-next");
    expect(nextBtn.exists()).toBe(true);
    await nextBtn.trigger("click");
    await flushPromises();

    // Second slide is phrase: "de vez en cuando"
    expect(wrapper.text()).toContain("难懂短语 / 说法");
    expect(wrapper.text()).toContain("de vez en cuando");
    expect(wrapper.text()).toContain("偶尔 / 有时");
    expect(wrapper.text()).toContain("字面义：从一次到何时 → 语境义：偶尔，不经常地");
    expect(wrapper.text()).toContain("2 / 2");

    // Last slide shows finish button
    expect(wrapper.find(".btn-finish").exists()).toBe(true);
    expect(wrapper.find(".btn-finish").text()).toContain("完成预习");
  });

  it("emits progress event when flipping pages in CoursewareModal", async () => {
    const wrapper = mount(CoursewareModal, {
      props: {
        show: true,
        chapter: { ...demoChapter, viewed_pages: 0 },
        targetLang: "es",
        nativeLang: "zh",
        userId: "u1",
      },
    });

    await flushPromises();

    // Initial page view event
    expect(wrapper.emitted("progress")).toBeTruthy();
    expect(wrapper.emitted("progress")[0]).toEqual([{ chapterId: 501, viewedPages: 1 }]);

    // Click next slide
    await wrapper.find(".btn-next").trigger("click");
    await flushPromises();

    expect(wrapper.emitted("progress").length).toBe(2);
    expect(wrapper.emitted("progress")[1]).toEqual([{ chapterId: 501, viewedPages: 2 }]);

    // Click finish
    await wrapper.find(".btn-finish").trigger("click");
    expect(wrapper.emitted("close")).toBeTruthy();
  });

  it("handles vocabulary mastery actions in CoursewareModal", async () => {
    let updatedWordId = null;
    let updatedMastery = null;

    api.__setInvoke(vi.fn((command, args) => {
      if (command === "lookup_word_ids_cmd") return Promise.resolve([789]);
      if (command === "update_word_mastery_cmd") {
        updatedWordId = args.wordId;
        updatedMastery = args.mastery;
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    }));

    const wrapper = mount(CoursewareModal, {
      props: {
        show: true,
        chapter: demoChapter,
        targetLang: "es",
        nativeLang: "zh",
        userId: "u1",
      },
    });

    await flushPromises();

    // Click "加入生词本" (unfamiliar)
    const unfamBtn = wrapper.find(".btn-unfamiliar");
    expect(unfamBtn.exists()).toBe(true);
    await unfamBtn.trigger("click");
    await flushPromises();

    expect(updatedWordId).toBe(789);
    expect(updatedMastery).toBe(1);
    expect(wrapper.text()).toContain("已加入生词本");

    // Click "已掌握" (mastered)
    const masterBtn = wrapper.find(".btn-mastered");
    expect(masterBtn.exists()).toBe(true);
    await masterBtn.trigger("click");
    await flushPromises();

    expect(updatedWordId).toBe(789);
    expect(updatedMastery).toBe(2);
    expect(wrapper.text()).toContain("已标记为掌握");
  });

  it("integrates chapter divider and opens CoursewareModal in ReadingReader", async () => {
    const importedItem = {
      id: 201,
      user_id: "u1",
      target_language: "es",
      source_type: "youtube",
      source_url: "https://youtube.com/watch?v=demo2",
      source_id: "demo2",
      title: "YouTube Multi Chapter Video",
      channel: "Spanish Today",
      duration_sec: 180,
      audio_path: null,
      subtitles_json: JSON.stringify([
        { start: 0, end: 10, text: "Hola amigos, bienvenidos al capitulo uno." },
        { start: 11, end: 20, text: "En este capitulo hablamos de saludos." },
        { start: 21, end: 35, text: "Ahora pasamos al segundo capitulo de hoy." },
      ]),
      cefr_level: "A2",
      created_at: "2026-07-11T10:00:00",
    };

    const chapters = [
      {
        id: 701,
        article_id: 201,
        chapter_index: 0,
        title: "第 1 章 · 基础问候",
        start_para_idx: 0,
        end_para_idx: 1,
        start_sec: 0,
        end_sec: 20,
        courseware_status: "ready",
        viewed_pages: 2,
        total_pages: 2,
        slides: demoChapter.slides,
      },
      {
        id: 702,
        article_id: 201,
        chapter_index: 1,
        title: "第 2 章 · 进阶表达",
        start_para_idx: 2,
        end_para_idx: 2,
        start_sec: 21,
        end_sec: 35,
        courseware_status: "pending",
        viewed_pages: 0,
        total_pages: 0,
        slides: [],
      },
    ];

    api.__setInvoke(vi.fn((command, args) => {
      if (command === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (command === "get_target_language_cmd") return Promise.resolve("es");
      if (command === "get_learning_goals_cmd") return Promise.resolve([{ target_language: "es", cefr_level: "A2" }]);
      if (command === "get_imported_article_cmd") return Promise.resolve(importedItem);
      if (command === "get_imported_article_chapters_cmd") return Promise.resolve(chapters);
      return Promise.resolve(null);
    }));

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/learn/reading/:id", component: ReadingReader, props: true },
      ],
    });
    await router.push({ path: "/learn/reading/201", query: { type: "imported" } });
    await router.isReady();

    const wrapper = mount(ReadingReader, {
      props: { id: 201 },
      global: {
        plugins: [router],
        stubs: { WordPopup: true },
      },
    });

    await flushPromises();

    // Verify chapter banners are displayed above paragraphs 0 and 2
    const chapterBanners = wrapper.findAll(".chapter-divider-banner");
    expect(chapterBanners.length).toBe(2);

    expect(chapterBanners[0].find(".chapter-num-badge").exists()).toBe(false);
    expect(chapterBanners[0].text()).toContain("第 1 章 · 基础问候");
    expect(chapterBanners[0].find(".chapter-time-sub").text()).toContain("0:00 - 0:20");
    expect(chapterBanners[0].text()).toContain("已学完"); // 2/2 pages = 已学完
    expect(chapterBanners[0].find(".chapter-percent-tag").exists()).toBe(false);

    expect(chapterBanners[1].find(".chapter-num-badge").exists()).toBe(false);
    expect(chapterBanners[1].text()).toContain("第 2 章 · 进阶表达");
    expect(chapterBanners[1].find(".chapter-time-sub").text()).toContain("0:21 - 0:35");
    expect(chapterBanners[1].text()).toContain("排队中");
    expect(chapterBanners[1].find(".chapter-percent-tag").exists()).toBe(false);

    // Click "学习" on Chapter 1
    const studyBtn = chapterBanners[0].find(".btn-courseware-study");
    expect(studyBtn.exists()).toBe(true);
    await studyBtn.trigger("click");
    await flushPromises();

    // Courseware modal should now be open
    const modal = wrapper.findComponent(CoursewareModal);
    expect(modal.exists()).toBe(true);
    expect(modal.props("show")).toBe(true);
    expect(modal.props("chapter").id).toBe(701);
  });

  it("handles pending queue status in CoursewareModal properly", async () => {
    const pendingChapter = {
      id: 888,
      article_id: 201,
      chapter_index: 1,
      title: "第 2 章 · 排队中",
      courseware_status: "pending",
      viewed_pages: 0,
      total_pages: 0,
      slides: [],
    };

    const wrapper = mount(CoursewareModal, {
      props: {
        show: true,
        chapter: pendingChapter,
        targetLang: "es",
        nativeLang: "zh",
        userId: "u1",
      },
    });

    await flushPromises();

    // Verify it shows loading spinner and queue message instead of empty/error
    expect(wrapper.find(".spinner-large").exists()).toBe(true);
    expect(wrapper.text()).toContain("排队中");
    expect(wrapper.text()).toContain("队列中");

    // Footer should be hidden when slides are not ready
    expect(wrapper.find(".courseware-footer").exists()).toBe(false);
  });

  it("retains word mastery state across page flipping", async () => {
    api.__setInvoke(vi.fn((command, args) => {
      if (command === "lookup_word_ids_cmd") return Promise.resolve([789]);
      if (command === "update_word_mastery_cmd") return Promise.resolve(null);
      if (command === "get_words_mastery_map_cmd") return Promise.resolve({});
      return Promise.resolve(null);
    }));

    const wrapper = mount(CoursewareModal, {
      props: {
        show: true,
        chapter: demoChapter,
        targetLang: "es",
        nativeLang: "zh",
        userId: "u1",
      },
    });

    await flushPromises();

    // Initially neither active
    expect(wrapper.find(".btn-mastered.active").exists()).toBe(false);

    // Mark mastered on slide 1
    await wrapper.find(".btn-mastered").trigger("click");
    await flushPromises();
    expect(wrapper.find(".btn-mastered.active").exists()).toBe(true);

    // Flip to next slide (phrase slide)
    await wrapper.find(".btn-next").trigger("click");
    await flushPromises();
    expect(wrapper.find(".vocab-mastery-row").exists()).toBe(false);

    // Flip back to slide 1
    await wrapper.find(".btn-prev").trigger("click");
    await flushPromises();

    // Mastery state must remain active!
    expect(wrapper.find(".btn-mastered.active").exists()).toBe(true);
    expect(wrapper.find(".btn-mastered").text()).toContain("已掌握");
  });

  it("does not run into recursive cascade 100% when parent updates chapter viewed_pages", async () => {
    const chapter = { ...demoChapter, viewed_pages: 0 };
    const wrapper = mount(CoursewareModal, {
      props: {
        show: true,
        chapter,
        targetLang: "es",
        nativeLang: "zh",
        userId: "u1",
      },
    });

    await flushPromises();
    // First open reports page 1 view
    expect(wrapper.emitted("progress").length).toBe(1);
    expect(wrapper.emitted("progress")[0]).toEqual([{ chapterId: 501, viewedPages: 1 }]);

    // Simulate parent updating chapter with viewed_pages: 1
    await wrapper.setProps({ chapter: { ...chapter, viewed_pages: 1 } });
    await flushPromises();

    // Must stay on slide 0 (1 / 2), and NOT emit another progress or jump to 100%
    expect(wrapper.emitted("progress").length).toBe(1);
    expect(wrapper.text()).toContain("1 / 2");
  });

  it("handles chapter button progress text logic, direct retry without modal, and chain-retry of subsequent failed chapters", async () => {
    const importedItem = {
      id: 301,
      user_id: "u1",
      target_language: "es",
      source_type: "youtube",
      source_url: "https://youtube.com/watch?v=chain",
      source_id: "chain",
      title: "Retry Chain Video",
      channel: "Spanish Today",
      duration_sec: 180,
      audio_path: null,
      subtitles_json: JSON.stringify([
        { start: 0, end: 10, text: "Capitulo 1." },
        { start: 11, end: 20, text: "Capitulo 2." },
        { start: 21, end: 30, text: "Capitulo 3." },
        { start: 31, end: 40, text: "Capitulo 4." },
      ]),
      cefr_level: "A2",
      created_at: "2026-07-11T10:00:00",
    };

    const chapters = [
      {
        id: 901,
        article_id: 301,
        chapter_index: 0,
        title: "第 1 章 · 未学习",
        start_para_idx: 0,
        end_para_idx: 0,
        start_sec: 0,
        end_sec: 10,
        courseware_status: "ready",
        viewed_pages: 0,
        total_pages: 4,
        slides: [],
      },
      {
        id: 902,
        article_id: 301,
        chapter_index: 1,
        title: "第 2 章 · 学习中",
        start_para_idx: 1,
        end_para_idx: 1,
        start_sec: 11,
        end_sec: 20,
        courseware_status: "ready",
        viewed_pages: 2,
        total_pages: 4,
        slides: [],
      },
      {
        id: 903,
        article_id: 301,
        chapter_index: 2,
        title: "第 3 章 · 失败一",
        start_para_idx: 2,
        end_para_idx: 2,
        start_sec: 21,
        end_sec: 30,
        courseware_status: "error",
        viewed_pages: 0,
        total_pages: 0,
        slides: [],
      },
      {
        id: 904,
        article_id: 301,
        chapter_index: 3,
        title: "第 4 章 · 失败二",
        start_para_idx: 3,
        end_para_idx: 3,
        start_sec: 31,
        end_sec: 40,
        courseware_status: "error",
        viewed_pages: 0,
        total_pages: 0,
        slides: [],
      },
    ];

    const generateCalls = [];

    api.__setInvoke(vi.fn((command, args) => {
      if (command === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (command === "get_target_language_cmd") return Promise.resolve("es");
      if (command === "get_learning_goals_cmd") return Promise.resolve([{ target_language: "es", cefr_level: "A2" }]);
      if (command === "get_imported_article_cmd") return Promise.resolve(importedItem);
      if (command === "get_imported_article_chapters_cmd") return Promise.resolve(chapters);
      if (command === "generate_chapter_courseware_cmd") {
        generateCalls.push(args.chapterId);
        return Promise.resolve({
          id: args.chapterId,
          courseware_status: "ready",
          viewed_pages: 0,
          total_pages: 4,
          slides: [],
        });
      }
      return Promise.resolve(null);
    }));

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/learn/reading/:id", component: ReadingReader, props: true },
      ],
    });
    await router.push({ path: "/learn/reading/301", query: { type: "imported" } });
    await router.isReady();

    const wrapper = mount(ReadingReader, {
      props: { id: 301 },
      global: {
        plugins: [router],
        stubs: { WordPopup: true },
      },
    });

    await flushPromises();

    const banners = wrapper.findAll(".chapter-divider-banner");
    expect(banners.length).toBe(4);

    // 1. 未学习 -> "学习"
    expect(banners[0].find(".btn-courseware-study").text()).toContain("学习");

    // 2. 学习中 -> "50%" (2/4)
    expect(banners[1].find(".btn-courseware-study").text()).toContain("50%");

    // 3. 失败一 -> "重试" (not "生成失败，点击重试")
    expect(banners[2].find(".btn-courseware-study").text()).toContain("重试");
    expect(banners[2].find(".btn-courseware-study").text()).not.toContain("生成失败");

    // 4. 点击"重试"：不应该弹出 CoursewareModal，而是直接触发重试，并链式重试后续失败课件
    await banners[2].find(".btn-courseware-study").trigger("click");
    await flushPromises();

    // Modal 不应打开
    const modal = wrapper.findComponent(CoursewareModal);
    expect(modal.props("show")).toBe(false);

    // 验证调用了 chapter 903 的重试，并在其成功后自动继续重试了后续失败的 904
    expect(generateCalls).toEqual([903, 904]);

    // 验证两个章节状态均已变为 ready
    expect(banners[2].find(".btn-courseware-study").text()).toContain("学习");
    expect(banners[3].find(".btn-courseware-study").text()).toContain("学习");
  });
});
