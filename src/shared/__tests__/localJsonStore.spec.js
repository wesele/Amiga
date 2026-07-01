import { afterEach, describe, expect, it, vi } from "vitest";
import { readLocalJson, updateLocalJson, writeLocalJson } from "../localJsonStore.js";

describe("localJsonStore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("reads and writes JSON normally", () => {
    writeLocalJson("test.key", { foo: "bar" });
    expect(readLocalJson("test.key")).toEqual({ foo: "bar" });
    expect(localStorage.getItem("test.key")).toBe(JSON.stringify({ foo: "bar" }));
  });

  it("returns a fallback copy when the key is missing", () => {
    const fallback = { seed: 1 };
    const result = readLocalJson("missing.key", fallback);
    expect(result).toEqual(fallback);
    expect(result).not.toBe(fallback);
  });

  it("returns a fallback copy when JSON is corrupted", () => {
    localStorage.setItem("broken.key", "{not-json");
    const fallback = { safe: true };
    expect(readLocalJson("broken.key", fallback)).toEqual(fallback);
  });

  it("returns a fallback copy when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    const fallback = { offline: true };
    const result = readLocalJson("any.key", fallback);
    expect(result).toEqual(fallback);
    expect(result).not.toBe(fallback);
  });

  it("silently ignores setItem errors", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
    });
    expect(() => writeLocalJson("quota.key", { x: 1 })).not.toThrow();
  });

  it("does not mutate shared fallback objects", () => {
    const fallback = { shared: true };
    const first = readLocalJson("missing.key", fallback);
    first.shared = false;
    expect(fallback.shared).toBe(true);
    const second = readLocalJson("missing.key", fallback);
    expect(second.shared).toBe(true);
  });

  it("updates stored JSON via updater", () => {
    writeLocalJson("update.key", { count: 1 });
    updateLocalJson("update.key", (store) => {
      store.count += 1;
      return store;
    });
    expect(readLocalJson("update.key")).toEqual({ count: 2 });
  });

  it("persists in-place updater mutations when nothing is returned", () => {
    updateLocalJson("mutate.key", (store) => {
      store.touched = true;
    }, { touched: false });
    expect(readLocalJson("mutate.key")).toEqual({ touched: true });
  });
});