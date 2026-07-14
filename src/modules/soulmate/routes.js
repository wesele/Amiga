import SoulMateChat from "./SoulMateChat.vue";
import SoulMateHome from "./SoulMateHome.vue";
import SoulMateSetup from "./SoulMateSetup.vue";
import SoulMateStory from "./SoulMateStory.vue";

export default [
  {
    path: "/learn/soulmate",
    name: "soulmate",
    component: SoulMateHome,
    meta: { parent: "learn" },
  },
  {
    path: "/learn/soulmate/setup",
    name: "soulmate-setup",
    component: SoulMateSetup,
    meta: { parent: "soulmate" },
  },
  {
    path: "/learn/soulmate/story/:episodeId",
    name: "soulmate-story",
    component: SoulMateStory,
    meta: { parent: "soulmate" },
    props: true,
  },
  {
    path: "/learn/soulmate/chat/:episodeId",
    name: "soulmate-chat",
    component: SoulMateChat,
    meta: { parent: "soulmate" },
    props: true,
  },
];
