import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");

describe("Web Demo client-only entries", () => {
  it("restores Chat in Web TV mode and intercepts it with the install prompt", () => {
    const source = read("src/modules/shell/AppShell.vue");

    expect(source).toMatch(/name:\s*"chat"[\s\S]*?clientOnly:\s*true/);
    expect(source).toMatch(/isTvMode\s*&&\s*!isWebMode/);
    expect(source).toMatch(/isWebMode\s*&&\s*tab\.clientOnly/);
    expect(source).toContain("requestInstallAppPrompt(tab.name)");
  });

  it("restores Speaking and Translator in Web mode and intercepts both", () => {
    const source = read("src/modules/learn/LearnHubPage.vue");

    expect(source).toMatch(/id:\s*"speaking"[\s\S]*?clientOnly:\s*true/);
    expect(source).toMatch(/id:\s*"translator"[\s\S]*?clientOnly:\s*true/);
    expect(source).toMatch(/isTvMode\s*&&\s*!isWebMode/);
    expect(source).toMatch(/isWebMode\s*&&\s*mod\.clientOnly/);
  });

  it("restores Cloud Sync and Check for updates while guarding their actions", () => {
    const settings = read("src/modules/profile/SettingsPage.vue");
    const profile = read("src/modules/profile/ProfilePage.vue");

    expect(settings).not.toMatch(/v-if="!isWebMode"[\s\S]{0,160}:title="t\('settings\.cloudSync'\)"/);
    expect(settings).toContain('requestInstallAppPrompt("cloud-sync")');
    expect(profile).toContain('v-if="!isTvMode || isWebMode"');
    expect(profile).toContain('requestInstallAppPrompt("check-update")');
  });
});
