import LearnHubPage from "./LearnHubPage.vue";
import ReviewPage from "./ReviewPage.vue";
import ChatPage from "@/modules/ai-chat/ChatPage.vue";

export default [
  {
    path: "/learn",
    name: "learn",
    component: LearnHubPage,
  },
  {
    path: "/learn/review",
    name: "review",
    component: ReviewPage,
    meta: { parent: "learn" },
  },
  {
    path: "/learn/translator/:sessionId",
    name: "learn-translator",
    component: ChatPage,
    meta: { parent: "learn" },
  },
];
