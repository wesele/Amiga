import ProfilePage from "./ProfilePage.vue";
import SettingsPage from "./SettingsPage.vue";
import LlmConfigPage from "./LlmConfigPage.vue";

// See src/modules/news/routes.js for the meta.parent convention.
export default [
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
    component: LlmConfigPage,
    meta: { parent: "settings" },
  },
];
