import ContactList from "./ContactList.vue";
import ChatPage from "./ChatPage.vue";
import MarkdownPreview from "./MarkdownPreview.vue";
import SocialHub from "./SocialHub.vue";
import SocialChatPage from "./SocialChatPage.vue";

// See src/modules/news/routes.js for the meta.parent convention.
//
// Order matters: `/chat/preview` must come before `/chat/:sessionId` so
// the literal path wins. Otherwise Vue Router would treat the `preview`
// segment as a sessionId and route it into ChatPage.
export default [
  {
    path: "/chat",
    name: "chat",
    component: ContactList,
  },
  {
    path: "/chat/social",
    name: "social-hub",
    component: SocialHub,
    meta: { parent: "chat" },
  },
  {
    path: "/chat/social/:mode/:peerId?",
    name: "social-chat",
    component: SocialChatPage,
    meta: { parent: "chat" },
  },
  {
    path: "/chat/preview",
    name: "chat-preview",
    component: MarkdownPreview,
    meta: { parent: "chat" },
  },
  {
    path: "/chat/:sessionId",
    name: "chat-session",
    component: ChatPage,
    meta: { parent: "chat" },
  },
];
