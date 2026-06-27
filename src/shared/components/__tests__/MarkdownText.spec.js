import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import MarkdownText from "@/shared/components/MarkdownText.vue";
import { openExternalUrl } from "@/shared/external.js";

vi.mock("@/shared/external.js", () => ({
  openExternalUrl: vi.fn(),
}));

describe("MarkdownText", () => {
  it("renders plain text as a paragraph", () => {
    const wrapper = mount(MarkdownText, { props: { content: "Hello world" } });
    expect(wrapper.html()).toContain("<p>Hello world</p>");
  });

  it("renders bold and italic", () => {
    const wrapper = mount(MarkdownText, {
      props: { content: "**bold** and *italic*" },
    });
    expect(wrapper.html()).toContain("<strong>bold</strong>");
    expect(wrapper.html()).toContain("<em>italic</em>");
  });

  it("renders lists", () => {
    const wrapper = mount(MarkdownText, {
      props: { content: "- one\n- two" },
    });
    expect(wrapper.html()).toContain("<ul>");
    expect(wrapper.html()).toContain("<li>one</li>");
    expect(wrapper.html()).toContain("<li>two</li>");
  });

  it("renders code blocks", () => {
    const wrapper = mount(MarkdownText, {
      props: { content: "```\nfoo\nbar\n```" },
    });
    expect(wrapper.html()).toContain("<pre>");
    expect(wrapper.html()).toContain("foo");
    expect(wrapper.html()).toContain("bar");
  });

  it("escapes raw HTML in source content", () => {
    const wrapper = mount(MarkdownText, {
      props: { content: "Hello <script>alert(1)</script>" },
    });
    expect(wrapper.html()).not.toContain("<script");
    expect(wrapper.html()).toContain("&lt;script&gt;");
  });

  it("renders empty content without crashing", () => {
    const wrapper = mount(MarkdownText, { props: { content: "" } });
    expect(wrapper.find(".md-content").exists()).toBe(true);
    expect(wrapper.find(".md-content").text()).toBe("");
  });

  it("updates when content prop changes", async () => {
    const wrapper = mount(MarkdownText, { props: { content: "first" } });
    expect(wrapper.html()).toContain("first");
    await wrapper.setProps({ content: "**second**" });
    expect(wrapper.html()).toContain("<strong>second</strong>");
  });

  it("applies forwarded class to root element", () => {
    const wrapper = mount(MarkdownText, {
      props: { content: "hi" },
      attrs: { class: "msg-text" },
    });
    const root = wrapper.find(".md-content");
    expect(root.exists()).toBe(true);
    expect(root.classes()).toContain("msg-text");
  });

  it("opens rendered links through the external URL helper", async () => {
    const wrapper = mount(MarkdownText, {
      props: { content: "[site](https://example.com/path)" },
    });
    await wrapper.find("a").trigger("click");
    expect(openExternalUrl).toHaveBeenCalledWith("https://example.com/path");
  });
});
