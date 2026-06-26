import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));
vi.mock("@/shared/api.js", () => ({
  getArticles: vi.fn().mockResolvedValue([]),
  getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", native_language: "zh" }),
  fetchNews: vi.fn().mockResolvedValue([]),
}));

const ROOT = resolve(__dirname, "../../../..");
function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

const NewsList = (await import("@/modules/news/NewsList.vue")).default;

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/news", component: { template: "<div>news</div>" } },
      { path: "/news/:id", name: "reader", component: { template: "<div>reader</div>" } },
    ],
  });
}

function makeArticles() {
  return [
    {
      id: 1,
      hot_rank: 1,
      original_title: "Sample headline one",
      source: "https://www.bbc.com/news/article-1",
      rewritten_body: "Rewritten body",
    },
    {
      id: 2,
      hot_rank: 2,
      original_title: "Sample headline two",
      source: "https://feeds.bbci.co.uk/news/article-2",
      rewritten_body: null,
    },
  ];
}

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function mountList(articles = makeArticles()) {
  const api = await import("@/shared/api.js");
  api.getArticles.mockResolvedValue(articles);
  setActivePinia(createPinia());
  const router = makeRouter();
  await router.push("/news");
  await router.isReady();
  const wrapper = mount(NewsList, {
    global: {
      plugins: [router],
      mocks: {
        $t: (k) => k,
      },
    },
  });
  await flushPromises();
  await flushPromises();
  return { wrapper, router, api };
}

describe("NewsList article-card / source-link structure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the article card as a div (not a button) so the source link can be a real <a> without nested-interactive HTML", () => {
    const vue = read("src/modules/news/NewsList.vue");
    // The article card must be a div, not a <button>, to avoid the
    // browser's "no interactive content inside <button>" rules —
    // which in Tauri WebView (Chromium) still bubbles the inner
    // @click up to the card's click handler even with .stop.
    const cardBlock = vue.match(/<div[\s\S]*?class="article-card"[\s\S]*?>/);
    expect(cardBlock, "article-card div not found").toBeTruthy();
    expect(cardBlock[0]).toMatch(/role="button"/);
    expect(cardBlock[0]).toMatch(/tabindex="0"/);
  });

  it("renders the source link as a real <a> tag with href, target=_blank, rel=noopener", () => {
    const vue = read("src/modules/news/NewsList.vue");
    expect(vue).toMatch(/<a[\s\S]*?class="card-source clickable"[\s\S]*?>/);
    const linkBlock = vue.match(/<a[\s\S]*?class="card-source clickable"[\s\S]*?>/);
    expect(linkBlock[0]).toMatch(/:href="article\.source"/);
    expect(linkBlock[0]).toMatch(/target="_blank"/);
    expect(linkBlock[0]).toMatch(/rel="noopener noreferrer"/);
    expect(linkBlock[0]).toMatch(/@click\.stop\.prevent="openSourceUrl/);
  });

  it("renders article cards in the list with both a clickable body and a source link", async () => {
    const { wrapper } = await mountList();
    const cards = wrapper.findAll(".article-card");
    expect(cards.length).toBe(2);
    const sources = wrapper.findAll(".article-card .card-source");
    expect(sources.length).toBe(2);
    // Source link is rendered as an anchor with the article's URL.
    const firstHref = sources[0].attributes("href");
    expect(firstHref).toBe("https://www.bbc.com/news/article-1");
    expect(sources[0].attributes("target")).toBe("_blank");
  });
});

describe("NewsList click handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clicking the source link calls openSourceUrl and does NOT push the article route", async () => {
    const shell = await import("@tauri-apps/plugin-shell");
    const openSpy = vi.fn().mockResolvedValue();
    shell.open = openSpy;
    const { wrapper, router } = await mountList();

    const source = wrapper.find(".article-card .card-source");
    expect(source.exists()).toBe(true);

    // Click the source — Vue handler @click.stop.prevent should
    // call openSourceUrl(url) and prevent both default nav and
    // bubbling up to the article-card click handler.
    await source.trigger("click");
    await flushPromises();

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith("https://www.bbc.com/news/article-1");
    // The router must NOT have navigated to /news/1.
    expect(router.currentRoute.value.fullPath).toBe("/news");
  });

  it("clicking the article-card body (not the source link) pushes the article route", async () => {
    const { wrapper, router } = await mountList();
    // Click the card title — must bubble up to the card's openArticle.
    const title = wrapper.find(".article-card .card-title");
    expect(title.exists()).toBe(true);
    await title.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("reader");
    expect(router.currentRoute.value.params.id).toBe("1");
  });

  it("refresh clears the current list immediately and then renders the fetched batch", async () => {
    const nextBatch = [
      {
        id: 9,
        hot_rank: 1,
        original_title: "Fresh headline",
        source: "https://example.com/fresh",
        rewritten_body: null,
      },
    ];
    const wait = deferred();
    const { wrapper, api } = await mountList();
    api.fetchNews.mockReturnValueOnce(wait.promise);

    expect(wrapper.findAll(".article-card")).toHaveLength(2);
    await wrapper.find(".refresh-btn").trigger("click");
    await flushPromises();

    expect(wrapper.findAll(".article-card")).toHaveLength(0);
    expect(wrapper.find(".skeleton-list").exists()).toBe(true);

    wait.resolve(nextBatch);
    await flushPromises();
    await flushPromises();

    const cards = wrapper.findAll(".article-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].text()).toContain("Fresh headline");
  });
});
