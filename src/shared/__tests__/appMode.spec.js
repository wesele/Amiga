import { describe, expect, it } from "vitest";
import { APP_MODE_DEFAULT, APP_MODE_TV, resolveAppMode } from "../appMode.js";

describe("app mode", () => {
  it("uses TV mode only for the explicit build flag", () => {
    expect(resolveAppMode({ VITE_AMIGA_TV: "1" })).toBe(APP_MODE_TV);
    expect(resolveAppMode({ VITE_AMIGA_TV: "0" })).toBe(APP_MODE_DEFAULT);
    expect(resolveAppMode({})).toBe(APP_MODE_DEFAULT);
  });
});
