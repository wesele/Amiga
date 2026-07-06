import ReadingList from "./ReadingList.vue";
import ReadingReader from "./ReadingReader.vue";
import ReadingTest from "./ReadingTest.vue";

// `meta.parent` is consumed by window.__amigaGoBack() in androidBridge.js — the
// Android back button walks the parent chain instead of history.back().
export default [
  {
    path: "/learn/reading",
    name: "reading",
    component: ReadingList,
    meta: { parent: "learn" },
  },
  {
    path: "/learn/reading/:id",
    name: "reading-article",
    component: ReadingReader,
    meta: { parent: "reading" },
    props: true,
  },
  {
    path: "/learn/reading/:id/test",
    name: "reading-test",
    component: ReadingTest,
    meta: { parent: "reading-article" },
    props: true,
  },
];
