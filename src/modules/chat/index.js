import routes from "./routes.js";
import { bootSocialInbox, stopSocialInbox } from "./social/socialInboxService.js";

export default {
  name: "chat",
  displayName: "聊天",
  routes,
  init(kernel) {
    // The social inbox runs from app boot so that group and direct
    // messages can arrive on any tab (not only inside /chat), and so
    // that the bottom-nav unread dot + contact badges reflect server
    // state immediately. The listener is also responsible for pulling
    // any messages that were cached server-side while the app was
    // closed.
    bootSocialInbox().catch(() => {});
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => {
        stopSocialInbox();
      });
    }
  },
};
