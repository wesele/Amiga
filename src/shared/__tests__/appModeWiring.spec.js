import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");

describe("phone Web Demo mode wiring", () => {
  it("uses layout mode for remote-only interaction adaptations", () => {
    const lesson = read("modules/path/LessonPage.vue");
    const chat = read("modules/soulmate/SoulMateChat.vue");
    const header = read("shared/components/PageHeader.vue");

    expect(lesson).toMatch(/isTvLayoutMode \? adaptQuestionsForTv/);
    expect(chat).toMatch(/v-if="!isTvLayoutMode" class="input-bar"/);
    expect(chat).toMatch(/tv-chat': isTvLayoutMode/);
    expect(header).toMatch(/backTabIndex = isTvLayoutMode \? -1/);
  });

  it("keeps Web TV feature availability separate from the phone layout", () => {
    const modules = read("app/modules.js");
    const shell = read("modules/shell/AppShell.vue");

    expect(modules).toMatch(/APP_MODULES = isTvMode \? TV_APP_MODULES/);
    expect(shell).toMatch(/isTvMode\s*&&\s*!isWebMode\s*\?\s*allTabs\.filter/);
    expect(shell).toMatch(/isWebMode\s*&&\s*tab\.clientOnly/);
    expect(shell).toMatch(/shouldShowL1Nav\(route\.name, isTvLayoutMode\)/);
  });
});
