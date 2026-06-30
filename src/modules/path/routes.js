import PathMapPage from "./PathMapPage.vue";
import LessonPage from "./LessonPage.vue";

export default [
  {
    path: "/learn/path",
    name: "path",
    component: PathMapPage,
    meta: { parent: "learn" },
  },
  {
    path: "/learn/path/:sectionId",
    name: "path-lesson",
    component: LessonPage,
    meta: { parent: "path" },
  },
];