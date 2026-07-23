import { eventBus } from "@/shared/eventBus.js";

export const INSTALL_APP_PROMPT_REQUESTED = "install-app-prompt-requested";
export const AMIGA_GITHUB_URL = "https://github.com/wesele/Amiga";

export function requestInstallAppPrompt(entry = "") {
  eventBus.emit(INSTALL_APP_PROMPT_REQUESTED, { entry });
}
