import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import InstallAppPrompt from "@/shared/components/InstallAppPrompt.vue";
import { eventBus } from "@/shared/eventBus.js";
import {
  AMIGA_GITHUB_URL,
  requestInstallAppPrompt,
} from "@/shared/installAppPrompt.js";
import { setLocale } from "@/shared/i18n";

describe("InstallAppPrompt", () => {
  let wrapper;

  beforeEach(() => {
    eventBus.clear();
    document.body.innerHTML = "";
    setLocale("zh", { persist: false });
    wrapper = mount(InstallAppPrompt, { attachTo: document.body });
  });

  afterEach(() => {
    wrapper?.unmount();
    eventBus.clear();
    document.body.innerHTML = "";
  });

  it("opens from the shared event and exposes the project GitHub address", async () => {
    requestInstallAppPrompt("speaking");
    await flushPromises();

    const dialog = document.body.querySelector(".modal-content");
    const link = document.body.querySelector(".project-link");

    expect(dialog?.textContent).toContain("请安装手机版体验");
    expect(dialog?.textContent).toContain(AMIGA_GITHUB_URL);
    expect(link?.getAttribute("href")).toBe(AMIGA_GITHUB_URL);
    expect(document.activeElement).toBe(link);
  });

  it("closes from the acknowledgement button", async () => {
    requestInstallAppPrompt("chat");
    await flushPromises();

    document.body.querySelector(".dialog-btn")?.click();
    await flushPromises();

    expect(document.body.querySelector(".modal-content")).toBeNull();
  });
});
