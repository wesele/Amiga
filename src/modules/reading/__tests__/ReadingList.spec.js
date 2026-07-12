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
      stubs: { PageHeader: true, ConfirmDialog: true },
    },
  });
}

describe("ReadingList", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("keeps existing articles available while the current slot is generated", async () => {
    const generation = deferred();
    const existingArticle = {
      id: 1,
      title: "Earlier article",
      local_date: "2026-07-11",
      slot: "AM",
      cefr_level: "A1",
      status: "unread",
    };
    const generatedArticle = {
      ...existingArticle,
      id: 2,
      title: "New article",
    };
    let articleReads = 0;

    api.__setInvoke(vi.fn((command) => {
      if (command === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (command === "get_target_language_cmd") return Promise.resolve("es");
      if (command === "get_learning_goals_cmd") return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      if (command === "get_reading_articles_cmd") {
        articleReads += 1;
        return Promise.resolve(articleReads === 1 ? [existingArticle] : [generatedArticle, existingArticle]);
      }
      if (command === "ensure_reading_article_cmd") return generation.promise;
      return Promise.resolve(null);
    }));

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Earlier article");
    expect(wrapper.find(".skeleton-list").exists()).toBe(false);
    expect(wrapper.find(".article-card.is-generating").exists()).toBe(true);

    generation.resolve();
    await flushPromises();

    expect(wrapper.find(".article-card.is-generating").exists()).toBe(false);
    expect(wrapper.text()).toContain("New article");
  });
});
