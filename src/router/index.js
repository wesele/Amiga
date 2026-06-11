import { createRouter as _createRouter, createWebHistory } from "vue-router";

export function createRouter() {
  const router = _createRouter({
    history: createWebHistory(),
    routes: [],
  });
  return router;
}
