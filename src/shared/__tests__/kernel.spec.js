import { Kernel } from "../kernel.js";
import { createRouter, createWebHistory } from "vue-router";

vi.mock("@/shared/eventBus.js", () => ({
  eventBus: { emit: vi.fn() },
}));

describe("Kernel", () => {
  let kernel;
  let router;

  beforeEach(() => {
    kernel = new Kernel();
    router = createRouter({
      history: createWebHistory(),
      routes: [],
    });
  });

  afterEach(() => {
    kernel.reset();
  });

  describe("init", () => {
    it("stores router and pinia references", () => {
      const pinia = { install: vi.fn() };
      kernel.init(router, pinia);
      expect(kernel.router).toBe(router);
      expect(kernel.pinia).toBe(pinia);
    });
  });

  describe("getModule", () => {
    it("returns null for unloaded module", () => {
      expect(kernel.getModule("nonexistent")).toBeNull();
    });
  });

  describe("use", () => {
    it("calls plugin.install with kernel reference", () => {
      const plugin = { install: vi.fn() };
      kernel.use(plugin);
      expect(plugin.install).toHaveBeenCalledWith(kernel);
    });

    it("adds plugin to internal list", () => {
      const plugin = { install: vi.fn() };
      kernel.use(plugin);
      expect(kernel._plugins).toContain(plugin);
    });

    it("handles plugin without install method", () => {
      const plugin = {};
      expect(() => kernel.use(plugin)).not.toThrow();
    });
  });

  describe("loadModule", () => {
    it("loads a module using custom loader", async () => {
      kernel.init(router, null);
      const moduleDef = {
        default: {
          name: "test-module",
          displayName: "Test Module",
          version: "1.0.0",
          routes: [{ path: "/test", name: "test", component: {} }],
        },
      };
      const loader = vi.fn().mockResolvedValue(moduleDef);
      await kernel.loadModule("test-module", { loader });
      expect(loader).toHaveBeenCalledWith("test-module");
      expect(kernel.getModule("test-module")).toBe(moduleDef.default);
    });

    it("registers routes through router.addRoute", async () => {
      kernel.init(router, null);
      const addRouteSpy = vi.spyOn(router, "addRoute");
      const moduleDef = {
        default: {
          name: "test-module",
          routes: [{ path: "/test", name: "test", component: {} }],
        },
      };
      await kernel.loadModule("test-module", { loader: () => Promise.resolve(moduleDef) });
      expect(addRouteSpy).toHaveBeenCalledWith({ path: "/test", name: "test", component: {} });
    });

    it("registers child routes with parent", async () => {
      kernel.init(router, null);
      const addRouteSpy = vi.spyOn(router, "addRoute");
      const moduleDef = {
        default: {
          name: "child-module",
          routes: [{ path: "/child", name: "child", component: {} }],
        },
      };
      await kernel.loadModule("child-module", { parent: "parent", loader: () => Promise.resolve(moduleDef) });
      expect(addRouteSpy).toHaveBeenCalledWith("parent", { path: "/child", name: "child", component: {} });
    });

    it("calls module init with kernel", async () => {
      kernel.init(router, null);
      const initFn = vi.fn();
      const moduleDef = {
        default: {
          name: "init-module",
          init: initFn,
        },
      };
      await kernel.loadModule("init-module", { loader: () => Promise.resolve(moduleDef) });
      expect(initFn).toHaveBeenCalledWith(kernel);
    });

    it("returns cached module on subsequent load", async () => {
      kernel.init(router, null);
      const moduleDef = {
        default: {
          name: "cached-module",
          routes: [{ path: "/cached", name: "cached", component: {} }],
        },
      };
      const loader = vi.fn().mockResolvedValue(moduleDef);
      const result1 = await kernel.loadModule("cached-module", { loader });
      const result2 = await kernel.loadModule("cached-module", { loader });
      expect(result1).toBe(result2);
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it("handles module without routes", async () => {
      kernel.init(router, null);
      const moduleDef = { default: { name: "no-routes" } };
      await expect(
        kernel.loadModule("no-routes", { loader: () => Promise.resolve(moduleDef) })
      ).resolves.toBeDefined();
    });

    it("throws when loader fails", async () => {
      kernel.init(router, null);
      const loader = () => Promise.reject(new Error("Load failed"));
      await expect(kernel.loadModule("fail", { loader })).rejects.toThrow("Load failed");
    });
  });

  describe("reset", () => {
    it("clears all state", () => {
      kernel.init(router, null);
      kernel._modules.set("test", { name: "test" });
      kernel._plugins.push({});
      kernel.reset();
      expect(kernel.router).toBeNull();
      expect(kernel.pinia).toBeNull();
      expect(kernel._modules.size).toBe(0);
      expect(kernel._plugins.length).toBe(0);
    });
  });
});
