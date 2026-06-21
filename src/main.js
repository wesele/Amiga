import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { createRouter } from "./router";
import "./style.css";
import { kernel } from "./shared/kernel";
import { isWizardCompleted } from "./shared/api.js";
import { useTargetLangStore } from "./stores/targetLang.js";
import i18nPlugin, { initLocale, i18n } from "./shared/i18n/index.js";

async function bootstrap() {
  // Browser-dev escape hatch: `?locale=en` (or `es` / `zh`) overrides the
  // persistent setting. Useful for headless screenshots and for previewing
  // translations without having a Tauri shell running.
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const queryLocale = params.get("locale");
    if (queryLocale) {
      const { setLocale } = await import("./shared/i18n/index.js");
      setLocale(queryLocale, { persist: false });
    }
  }

  // Android hierarchical back-navigation bridge.
  //
  // The native MainActivity (see
  // src-tauri/android/.../MainActivity.kt) intercepts the system back
  // press and calls `window.__amigaGoBack()`. We then look at the
  // current Vue Router entry's `meta.parent` and either:
  //   - push that parent route, or
  //   - return the string `"at-root"` so the activity finishes.
  //
  // The function captures `router` from the enclosing scope (or, if
  // the bridge fires before the router is wired — which can happen
  // during a very early back press — we treat it as "at-root").
  //
  // Why we don't use `history.back()`: that walks the *URL* history,
  // not the route hierarchy. A user who navigates /news → /news/123
  // → /interaction/chat via a link would, on back, jump to /news/123
  // (the previous URL) instead of /interaction (the parent). On
  // re-entry the same back presses can also re-trigger cross-tree
  // navigation and loop.

  // Hydrate the UI language from persistent storage before the first render,
  // so the wizard / shell display in the user's chosen language.
  await initLocale();

  const app = createApp(App);
  const pinia = createPinia();
  const router = createRouter();

  if (typeof window !== "undefined") {
    // The native side evaluates this expression and reads the returned
    // string back. We push the parent route and return "navigated" so
    // Kotlin knows to leave the page alone; on a top-level route we
    // return "at-root" so Kotlin calls finish() on the activity.
    //
    // meta.parent is a *route name* (e.g. "news", "settings"), not a
    // path — names are stable across path refactors. We pass it as
    // `{ name: parent }` because `router.push("news")` would be
    // interpreted as a relative path "news" (no leading /) and fail.
    window.__amigaGoBack = () => {
      const route = router.currentRoute.value;
      const parent = route?.meta?.parent;
      if (parent) {
        router.push({ name: parent });
        return "navigated";
      }
      return "at-root";
    };
  }

  app.use(pinia);
  app.use(router);
  app.use(i18nPlugin);

  // Mirror the locale on <html lang> for accessibility / OS-level tooling.
  document.documentElement.lang = i18n.locale.value;

  kernel.init(router, pinia);

  // Hydrate the active target language before any module mounts, so the
  // first onMounted in news/vocab/interaction reads a ready store instead of
  // racing against the backend roundtrip.
  await useTargetLangStore(pinia).load();

  // Load shell first (provides the layout)
  await kernel.loadModule("shell");

  // Route guard: force wizard if not completed
  router.beforeEach(async (to) => {
    // Allow wizard route and reader route to pass through
    if (to.name === "wizard") return true;

    try {
      const completed = await isWizardCompleted();
      if (!completed) {
        return { name: "wizard" };
      }
    } catch {
      // If Tauri is not available (dev in browser), allow access
    }
    return true;
  });

  // Load feature modules
  await kernel.loadModule("wizard");
  await kernel.loadModule("news", { parent: "shell" });
  await kernel.loadModule("vocab", { parent: "shell" });
  await kernel.loadModule("profile", { parent: "shell" });
  await kernel.loadModule("interaction", { parent: "shell" });

  app.mount("#app");

  // Fix: force re-resolve after mount to handle race condition
  // between async beforeEach guard and dynamic route registration
  await router.replace(router.currentRoute.value.fullPath);
}

bootstrap();
