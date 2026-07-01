import { describe, it, expect, vi } from "vitest";
import { applyQueryLocale } from "../queryLocale.js";

describe("applyQueryLocale", () => {
  it("applies locale from query string without persisting it", async () => {
    const setLocale = vi.fn();
    const targetWindow = { location: { search: "?locale=en" } };

    await applyQueryLocale({ targetWindow, setLocale });

    expect(setLocale).toHaveBeenCalledWith("en", { persist: false });
  });

  it("does nothing when locale is absent", async () => {
    const setLocale = vi.fn();

    await applyQueryLocale({ targetWindow: { location: { search: "?x=1" } }, setLocale });

    expect(setLocale).not.toHaveBeenCalled();
  });
});
