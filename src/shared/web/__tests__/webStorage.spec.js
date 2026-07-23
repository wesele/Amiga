import { describe, expect, it } from "vitest";
import { createMemoryStateStore } from "../webStorage.js";

describe("WebStateStore", () => {
  it("serializes mutations and can reset to the seed", async () => {
    const store = createMemoryStateStore(() => ({ count: 0 }));

    await Promise.all([
      store.update((state) => { state.count += 1; return state.count; }),
      store.update((state) => { state.count += 1; return state.count; }),
    ]);
    expect((await store.get()).count).toBe(2);

    await store.reset();
    expect((await store.get()).count).toBe(0);
  });
});
