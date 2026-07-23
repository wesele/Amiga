import { describe, expect, it } from "vitest";
import {
  APP_MODE_DEFAULT,
  APP_MODE_TV,
  resolveAppMode,
  resolveLayoutMode,
  resolveMobileBrowser,
  resolveMobileWebMode,
} from "../appMode.js";

describe("app mode", () => {
  it("uses TV mode only for the explicit build flag", () => {
    expect(resolveAppMode({ VITE_AMIGA_TV: "1" })).toBe(APP_MODE_TV);
    expect(resolveAppMode({ VITE_AMIGA_TV: "0" })).toBe(APP_MODE_DEFAULT);
    expect(resolveAppMode({})).toBe(APP_MODE_DEFAULT);
  });

  it("recognizes phone browsers but not narrow non-touch desktop windows", () => {
    expect(resolveMobileBrowser({ userAgentDataMobile: true })).toBe(true);
    expect(resolveMobileBrowser({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" })).toBe(true);
    expect(resolveMobileBrowser({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      maxTouchPoints: 0,
      screenWidth: 390,
      viewportWidth: 390,
    })).toBe(false);
  });

  it("uses touch and phone-sized screens as a privacy-friendly fallback", () => {
    expect(resolveMobileBrowser({ maxTouchPoints: 5, screenWidth: 430, viewportWidth: 430 })).toBe(true);
    expect(resolveMobileBrowser({ maxTouchPoints: 5, screenWidth: 1024, viewportWidth: 800 })).toBe(false);
  });

  it("keeps TV features while selecting the phone layout for mobile web", () => {
    expect(resolveLayoutMode({ featureMode: APP_MODE_TV, webMode: true, mobileBrowser: true })).toBe(APP_MODE_DEFAULT);
    expect(resolveLayoutMode({ featureMode: APP_MODE_TV, webMode: true, mobileBrowser: false })).toBe(APP_MODE_TV);
    expect(resolveLayoutMode({ featureMode: APP_MODE_TV, webMode: false, mobileBrowser: true })).toBe(APP_MODE_TV);
  });

  it("supports a deterministic phone-Web override for browser layout tests", () => {
    expect(resolveMobileWebMode({ webMode: true, forcePhone: true })).toBe(true);
    expect(resolveMobileWebMode({ webMode: false, forcePhone: true })).toBe(false);
    expect(resolveMobileWebMode({
      webMode: true,
      signals: { maxTouchPoints: 5, screenWidth: 390, viewportWidth: 390 },
    })).toBe(true);
  });
});
