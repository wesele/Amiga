import ProfilePage from "./ProfilePage.vue";
import SettingsPage from "./SettingsPage.vue";

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
];
