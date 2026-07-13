import { computed, ref } from "vue";

const PULL_THRESHOLD = 72;
const PULL_MAX_DISTANCE = 108;

export function usePullToRefresh({ isRefreshing, refresh }) {
  const pullDistance = ref(0);
  let pullStartY = null;

  const pullReady = computed(() => pullDistance.value >= PULL_THRESHOLD);

  function isAtTop() {
    return Number(window.scrollY || document.documentElement.scrollTop || 0) <= 0;
  }

  function onPullStart(event) {
    if (isRefreshing.value || !isAtTop() || event.touches.length !== 1) return;
    pullStartY = event.touches[0].clientY;
  }

  function onPullMove(event) {
    if (pullStartY == null || isRefreshing.value) return;
    const distance = event.touches[0].clientY - pullStartY;
    if (distance <= 0) return resetPull();

    event.preventDefault();
    pullDistance.value = Math.min(PULL_MAX_DISTANCE, distance * 0.5);
  }

  async function onPullEnd() {
    const shouldRefresh = pullReady.value && !isRefreshing.value;
    resetPull();
    if (shouldRefresh) await refresh();
  }

  function resetPull() {
    pullStartY = null;
    pullDistance.value = 0;
  }

  return { pullDistance, pullReady, onPullStart, onPullMove, onPullEnd, resetPull };
}
