import { setActivePinia, createPinia } from "pinia";
import { useAppStore } from "../app.js";

describe("useAppStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe("initial state", () => {
    it("has default title 'Idioma'", () => {
      const store = useAppStore();
      expect(store.title).toBe("Idioma");
    });

    it("starts with empty loadedModules", () => {
      const store = useAppStore();
      expect(store.loadedModules).toEqual([]);
    });
  });

  describe("setTitle", () => {
    it("updates the title", () => {
      const store = useAppStore();
      store.setTitle("新闻阅读");
      expect(store.title).toBe("新闻阅读");
    });
  });

  describe("registerModule", () => {
    it("adds module name to loadedModules", () => {
      const store = useAppStore();
      store.registerModule("news");
      expect(store.loadedModules).toContain("news");
    });

    it("does not add duplicate module names", () => {
      const store = useAppStore();
      store.registerModule("news");
      store.registerModule("news");
      expect(store.loadedModules.length).toBe(1);
    });

    it("preserves insertion order", () => {
      const store = useAppStore();
      store.registerModule("shell");
      store.registerModule("news");
      store.registerModule("profile");
      expect(store.loadedModules).toEqual(["shell", "news", "profile"]);
    });
  });
});
