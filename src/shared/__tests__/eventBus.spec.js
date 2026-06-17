import { EventBus } from "../eventBus.js";

describe("EventBus", () => {
  let bus;

  beforeEach(() => {
    bus = new EventBus();
  });

  describe("on / emit", () => {
    it("calls registered listener when event is emitted", () => {
      const fn = vi.fn();
      bus.on("test", fn);
      bus.emit("test");
      expect(fn).toHaveBeenCalledOnce();
    });

    it("calls listener with arguments", () => {
      const fn = vi.fn();
      bus.on("test", fn);
      bus.emit("test", "a", 1);
      expect(fn).toHaveBeenCalledWith("a", 1);
    });

    it("calls multiple listeners for same event", () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      bus.on("test", fn1);
      bus.on("test", fn2);
      bus.emit("test");
      expect(fn1).toHaveBeenCalledOnce();
      expect(fn2).toHaveBeenCalledOnce();
    });

    it("does nothing when no listeners registered", () => {
      expect(() => bus.emit("nonexistent")).not.toThrow();
    });
  });

  describe("off", () => {
    it("removes a specific listener", () => {
      const fn = vi.fn();
      bus.on("test", fn);
      bus.off("test", fn);
      bus.emit("test");
      expect(fn).not.toHaveBeenCalled();
    });

    it("does not affect other listeners", () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      bus.on("test", fn1);
      bus.on("test", fn2);
      bus.off("test", fn1);
      bus.emit("test");
      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).toHaveBeenCalledOnce();
    });

    it("does nothing if event does not exist", () => {
      const fn = vi.fn();
      expect(() => bus.off("test", fn)).not.toThrow();
    });
  });

  describe("once", () => {
    it("calls listener only on first emit", () => {
      const fn = vi.fn();
      bus.once("test", fn);
      bus.emit("test");
      bus.emit("test");
      expect(fn).toHaveBeenCalledOnce();
    });
  });

  describe("on return value (unsubscribe)", () => {
    it("returns unsubscribe function", () => {
      const fn = vi.fn();
      const unsubscribe = bus.on("test", fn);
      unsubscribe();
      bus.emit("test");
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe("clear", () => {
    it("removes all listeners", () => {
      const fn = vi.fn();
      bus.on("test", fn);
      bus.clear();
      bus.emit("test");
      expect(fn).not.toHaveBeenCalled();
    });

    it("allows new listeners after clear", () => {
      bus.on("test", vi.fn());
      bus.clear();
      const fn = vi.fn();
      bus.on("test", fn);
      bus.emit("test");
      expect(fn).toHaveBeenCalledOnce();
    });
  });
});
