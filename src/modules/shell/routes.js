import AppShell from "./AppShell.vue";

export default [
  {
    path: "/",
    name: "shell",
    component: AppShell,
    children: [
      {
        path: "",
        redirect: { name: "learn" },
      },
      // News module routes will be registered dynamically
      // Profile module routes will be registered dynamically
    ],
  },
];
