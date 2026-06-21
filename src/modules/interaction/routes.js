import ContactList from "./ContactList.vue";
import InteractionPage from "./InteractionPage.vue";
import MarkdownPreview from "./MarkdownPreview.vue";

// See src/modules/news/routes.js for the meta.parent convention.
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
    meta: { parent: "interaction" },
  },
  {
    path: "/interaction/preview",
    name: "interaction-preview",
    component: MarkdownPreview,
    meta: { parent: "interaction" },
  },
];
