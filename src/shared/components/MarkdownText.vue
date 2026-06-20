<template>
  <div class="md-content" v-html="html" />
</template>

<script setup>
import { computed } from "vue";
import { renderMarkdown } from "@/shared/markdown.js";

const props = defineProps({
  content: { type: String, default: "" },
});

const html = computed(() => renderMarkdown(props.content));
</script>

<style>
.md-content {
  font-size: inherit;
  line-height: 1.5;
  word-break: break-word;
  color: inherit;
  white-space: normal;
}
.md-content > * { margin: 0; }
.md-content > * + * { margin-top: 0.35em; }
.md-content > :first-child { margin-top: 0; }
.md-content > :last-child { margin-bottom: 0; }
.md-content h1,
.md-content h2,
.md-content h3,
.md-content h4,
.md-content h5,
.md-content h6 {
  font-weight: 700;
  line-height: 1.3;
}
.md-content h1 { font-size: 1.3em; }
.md-content h2 { font-size: 1.2em; }
.md-content h3 { font-size: 1.1em; }
.md-content h4,
.md-content h5,
.md-content h6 { font-size: 1em; }
.md-content strong { font-weight: 700; }
.md-content em { font-style: italic; }
.md-content del { text-decoration: line-through; opacity: 0.7; }
.md-content ul,
.md-content ol {
  padding-left: 1.3em;
  list-style-position: outside;
}
.md-content li { margin: 0; }
.md-content li + li { margin-top: 0.1em; }
.md-content li > p { margin: 0; }
.md-content blockquote {
  padding: 0.15em 0.6em;
  border-left: 3px solid currentColor;
  opacity: 0.8;
  background: rgba(0, 0, 0, 0.04);
}
.md-content code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.88em;
  padding: 0.05em 0.3em;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.08);
}
.md-content pre {
  padding: 0.5em 0.7em;
  border-radius: 5px;
  overflow-x: auto;
  background: rgba(0, 0, 0, 0.06);
}
.md-content pre code {
  padding: 0;
  background: transparent;
  font-size: 0.85em;
  white-space: pre;
}
.md-content a {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  word-break: break-all;
}
.md-content hr {
  border: none;
  border-top: 1px solid currentColor;
  opacity: 0.2;
}
.md-content table {
  border-collapse: collapse;
  font-size: 0.95em;
}
.md-content th,
.md-content td {
  border: 1px solid currentColor;
  padding: 0.2em 0.5em;
  opacity: 0.9;
}
</style>
