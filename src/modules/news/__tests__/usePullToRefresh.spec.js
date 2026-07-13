import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { usePullToRefresh } from "../usePullToRefresh.js";

function touch(y) {
  return { touches: [{ clientY: y }], preventDefault: vi.fn() };
}

describe("usePullToRefresh", () => {
  it("refreshes after a downward gesture reaches the threshold", async () => {
    const refresh = vi.fn();
    const pull = usePullToRefresh({ isRefreshing: ref(false), refresh });

    pull.onPullStart(touch(0));
    const move = touch(160);
    pull.onPullMove(move);

    expect(pull.pullReady.value).toBe(true);
    expect(move.preventDefault).toHaveBeenCalledOnce();

    await pull.onPullEnd();
    expect(refresh).toHaveBeenCalledOnce();
    expect(pull.pullDistance.value).toBe(0);
  });

  it("does not refresh before the pull reaches the threshold", async () => {
    const refresh = vi.fn();
    const pull = usePullToRefresh({ isRefreshing: ref(false), refresh });

    pull.onPullStart(touch(0));
    pull.onPullMove(touch(80));
    await pull.onPullEnd();

    expect(refresh).not.toHaveBeenCalled();
  });
});
