import LearnHubPage from "./LearnHubPage.vue";
import { isTvMode, isWebMode } from "@/shared/appMode.js";

const routes = [
  {
    path: "/learn",
    name: "learn",
    component: LearnHubPage,
  },
];

if (!isTvMode) {
  routes.push({
    path: "/learn/translator/:sessionId",
    name: "learn-translator",
    component: () => import("@/modules/ai-chat/ChatPage.vue"),
    meta: { parent: "learn" },
  });
}

if (!isTvMode && !isWebMode) {
  routes.push(
    {
      path: "/learn/teaching",
      name: "learn-teaching",
      component: () => import("./TeachingPage.vue"),
      meta: { parent: "learn" },
    },
    {
      path: "/learn/teaching/:topicId",
      name: "learn-teaching-classroom",
      component: () => import("@/modules/reading/ClassroomPage.vue"),
      props: true,
      meta: { parent: "learn-teaching" },
    },
  );
}

export default routes;
