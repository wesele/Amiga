import LearnHubPage from "./LearnHubPage.vue";
import ChatPage from "../chat/ChatPage.vue";

export default [
  {
    path: "/learn",
    name: "learn",
    component: LearnHubPage,
  },
  {
    path: "/learn/translator/:sessionId",
    name: "learn-translator",
    component: ChatPage,
    meta: { parent: "learn" },
  },
];