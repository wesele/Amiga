import AppShell from "./AppShell.vue";

export default [
  {
    path: "/",
    component: AppShell,
    children: [
      {
        path: "",
        redirect: { name: "hello" },
      },
    ],
  },
];
