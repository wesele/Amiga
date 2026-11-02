import { recordAppOpen } from "@/shared/api.js";

export function installAppOpenTracker(router) {
  const record = () => recordAppOpen().catch((error) => {
    console.warn("Failed to record app open:", error);
  });
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") record();
  };

  record();
  const removeAfterEach = router.afterEach(record);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    removeAfterEach();
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
