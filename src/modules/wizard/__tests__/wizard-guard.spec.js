import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMemoryHistory, createRouter } from "vue-router";
import * as api from "@/shared/api.js";

vi.mock("@tauri-apps/plugin-shell", () => ({}));

const ROOT = resolve(__dirname, "../../../..");

function readMainJs() {
  return readFileSync(resolve(ROOT, "src/main.js"), "utf8");
}

// Mirror of the wizard route guard in main.js. Keep in lock-step.
function installWizardGuard(router) {
  router.beforeEach(async (to) => {
    try {
      const completed = await api.isWizardCompleted();
      if (to.name === "wizard") {
        if (completed) return { name: "learn" };
        return true;
      }
      if (!completed) {
        return { name: "wizard" };
      }
    } catch {
      // Browser dev without Tauri
    }
    return true;
  });
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
    expect(main).toMatch(/if\s*\(\s*to\.name\s*===\s*["']wizard["']\s*\)/);
    expect(main).toMatch(/if\s*\(\s*completed\s*\)\s*return\s*\{\s*name:\s*["']learn["']\s*\}/);
  });

  it("sends incomplete users to the wizard", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "is_wizard_completed_cmd") return Promise.resolve(false);
      return Promise.resolve(undefined);
    });
    const router = makeRouter();
    installWizardGuard(router);
    await router.push("/learn");
    expect(router.currentRoute.value.name).toBe("wizard");
  });

  it("keeps completed users off the wizard when history lands on /wizard", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "is_wizard_completed_cmd") return Promise.resolve(true);
      return Promise.resolve(undefined);
    });
    const router = makeRouter();
    installWizardGuard(router);
    await router.push("/wizard");
    expect(router.currentRoute.value.name).toBe("learn");
  });
});