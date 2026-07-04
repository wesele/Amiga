import PathMapPage from "./PathMapPage.vue";
import LessonPage from "./LessonPage.vue";
import TeachingPage from "./TeachingPage.vue";
import GrammarPointPage from "./GrammarPointPage.vue";

export default [
  {
    path: "/learn/path",
    name: "path",
    component: PathMapPage,
    meta: { parent: "learn" },
  },
  {
    path: "/learn/path/teach/:nodeId",
    name: "path-teaching",
    component: TeachingPage,
    meta: { parent: "path" },
  },
  {
    path: "/learn/path/teach/:nodeId/grammar/:pointIdx",
    name: "path-grammar-point",
    component: GrammarPointPage,
    meta: { parent: "path-teaching" },
  },
  {
    path: "/learn/path/:sectionId",
    name: "path-lesson",
    component: LessonPage,
    meta: { parent: "path" },
  },
];
