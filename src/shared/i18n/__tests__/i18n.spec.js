import { describe, it, expect, beforeEach, vi } from "vitest";
import * as api from "@/shared/api.js";
import { i18n as i18nInstance, t, setLocale, initLocale, useI18n, getLocale } from "@/shared/i18n/index.js";

vi.mock("@/shared/api.js", () => ({
  getSetting: vi.fn(),
  saveSetting: vi.fn(),
  getCurrentUser: vi.fn(),
  updateUser: vi.fn(),
}));

describe("i18n", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    api.saveSetting.mockResolvedValue(undefined);
    api.getCurrentUser.mockResolvedValue({ id: "u1", native_language: "zh" });
    api.updateUser.mockResolvedValue({ id: "u1", native_language: "zh" });
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
      expect(t("news.refreshed", { n: undefined })).toContain("{n}");
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

    it("syncs native_language to the user row when it differs", async () => {
      api.getCurrentUser.mockResolvedValue({ id: "u1", native_language: "zh" });
      setLocale("en");
      await vi.waitFor(() => {
        expect(api.updateUser).toHaveBeenCalledWith({ id: "u1", native_language: "en" });
      });
    });

    it("does not call updateUser when native_language already matches", async () => {
      api.getCurrentUser.mockResolvedValue({ id: "u1", native_language: "en" });
      setLocale("en");
      await new Promise((r) => setTimeout(r, 0));
      expect(api.updateUser).not.toHaveBeenCalled();
    });

    it("does not call updateUser when persist is false", async () => {
      setLocale("en", { persist: false });
      await new Promise((r) => setTimeout(r, 0));
      expect(api.updateUser).not.toHaveBeenCalled();
    });

    it("handles getCurrentUser failure gracefully", async () => {
      api.getCurrentUser.mockRejectedValue(new Error("offline"));
      setLocale("en");
      await new Promise((r) => setTimeout(r, 0));
      expect(i18nInstance.locale.value).toBe("en");
      expect(api.updateUser).not.toHaveBeenCalled();
    });
  });

  describe("initLocale()", () => {
    it("hydrates from user.native_language first", async () => {
      api.getCurrentUser.mockResolvedValue({ id: "u1", native_language: "en" });
      await initLocale();
      expect(i18nInstance.locale.value).toBe("en");
    });

    it("falls back to app_settings when user.native_language is invalid", async () => {
      api.getCurrentUser.mockResolvedValue({ id: "u1", native_language: "xx" });
      api.getSetting.mockResolvedValue("es");
      await initLocale();
      expect(i18nInstance.locale.value).toBe("es");
    });

    it("falls back to app_settings when getCurrentUser fails", async () => {
      api.getCurrentUser.mockRejectedValue(new Error("offline"));
      api.getSetting.mockResolvedValue("en");
      await initLocale();
      expect(i18nInstance.locale.value).toBe("en");
    });

    it("keeps the default when user.native_language is invalid and app_settings fails", async () => {
      api.getCurrentUser.mockResolvedValue({ id: "u1", native_language: "xx" });
      api.getSetting.mockRejectedValue(new Error("offline"));
      await initLocale();
      expect(i18nInstance.locale.value).toBe("zh");
    });

    it("keeps the default when all backends are unavailable", async () => {
      api.getCurrentUser.mockRejectedValue(new Error("offline"));
      api.getSetting.mockRejectedValue(new Error("offline"));
      await initLocale();
      expect(i18nInstance.locale.value).toBe("zh");
    });
  });

  describe("getLocale()", () => {
    it("returns the current locale", () => {
      setLocale("zh", { persist: false });
      expect(getLocale()).toBe("zh");
      setLocale("en", { persist: false });
      expect(getLocale()).toBe("en");
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
