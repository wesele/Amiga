import { describe, it, expect, vi } from "vitest";
import { installWizardGuard } from "../routeGuards.js";

function installWith(isWizardCompleted) {
  let guard = null;
  const router = {
    beforeEach: vi.fn((fn) => {
      guard = fn;
    }),
  };
  installWizardGuard(router, { isWizardCompleted });
  return { router, guard };
}

describe("installWizardGuard", () => {
  it("redirects incomplete users to the wizard", async () => {
    const { guard } = installWith(vi.fn().mockResolvedValue(false));

    await expect(guard({ name: "learn" })).resolves.toEqual({ name: "wizard" });
  });

  it("keeps incomplete users on the wizard", async () => {
    const { guard } = installWith(vi.fn().mockResolvedValue(false));

    await expect(guard({ name: "wizard" })).resolves.toBe(true);
  });

  it("blocks completed users from re-entering the wizard", async () => {
    const { guard } = installWith(vi.fn().mockResolvedValue(true));

    await expect(guard({ name: "wizard" })).resolves.toEqual({ name: "learn" });
  });

  it("allows navigation when Tauri is unavailable", async () => {
    const { guard } = installWith(vi.fn().mockRejectedValue(new Error("no tauri")));

    await expect(guard({ name: "learn" })).resolves.toBe(true);
  });

  it("registers exactly one guard", () => {
    const { router } = installWith(vi.fn().mockResolvedValue(true));

    expect(router.beforeEach).toHaveBeenCalledTimes(1);
  });
});
