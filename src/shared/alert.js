import { eventBus } from "@/shared/eventBus.js";

export const ALERT_SHOW = "alert:show";

/** @typedef {{ title?: string, message?: string, confirmText?: string }} AlertPayload */

/**
 * Show a global alert dialog (single OK button). Wired in App.vue via eventBus.
 * @param {AlertPayload} payload
 */
export function showAlert(payload = {}) {
  eventBus.emit(ALERT_SHOW, payload);
}