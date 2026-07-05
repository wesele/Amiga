import ReadingList from "./ReadingList.vue";
import ReadingReader from "./ReadingReader.vue";
import ReadingTest from "./ReadingTest.vue";

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
    meta: { parent: "learn" },
    props: true,
  },
  {
    path: "/learn/reading/:id/test",
    name: "reading-test",
    component: ReadingTest,
    meta: { parent: "learn" },
    props: true,
  },
];
