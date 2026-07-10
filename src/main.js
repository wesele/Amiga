import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { createRouter } from "./router";
import "./style.css";
import { kernel } from "./shared/kernel";
import { isWizardCompleted } from "./shared/api.js";
import { useTargetLangStore } from "./stores/targetLang.js";
import i18nPlugin, { initLocale, i18n, setLocale } from "./shared/i18n/index.js";
import { installAndroidBridge } from "./app/androidBridge.js";
import { loadFeatureModules, loadShellModule } from "./app/modules.js";
import { applyQueryLocale } from "./app/queryLocale.js";
import { installWizardGuard } from "./app/routeGuards.js";
import { installSocialInboxService } from "./app/socialInbox.js";
import { installAppOpenTracker } from "./shared/appOpenTracker.js";

async function bootstrap() {
  // Browser-dev escape hatch: `?locale=en` (or `es` / `zh`) overrides the
  // persistent setting. Useful for headless screenshots and for previewing
  // translations without having a Tauri shell running.
  await applyQueryLocale({ setLocale });

  // Hydrate the UI language from persistent storage before the first render,
  // so the wizard / shell display in the user's chosen language.
  await initLocale();

  const app = createApp(App);
  const pinia = createPinia();
  const router = createRouter();

  installAndroidBridge({ router });

  app.use(pinia);
  app.use(router);
  app.use(i18nPlugin);

  // Mirror the locale on <html lang> for accessibility / OS-level tooling.
  document.documentElement.lang = i18n.locale.value;

  kernel.init(router, pinia);

  // Hydrate the active target language before any module mounts, so the
  // first onMounted in news/vocab/chat reads a ready store instead of
  // racing against the backend roundtrip.
  await useTargetLangStore(pinia).load();

  // Load shell first (provides the layout)
  await loadShellModule(kernel);

  // Route guard: force wizard if not completed; block re-entry once done
  installWizardGuard(router, { isWizardCompleted });

  // Load feature modules
  await loadFeatureModules(kernel);

  // Global background service: messages can arrive outside the chat tab.
  installSocialInboxService();
  installAppOpenTracker(router);

  app.mount("#app");

  // Fix: force re-resolve after mount to handle race condition
  // between async beforeEach guard and dynamic route registration
  await router.replace(router.currentRoute.value.fullPath);
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err);
  const root = document.getElementById("app");
  if (root) {
    root.innerHTML =
      '<p style="padding:24px;font-family:sans-serif;color:#333">应用启动失败，请重启或重新安装。</p>';
  }
});
