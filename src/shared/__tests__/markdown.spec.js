import { describe, it, expect } from "vitest";
import { renderMarkdown, containsMarkdown } from "@/shared/markdown.js";

describe("renderMarkdown", () => {
  it("returns empty string for empty input", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown(null)).toBe("");
    expect(renderMarkdown(undefined)).toBe("");
  });

  it("renders plain text as a paragraph", () => {
    const html = renderMarkdown("Hello world");
    expect(html).toContain("<p>Hello world</p>");
  });

  it("renders bold text", () => {
    const html = renderMarkdown("This is **bold** text");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("renders italic text", () => {
    const html = renderMarkdown("This is *italic* text");
    expect(html).toContain("<em>italic</em>");
  });

  it("renders inline code", () => {
    const html = renderMarkdown("Use `const x = 1`");
    expect(html).toContain("<code>const x = 1</code>");
  });

  it("renders fenced code blocks", () => {
    const html = renderMarkdown("```js\nconst x = 1;\n```");
    expect(html).toContain("<pre>");
    expect(html).toContain("<code");
    expect(html).toContain("const x = 1;");
  });

  it("renders unordered lists", () => {
    const html = renderMarkdown("- apple\n- banana\n- cherry");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>apple</li>");
    expect(html).toContain("<li>banana</li>");
  });

  it("renders ordered lists", () => {
    const html = renderMarkdown("1. first\n2. second");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>first</li>");
  });

  it("renders headings", () => {
    const html = renderMarkdown("## Section title");
    expect(html).toContain("<h2>Section title</h2>");
  });

  it("renders blockquotes", () => {
    const html = renderMarkdown("> a quote");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("a quote");
  });

  it("renders links", () => {
    const html = renderMarkdown("[click](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("click</a>");
  });

  it("converts single newlines to <br> in GFM break mode", () => {
    const html = renderMarkdown("line one\nline two");
    expect(html).toContain("<br>");
  });

  it("preserves line breaks inside code blocks", () => {
    const html = renderMarkdown("```\na\nb\n```");
    expect(html).toContain("a\nb");
  });

  it("escapes raw HTML in input to prevent XSS", () => {
    const html = renderMarkdown("Hello <script>alert('xss')</script> world");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
  });

  it("strips inline event handler attributes from output", () => {
    const html = renderMarkdown('Click [here](https://example.com "x")');
    expect(html).not.toMatch(/\son\w+\s*=/i);
  });

  it("strips javascript: URLs from links", () => {
    const html = renderMarkdown("[bad](javascript:alert(1))");
    expect(html).not.toMatch(/href\s*=\s*["']?\s*javascript:/i);
  });

  it("renders text with Chinese characters", () => {
    const html = renderMarkdown("你好 **世界**");
    expect(html).toContain("你好");
    expect(html).toContain("<strong>世界</strong>");
  });

  it("renders horizontal rules", () => {
    const html = renderMarkdown("---");
    expect(html).toContain("<hr");
  });

  it("does not emit raw newlines between block elements (would render as <br> under pre-wrap)", () => {
    const html = renderMarkdown("first paragraph\n\nsecond paragraph");
    expect(html).not.toMatch(/>\s+</);
  });
});

describe("containsMarkdown", () => {
  it("returns false for empty or plain text", () => {
    expect(containsMarkdown("")).toBe(false);
    expect(containsMarkdown(null)).toBe(false);
    expect(containsMarkdown("hello world")).toBe(false);
  });

  it("returns true for bold", () => {
    expect(containsMarkdown("this is **bold** text")).toBe(true);
  });

  it("returns true for inline code", () => {
    expect(containsMarkdown("use `let` here")).toBe(true);
  });

  it("returns true for links", () => {
    expect(containsMarkdown("see [docs](https://example.com)")).toBe(true);
  });

  it("returns true for list markers", () => {
    expect(containsMarkdown("- item one\n- item two")).toBe(true);
  });

  it("returns true for headings", () => {
    expect(containsMarkdown("## Title")).toBe(true);
  });
});
