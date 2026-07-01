import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMemoryHistory, createRouter } from "vue-router";
import * as api from "@/shared/api.js";
import { installWizardGuard } from "@/app/routeGuards.js";

vi.mock("@tauri-apps/plugin-shell", () => ({}));

const ROOT = resolve(__dirname, "../../../..");

function readMainJs() {
  return readFileSync(resolve(ROOT, "src/main.js"), "utf8");
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/wizard", name: "wizard", component: { template: "<div/>" } },
      { path: "/learn", name: "learn", component: { template: "<div/>" } },
    ],
  });
}

describe("wizard route guard", () => {
  let mockInvoke;

  beforeEach(() => {
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
  });

  it("main.js redirects completed users away from /wizard (issue #11)", () => {
    const main = readMainJs();
    const guard = readFileSync(resolve(ROOT, "src/app/routeGuards.js"), "utf8");
    expect(main).toMatch(/installWizardGuard\s*\(\s*router,\s*\{\s*isWizardCompleted\s*\}\s*\)/);
    expect(guard).toMatch(/to\.name\s*===\s*["']wizard["']/);
    expect(guard).toMatch(/completed\s*\?\s*\{\s*name:\s*["']learn["']\s*\}/);
  });

  it("sends incomplete users to the wizard", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "is_wizard_completed_cmd") return Promise.resolve(false);
      return Promise.resolve(undefined);
    });
    const router = makeRouter();
    installWizardGuard(router, { isWizardCompleted: api.isWizardCompleted });
    await router.push("/learn");
    expect(router.currentRoute.value.name).toBe("wizard");
  });

  it("keeps completed users off the wizard when history lands on /wizard", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "is_wizard_completed_cmd") return Promise.resolve(true);
      return Promise.resolve(undefined);
    });
    const router = makeRouter();
    installWizardGuard(router, { isWizardCompleted: api.isWizardCompleted });
    await router.push("/wizard");
    expect(router.currentRoute.value.name).toBe("learn");
  });
});
