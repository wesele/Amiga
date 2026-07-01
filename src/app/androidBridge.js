export function installAndroidBridge({
  router,
  targetWindow = typeof window === "undefined" ? null : window,
  documentRef = typeof document === "undefined" ? null : document,
} = {}) {
  if (!targetWindow || !router) return;

  targetWindow.__amigaGoBack = () => {
    const inPageResult = targetWindow.__amigaGoBackInPage?.();
    if (inPageResult === "navigated" || inPageResult === "at-root") {
      return inPageResult;
    }
    const route = router.currentRoute.value;
    const parent = route?.meta?.parent;
    if (parent) {
      router.replace({ name: parent });
      return "navigated";
    }
    return "at-root";
  };

  targetWindow.__amigaSetInsets = (top, bottom, left, right) => {
    if (!documentRef?.documentElement) return;
    const dpr = targetWindow.devicePixelRatio || 1;
    const px = (v) => `${Math.round(v / dpr)}px`;
    const root = documentRef.documentElement;
    root.style.setProperty("--safe-top", px(top));
    root.style.setProperty("--safe-bottom", px(bottom));
    root.style.setProperty("--safe-left", px(left));
    root.style.setProperty("--safe-right", px(right));
  };

  if (Array.isArray(targetWindow.__amigaPendingInsets)) {
    const [top, bottom, left, right] = targetWindow.__amigaPendingInsets;
    targetWindow.__amigaSetInsets(top, bottom, left, right);
  }

  targetWindow.__amigaInsets?.requestInsets?.();
}
