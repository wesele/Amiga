import VocabPage from "./VocabPage.vue";
import VocabReviewPage from "./VocabReviewPage.vue";

// See src/modules/news/routes.js for the meta.parent convention.
export default [
  {
    path: "/vocab",
    name: "vocab",
    component: VocabPage,
  },
  {
    path: "/vocab/review",
    name: "vocab-review",
    component: VocabReviewPage,
  },
];
