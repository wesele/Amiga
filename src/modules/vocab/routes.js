import VocabPage from "./VocabPage.vue";

// See src/modules/news/routes.js for the meta.parent convention.
export default [
  {
    path: "/learn/vocab",
    name: "vocab",
    component: VocabPage,
    meta: { parent: "learn" },
  },
];
