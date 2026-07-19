import { describe, it, expect, beforeEach } from "vitest";
import { pushInPageBackHandler } from "../inPageBack.js";
import { installAndroidBridge } from "@/app/androidBridge.js";

describe("pushInPageBackHandler", () => {
  beforeEach(() => {
    delete window.__amigaGoBackInPage;
    delete window.__amigaGoBack;
  });

  it("installs a stacked handler and restores the previous one on release", () => {
    const calls = [];
    const releaseOuter = pushInPageBackHandler(() => {
      calls.push("outer");
      return "navigated";
    });
    const releaseInner = pushInPageBackHandler(() => {
      calls.push("inner");
      return "navigated";
    });

    expect(window.__amigaGoBackInPage()).toBe("navigated");
    expect(calls).toEqual(["inner"]);

    releaseInner();
    calls.length = 0;
    expect(window.__amigaGoBackInPage()).toBe("navigated");
    expect(calls).toEqual(["outer"]);

    releaseOuter();
    expect(window.__amigaGoBackInPage).toBeUndefined();
  });

  it("falls through to the previous handler when the top returns null", () => {
    const releaseOuter = pushInPageBackHandler(() => "navigated");
    const releaseInner = pushInPageBackHandler(() => null);

    expect(window.__amigaGoBackInPage()).toBe("navigated");

    releaseInner();
    releaseOuter();
  });

  it("WordPopup-style close is consumed by __amigaGoBack without route replace", () => {
    const router = {
      currentRoute: { value: { meta: { parent: "news" } } },
      replace: vi.fn(),
    };
    installAndroidBridge({ router, targetWindow: window, documentRef: document });

    let closed = false;
    const release = pushInPageBackHandler(() => {
      closed = true;
      return "navigated";
    });

    expect(window.__amigaGoBack()).toBe("navigated");
    expect(closed).toBe(true);
    expect(router.replace).not.toHaveBeenCalled();

    release();
    expect(window.__amigaGoBack()).toBe("navigated");
    expect(router.replace).toHaveBeenCalledWith({ name: "news" });
  });
});
