import ContactList from "./ContactList.vue";
import InteractionPage from "./InteractionPage.vue";

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
];
