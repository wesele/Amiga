import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App.vue";
import ConfirmDialog from "@/shared/components/ConfirmDialog.vue";
import { ALERT_SHOW } from "@/shared/alert.js";
import { eventBus } from "@/shared/eventBus.js";
import i18nPlugin from "@/shared/i18n";

const apiMocks = vi.hoisted(() => ({
  isSchemaCompatible: vi.fn(),
  resetDatabase: vi.fn(),
  inTauri: vi.fn(),
}));

vi.mock("@/shared/api.js", () => ({
  inTauri: apiMocks.inTauri,
  isSchemaCompatible: apiMocks.isSchemaCompatible,
  resetDatabase: apiMocks.resetDatabase,
}));

function mountApp() {
  return mount(App, {
    global: {
      plugins: [i18nPlugin],
      stubs: {
        RouterView: { template: "<div data-test='router-view' />" },
        Teleport: true,
      },
    },
  });
}

describe("App schema compatibility dialog", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    apiMocks.inTauri.mockReset();
    apiMocks.isSchemaCompatible.mockReset();
    apiMocks.resetDatabase.mockReset();
    apiMocks.inTauri.mockReturnValue(true);
    apiMocks.isSchemaCompatible.mockResolvedValue(true);
    apiMocks.resetDatabase.mockResolvedValue();
  });

  it("stays hidden when the schema is compatible", async () => {
    const wrapper = mountApp();
    await flushPromises();

    expect(apiMocks.isSchemaCompatible).toHaveBeenCalledTimes(1);
    expect(wrapper.findComponent(ConfirmDialog).props("show")).toBe(false);
  });

  it("shows the reset dialog when the schema is incompatible", async () => {
    apiMocks.isSchemaCompatible.mockResolvedValue(false);

    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.findComponent(ConfirmDialog).props("show")).toBe(true);
  });

  it("skips the compatibility check outside Tauri", async () => {
    apiMocks.inTauri.mockReturnValue(false);

    const wrapper = mountApp();
    await flushPromises();

    expect(apiMocks.isSchemaCompatible).not.toHaveBeenCalled();
    expect(wrapper.findComponent(ConfirmDialog).props("show")).toBe(false);
  });

  it("shows the global alert dialog when alert:show is emitted", async () => {
    const wrapper = mountApp();
    await flushPromises();

    eventBus.emit(ALERT_SHOW, {
      title: "无法打开链接",
      message: "no app can handle VIEW intent: ActivityNotFoundException\n\nhttps://example.com",
    });
    await flushPromises();

    const dialogs = wrapper.findAllComponents(ConfirmDialog);
    expect(dialogs).toHaveLength(2);
    expect(dialogs[1].props("show")).toBe(true);
    expect(dialogs[1].props("title")).toBe("无法打开链接");
    expect(dialogs[1].props("alertOnly")).toBe(true);
  });

  it("resets the database and reloads after confirmation", async () => {
    apiMocks.isSchemaCompatible.mockResolvedValue(false);
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });

    const wrapper = mountApp();
    await flushPromises();
    await wrapper.findComponent(ConfirmDialog).vm.$emit("confirm");
    await flushPromises();

    expect(apiMocks.resetDatabase).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
