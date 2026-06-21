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

  // Android safe-area bridge: the native MainActivity calls
  // `window.__amigaSetInsets({top, bottom, left, right})` whenever the
  // system-bar insets change (status bar / nav bar / IME). We mirror
  // them onto :root as `--amiga-safe-*` so the CSS env()-free fallback
  // picks them up. On desktop / iOS the native side never calls this,
  // and the env() fallback in style.css handles the (rare) case where
  // the page is shown in a WKWebView with actual safe-area insets.
  //
  // The function MUST be defined before the native bridge first fires,
  // which is right after onWebViewCreate — so install it synchronously
  // at the very top of bootstrap, ahead of any module load.
  if (typeof window !== "undefined") {
    window.__amigaSetInsets = (insets) => {
      if (!insets || typeof insets !== "object") return;
      const root = document.documentElement;
      const set = (k, v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) {
          root.style.setProperty(`--amiga-safe-${k}`, `${Math.round(n)}px`);
        }
      };
      set("top", insets.top);
      set("bottom", insets.bottom);
      set("left", insets.left);
      set("right", insets.right);
    };
  }

  // Hydrate the UI language from persistent storage before the first render,
  // so the wizard / shell display in the user's chosen language.
  await initLocale();

  const app = createApp(App);
  const pinia = createPinia();
  const router = createRouter();

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
