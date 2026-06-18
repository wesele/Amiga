import ProfilePage from "./ProfilePage.vue";
import SettingsPage from "./SettingsPage.vue";
import LlmConfigPage from "./LlmConfigPage.vue";

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
  },
  {
    path: "/profile/llm-config/:type",
    name: "llm-config",
    component: LlmConfigPage,
  },
];
