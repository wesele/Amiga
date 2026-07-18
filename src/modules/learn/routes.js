import LearnHubPage from "./LearnHubPage.vue";
import { isTvMode } from "@/shared/appMode.js";

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

export default routes;
