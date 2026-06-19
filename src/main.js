import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { createRouter } from "./router";
import "./style.css";
import { kernel } from "./shared/kernel";
import { isWizardCompleted } from "./shared/api.js";

async function bootstrap() {
  const app = createApp(App);
  const pinia = createPinia();
  const router = createRouter();

  app.use(pinia);
  app.use(router);

  kernel.init(router, pinia);

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
