import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "@/shared/api.js";
import { installAppOpenTracker } from "@/shared/appOpenTracker.js";

describe("installAppOpenTracker", () => {
  let cleanup;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  it("records startup, navigation, and returning to the foreground", async () => {
    const invoke = vi.fn(() => Promise.resolve(true));
    api.__setInvoke(invoke);
    let afterEachHandler;
    const router = {
      afterEach: vi.fn((handler) => {
        afterEachHandler = handler;
        return vi.fn();
      }),
    };

    cleanup = installAppOpenTracker(router);
    afterEachHandler();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(invoke).toHaveBeenCalledTimes(3);
    expect(invoke).toHaveBeenCalledWith("record_app_open_cmd");
  });
});
