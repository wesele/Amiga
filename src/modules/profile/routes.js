import ProfilePage from "./ProfilePage.vue";
import SettingsPage from "./SettingsPage.vue";
import { isTvMode } from "@/shared/appMode.js";

// See src/modules/news/routes.js for the meta.parent convention.
const routes = [
  {
    path: "/profile",
    name: "profile",
    component: ProfilePage,
  },
  {
    path: "/profile/settings",
    name: "settings",
    component: SettingsPage,
    meta: { parent: "profile" },
  },
];

if (!isTvMode) {
  routes.push({
    path: "/profile/llm-config",
    name: "llm-config",
    component: () => import("./LlmConfigPage.vue"),
    meta: { parent: "settings" },
  });
  routes.push({
    path: "/profile/multimodal-config",
    name: "multimodal-config",
    component: () => import("./MultimodalConfigPage.vue"),
    meta: { parent: "settings" },
  });
}

export default routes;
