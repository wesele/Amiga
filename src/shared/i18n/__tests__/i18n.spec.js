import { describe, it, expect, beforeEach, vi } from "vitest";
import * as api from "@/shared/api.js";
import { i18n as i18nInstance, t, setLocale, initLocale, useI18n } from "@/shared/i18n/index.js";

vi.mock("@/shared/api.js", () => ({
  getSetting: vi.fn(),
  saveSetting: vi.fn(),
}));

describe("i18n", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    api.saveSetting.mockResolvedValue(undefined);
    setLocale("zh", { persist: false });
  });

  describe("t()", () => {
    it("returns the key's value in the active locale", () => {
      setLocale("zh", { persist: false });
      expect(t("nav.learn")).toBe("学习");
      setLocale("en", { persist: false });
      expect(t("nav.learn")).toBe("Learn");
      setLocale("es", { persist: false });
      expect(t("nav.learn")).toBe("Aprender");
    });

    it("interpolates {name} placeholders", () => {
      setLocale("zh", { persist: false });
      expect(t("news.refreshed", { n: 5 })).toBe("已获取 5 条最新新闻");
      setLocale("en", { persist: false });
      expect(t("news.refreshed", { n: 12 })).toBe("Fetched 12 latest articles");
    });

    it("returns the dotted key string when missing in all locales", () => {
      setLocale("zh", { persist: false });
      expect(t("foo.bar.baz")).toBe("foo.bar.baz");
    });

    it("leaves unreplaced {name} tokens intact when param is undefined", () => {
      setLocale("zh", { persist: false });
      expect(t("wizard.completeTarget", { lang: undefined })).toContain(
        "{lang}",
      );
    });
  });

  describe("setLocale()", () => {
    it("updates the locale", () => {
      setLocale("en", { persist: false });
      expect(i18nInstance.locale.value).toBe("en");
    });

    it("persists to the backend by default", () => {
      setLocale("es");
      expect(api.saveSetting).toHaveBeenCalledWith("ui_language", "es");
    });

    it("does not persist when persist:false", () => {
      setLocale("en", { persist: false });
      expect(api.saveSetting).not.toHaveBeenCalled();
    });

    it("falls back to the default locale for unknown inputs", () => {
      setLocale("xx", { persist: false });
      expect(i18nInstance.locale.value).toBe("zh");
    });
  });

  describe("initLocale()", () => {
    it("hydrates from app_settings on boot", async () => {
      api.getSetting.mockResolvedValue("en");
      await initLocale();
      expect(i18nInstance.locale.value).toBe("en");
    });

    it("keeps the default when the saved value is invalid", async () => {
      api.getSetting.mockResolvedValue("xx");
      await initLocale();
      expect(i18nInstance.locale.value).toBe("zh");
    });

    it("keeps the default when the backend is unavailable", async () => {
      api.getSetting.mockRejectedValue(new Error("offline"));
      await initLocale();
      expect(i18nInstance.locale.value).toBe("zh");
    });
  });

  describe("useI18n()", () => {
    it("returns a stable t() function and a readonly locale ref", () => {
      const a = useI18n();
      const b = useI18n();
      expect(a.t).toBe(b.t);
      expect(a.t("nav.learn")).toBeTruthy();
    });
  });

  describe("dictionaries", () => {
    it("defines the same set of top-level namespaces in every locale", async () => {
      const zhMod = await import("@/shared/i18n/zh.js");
      const enMod = await import("@/shared/i18n/en.js");
      const esMod = await import("@/shared/i18n/es.js");
      const zh = Object.keys(zhMod.default).sort();
      const en = Object.keys(enMod.default).sort();
      const es = Object.keys(esMod.default).sort();
      expect(zh).toEqual(en);
      expect(zh).toEqual(es);
    });
  });
});
