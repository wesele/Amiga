import AppShell from "./AppShell.vue";

export default [
  {
    path: "/",
    name: "shell",
    component: AppShell,
    children: [
      {
        path: "",
        redirect: { name: "news" },
      },
      // News module routes will be registered dynamically
      // Profile module routes will be registered dynamically
    ],
  },
];
