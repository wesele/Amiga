import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: true,
});

const HTML_ESCAPE_RE = /[&<]/g;
const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
};

function escapeRawHtml(input) {
  return String(input).replace(HTML_ESCAPE_RE, (ch) => HTML_ESCAPE_MAP[ch]);
}

const SCRIPT_BLOCK_RE = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const ON_ATTR_RE = /\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URL_RE = /\b(href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi;

function sanitizeOutput(html) {
  return html
    .replace(SCRIPT_BLOCK_RE, "")
    .replace(ON_ATTR_RE, "")
    .replace(JS_URL_RE, "");
}

export function renderMarkdown(text) {
  if (text == null || text === "") return "";
  const safe = escapeRawHtml(text);
  const rawHtml = marked.parse(safe);
  const collapsed = rawHtml.replace(/>\s+</g, "><").trim();
  return sanitizeOutput(collapsed);
}

export function containsMarkdown(text) {
  if (!text) return false;
  return /(^|\n)\s{0,3}#{1,6}\s|\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|^[-*+]\s/m.test(
    text,
  );
}
