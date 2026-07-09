import { bootSocialInbox, stopSocialInbox } from "@/modules/chat/social/socialInboxService.js";

let installed = false;

export function installSocialInboxService(targetWindow = typeof window === "undefined" ? null : window) {
  if (installed) return;
  installed = true;

  bootSocialInbox().catch((e) => {
    console.debug("Social inbox boot failed", e);
  });

  if (targetWindow) {
    targetWindow.addEventListener("beforeunload", () => {
      stopSocialInbox();
    });
  }
}
