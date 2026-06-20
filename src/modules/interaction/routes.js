import ContactList from "./ContactList.vue";
import InteractionPage from "./InteractionPage.vue";
import MarkdownPreview from "./MarkdownPreview.vue";

export default [
  {
    path: "/interaction",
    name: "interaction",
    component: ContactList,
  },
  {
    path: "/interaction/chat/:sessionId",
    name: "interaction-chat",
    component: InteractionPage,
  },
  {
    path: "/interaction/preview",
    name: "interaction-preview",
    component: MarkdownPreview,
  },
];
