import { describe, it, expect, vi, beforeEach } from "vitest";
import { installAndroidBridge } from "../androidBridge.js";

function makeRouter(parent) {
  return {
    currentRoute: { value: { meta: { parent } } },
    replace: vi.fn(),
  };
}

describe("installAndroidBridge", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
  });

  it("installs hierarchical back navigation", () => {
    const router = makeRouter("news");
    const targetWindow = {};

    installAndroidBridge({ router, targetWindow, documentRef: document });

    expect(targetWindow.__amigaGoBack()).toBe("navigated");
    expect(router.replace).toHaveBeenCalledWith({ name: "news" });
  });

  it("lets an in-page handler consume the back action", () => {
    const router = makeRouter("news");
    const targetWindow = { __amigaGoBackInPage: vi.fn(() => "at-root") };

    installAndroidBridge({ router, targetWindow, documentRef: document });

    expect(targetWindow.__amigaGoBack()).toBe("at-root");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("converts native device-pixel insets into CSS pixels", () => {
    const targetWindow = { devicePixelRatio: 2 };

    installAndroidBridge({
      router: makeRouter(null),
      targetWindow,
      documentRef: document,
    });
    targetWindow.__amigaSetInsets(40, 20, 10, 4);

    const style = document.documentElement.style;
    expect(style.getPropertyValue("--safe-top")).toBe("20px");
    expect(style.getPropertyValue("--safe-bottom")).toBe("10px");
    expect(style.getPropertyValue("--safe-left")).toBe("5px");
    expect(style.getPropertyValue("--safe-right")).toBe("2px");
  });

  it("replays pending insets and requests a fresh dispatch", () => {
    const requestInsets = vi.fn();
    const targetWindow = {
      devicePixelRatio: 1,
      __amigaPendingInsets: [1, 2, 3, 4],
      __amigaInsets: { requestInsets },
    };

    installAndroidBridge({
      router: makeRouter(null),
      targetWindow,
      documentRef: document,
    });

    expect(document.documentElement.style.getPropertyValue("--safe-bottom")).toBe("2px");
    expect(requestInsets).toHaveBeenCalledTimes(1);
  });
});
