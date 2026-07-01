export function installWizardGuard(router, { isWizardCompleted }) {
  if (!router || typeof isWizardCompleted !== "function") {
    throw new TypeError("installWizardGuard requires a router and isWizardCompleted function");
  }

  router.beforeEach(async (to) => {
    try {
      const completed = await isWizardCompleted();
      if (to.name === "wizard") {
        return completed ? { name: "learn" } : true;
      }
      if (!completed) {
        return { name: "wizard" };
      }
    } catch {
      // Browser-only Vite dev cannot call Tauri. Allow navigation there.
    }
    return true;
  });
}
