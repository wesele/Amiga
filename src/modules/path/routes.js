import PathMapPage from "./PathMapPage.vue";
import LessonPage from "./LessonPage.vue";
import MistakeReviewPage from "./MistakeReviewPage.vue";
import FocusPracticePage from "./FocusPracticePage.vue";
import TeachingPage from "./TeachingPage.vue";

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
    path: "/learn/path/review/mistakes",
    name: "path-mistake-review",
    component: MistakeReviewPage,
    meta: { parent: "learn" },
  },
  {
    path: "/learn/path/practice/:typeId",
    name: "path-focus-practice",
    component: FocusPracticePage,
    meta: { parent: "learn" },
  },
  {
    path: "/learn/path/:sectionId",
    name: "path-lesson",
    component: LessonPage,
    meta: { parent: "path" },
  },
];