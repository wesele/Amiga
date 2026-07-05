import SpeakingTopicList from "./SpeakingTopicList.vue";
import SpeakingDialogue from "./SpeakingDialogue.vue";
import SpeakingSummary from "./SpeakingSummary.vue";

export default [
  {
    path: "/learn/speaking",
    name: "speaking",
    component: SpeakingTopicList,
    meta: { parent: "learn" },
  },
  {
    path: "/learn/speaking/:topicId",
    name: "speaking-dialogue",
    component: SpeakingDialogue,
    meta: { parent: "speaking" },
    props: true,
  },
  {
    path: "/learn/speaking/:topicId/summary",
    name: "speaking-summary",
    component: SpeakingSummary,
    meta: { parent: "speaking" },
    props: true,
  },
];
