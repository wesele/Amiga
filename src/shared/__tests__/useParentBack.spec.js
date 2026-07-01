import { describe, it, expect, vi } from "vitest";
import { useParentBack } from "@/shared/useParentBack.js";

describe("useParentBack", () => {
  it("replaces with parent route when meta.parent is set", () => {
    const replace = vi.fn();
    const back = vi.fn();
    const route = { meta: { parent: "learn" } };
    const router = { replace, back };

    const { goBack } = useParentBack({ route, router });
    goBack();

    expect(replace).toHaveBeenCalledWith({ name: "learn" });
    expect(back).not.toHaveBeenCalled();
  });

  it("falls back to router.back when meta.parent is missing", () => {
    const replace = vi.fn();
    const back = vi.fn();
    const route = { meta: {} };
    const router = { replace, back };

    const { goBack } = useParentBack({ route, router });
    goBack();

    expect(back).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });
});