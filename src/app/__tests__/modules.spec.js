import { describe, it, expect, vi } from "vitest";
import { APP_MODULES, TV_APP_MODULES, loadFeatureModules, loadShellModule } from "../modules.js";

describe("app module loading", () => {
  it("loads shell before feature modules", async () => {
    const kernel = { loadModule: vi.fn().mockResolvedValue({}) };

    await loadShellModule(kernel);
    await loadFeatureModules(kernel);

    expect(kernel.loadModule).toHaveBeenNthCalledWith(1, "shell");
    expect(kernel.loadModule).toHaveBeenNthCalledWith(2, "wizard", undefined);
    expect(kernel.loadModule).toHaveBeenNthCalledWith(3, "learn", { parent: "shell" });
  });

  it("keeps all shell children scoped to the shell parent", () => {
    const shellChildren = APP_MODULES.filter((mod) => mod.parent);

    expect(shellChildren.every((mod) => mod.parent === "shell")).toBe(true);
  });

  it("keeps chat, speaking, and AI-chat out of the TV module set (soulmate + prompts stay)", () => {
    const names = TV_APP_MODULES.map((mod) => mod.name);

    expect(names).toEqual([
      "wizard",
      "learn",
      "achievements",
      "path",
      "news",
      "reading",
      "soulmate",
      "vocab",
      "profile",
      "prompts",
    ]);
    expect(names).not.toContain("chat");
    expect(names).not.toContain("speaking");
    expect(names).not.toContain("ai-chat");
  });
});
