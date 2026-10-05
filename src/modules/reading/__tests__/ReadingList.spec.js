import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import * as api from "@/shared/api.js";

const ReadingList = (await import("@/modules/reading/ReadingList.vue")).default;

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function mountPage() {
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  return mount(ReadingList, {
    global: {
      plugins: [router],
      stubs: { PageHeader: true, ConfirmDialog: true, YoutubeImportModal: true },
    },
  });
}

describe("ReadingList", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("displays only the latest AI article and does NOT automatically generate new articles on load", async () => {
    let ensureCalled = false;
    const existingArticle = {
      id: 1,
      title: "Latest AI Article",
      local_date: "2026-07-11",
      slot: "AM",
      cefr_level: "A2",
      status: "unread",
    };
    const olderArticle = {
      id: 0,
      title: "Old Article",
      local_date: "2026-07-10",
      slot: "PM",
      cefr_level: "A2",
      status: "read",
    };

    api.__setInvoke(vi.fn((command) => {
      if (command === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (command === "get_target_language_cmd") return Promise.resolve("es");
      if (command === "get_learning_goals_cmd") return Promise.resolve([{ target_language: "es", cefr_level: "A2" }]);
      if (command === "get_reading_articles_cmd") return Promise.resolve([existingArticle, olderArticle]);
      if (command === "get_imported_articles_cmd") return Promise.resolve([]);
      if (command === "ensure_reading_article_cmd") {
        ensureCalled = true;
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    }));

    const wrapper = mountPage();
    await flushPromises();

    // Verify only the latest one is shown
    expect(wrapper.text()).toContain("Latest AI Article");
    expect(wrapper.text()).not.toContain("Old Article");
    // Verify ensure_reading_article_cmd was NOT called
    expect(ensureCalled).toBe(false);
    // Verify the "读完" button is present
    expect(wrapper.find(".btn-finish").exists()).toBe(true);
  });

  it("generates a new article and replaces the current one when clicking '读完'", async () => {
    const finishDeferred = deferred();
    const currentArticle = {
      id: 1,
      title: "Current Article",
      local_date: "2026-07-11",
      slot: "AM",
      cefr_level: "A2",
      status: "unread",
    };
    const nextArticle = {
      id: 2,
      title: "Brand New Article",
      local_date: "2026-07-11",
      slot: "AM",
      cefr_level: "A2",
      status: "unread",
    };

    api.__setInvoke(vi.fn((command, args) => {
      if (command === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (command === "get_target_language_cmd") return Promise.resolve("es");
      if (command === "get_learning_goals_cmd") return Promise.resolve([{ target_language: "es", cefr_level: "A2" }]);
      if (command === "get_reading_articles_cmd") return Promise.resolve([currentArticle]);
      if (command === "get_imported_articles_cmd") return Promise.resolve([]);
      if (command === "finish_and_generate_next_reading_article_cmd") {
        return finishDeferred.promise;
      }
      return Promise.resolve(null);
    }));

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Current Article");
    const finishBtn = wrapper.find(".btn-finish");
    expect(finishBtn.exists()).toBe(true);

    // Trigger Finish reading
    await finishBtn.trigger("click");
    expect(wrapper.find(".ai-card.is-generating").exists()).toBe(true);

    finishDeferred.resolve(nextArticle);
    await flushPromises();

    expect(wrapper.find(".ai-card.is-generating").exists()).toBe(false);
    expect(wrapper.text()).toContain("Brand New Article");
    expect(wrapper.text()).not.toContain("Current Article");
  });

  it("shows initial generate button when there is no AI article", async () => {
    const initialArticle = {
      id: 10,
      title: "First Ever Article",
      local_date: "2026-07-11",
      slot: "AM",
      cefr_level: "A2",
      status: "unread",
    };

    api.__setInvoke(vi.fn((command) => {
      if (command === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (command === "get_target_language_cmd") return Promise.resolve("es");
      if (command === "get_learning_goals_cmd") return Promise.resolve([{ target_language: "es", cefr_level: "A2" }]);
      if (command === "get_reading_articles_cmd") return Promise.resolve([]);
      if (command === "get_imported_articles_cmd") return Promise.resolve([]);
      if (command === "generate_initial_reading_article_cmd") return Promise.resolve(initialArticle);
      return Promise.resolve(null);
    }));

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find(".empty-ai-card").exists()).toBe(true);
    const generateBtn = wrapper.find(".empty-ai-card .btn-primary");
    expect(generateBtn.exists()).toBe(true);

    await generateBtn.trigger("click");
    await flushPromises();

    expect(wrapper.find(".empty-ai-card").exists()).toBe(false);
    expect(wrapper.text()).toContain("First Ever Article");
  });

  it("lists imported YouTube articles and supports deleting them", async () => {
    let deletedId = null;
    const importedItem = {
      id: 101,
      title: "YouTube Video Story",
      channel: "Learning Spanish",
      duration_sec: 240,
      created_at: "2026-07-11T12:00:00",
    };

    api.__setInvoke(vi.fn((command, args) => {
      if (command === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (command === "get_target_language_cmd") return Promise.resolve("es");
      if (command === "get_learning_goals_cmd") return Promise.resolve([{ target_language: "es", cefr_level: "A2" }]);
      if (command === "get_reading_articles_cmd") return Promise.resolve([]);
      if (command === "get_imported_articles_cmd") return Promise.resolve([importedItem]);
      if (command === "delete_imported_article_cmd") {
        deletedId = args.id;
        return Promise.resolve("path/to/audio.m4a");
      }
      return Promise.resolve(null);
    }));

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("YouTube Video Story");
    expect(wrapper.text()).toContain("Learning Spanish");
    expect(wrapper.find(".btn-delete").exists()).toBe(true);

    // Click delete icon to prompt confirm
    await wrapper.find(".btn-delete").trigger("click");
    // Confirm delete
    await wrapper.vm.confirmDeleteImported();
    await flushPromises();

    expect(deletedId).toBe(101);
    expect(wrapper.text()).not.toContain("YouTube Video Story");
  });
});
