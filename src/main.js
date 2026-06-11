import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { createRouter } from "./router";
import "./style.css";
import { kernel } from "./shared/kernel";

async function bootstrap() {
  const app = createApp(App);
  const pinia = createPinia();
  const router = createRouter();

  app.use(pinia);
  app.use(router);

  kernel.init(router, pinia);

  await kernel.loadModule("shell");
  await kernel.loadModule("hello");

  app.mount("#app");
}

bootstrap();
