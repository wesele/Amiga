import ProfilePage from "./ProfilePage.vue";
import SettingsPage from "./SettingsPage.vue";

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
  {
    path: "/profile/llm-config",
    name: "llm-config",
    component: () => import("./LlmConfigPage.vue"),
    meta: { parent: "settings" },
  },
  {
    path: "/profile/multimodal-config",
    name: "multimodal-config",
    component: () => import("./MultimodalConfigPage.vue"),
    meta: { parent: "settings" },
  },
];

export default routes;
