import { useRoute, useRouter } from "vue-router";

/**
 * Navigate back to the declared parent route when available, otherwise history.back().
 *
 * @param {{ route?: import('vue-router').RouteLocationNormalizedLoaded, router?: import('vue-router').Router }} [options]
 */
export function useParentBack(options = {}) {
  const route = options.route ?? useRoute();
  const router = options.router ?? useRouter();

  function goBack() {
    const parent = route?.meta?.parent;
    if (parent) {
      router.replace({ name: parent });
    } else {
      router.back();
    }
  }

  return { goBack };
}