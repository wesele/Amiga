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
  getDatabaseStatus: vi.fn(),
  deleteDatabaseAndRestart: vi.fn(),
  exitApp: vi.fn(),
}));

vi.mock("@/shared/api.js", () => ({
  inTauri: apiMocks.inTauri,
  isSchemaCompatible: apiMocks.isSchemaCompatible,
  resetDatabase: apiMocks.resetDatabase,
  getDatabaseStatus: apiMocks.getDatabaseStatus,
  deleteDatabaseAndRestart: apiMocks.deleteDatabaseAndRestart,
  exitApp: apiMocks.exitApp,
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
    apiMocks.getDatabaseStatus.mockReset();
    apiMocks.deleteDatabaseAndRestart.mockReset();
    apiMocks.exitApp.mockReset();
    apiMocks.inTauri.mockReturnValue(true);
    apiMocks.isSchemaCompatible.mockResolvedValue(true);
    apiMocks.resetDatabase.mockResolvedValue();
    apiMocks.getDatabaseStatus.mockResolvedValue({ ok: true, error: null, schema_compatible: true });
    apiMocks.deleteDatabaseAndRestart.mockResolvedValue();
    apiMocks.exitApp.mockResolvedValue();
  });

  it("stays hidden when the schema is compatible", async () => {
    const wrapper = mountApp();
    await flushPromises();

    expect(apiMocks.getDatabaseStatus).toHaveBeenCalled();
    expect(wrapper.findComponent(ConfirmDialog).props("show")).toBe(false);
  });

  it("shows the reset dialog when the schema is incompatible", async () => {
    apiMocks.getDatabaseStatus.mockResolvedValue({ ok: false, error: null, schema_compatible: false });

    const wrapper = mountApp();
    await flushPromises();

    // schema dialog is the first one
    expect(wrapper.findComponent(ConfirmDialog).props("show")).toBe(true);
  });

  it("shows the data load fail dialog (with exit) on hard open error", async () => {
    apiMocks.getDatabaseStatus.mockResolvedValue({ ok: false, error: "open failed: corrupt db", schema_compatible: false });

    const wrapper = mountApp();
    await flushPromises();

    const dialogs = wrapper.findAllComponents(ConfirmDialog);
    const anyShown = dialogs.some(d => d.props("show") === true);
    expect(anyShown).toBe(true);
    // At least the data-load one should be among them (schema would not trigger on error)
    expect(apiMocks.getDatabaseStatus).toHaveBeenCalled();
  });

  it("skips the compatibility check outside Tauri", async () => {
    apiMocks.inTauri.mockReturnValue(false);

    const wrapper = mountApp();
    await flushPromises();

    expect(apiMocks.getDatabaseStatus).not.toHaveBeenCalled();
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
    expect(dialogs.length).toBeGreaterThanOrEqual(2);
    // global alert is the last one (alert-only)
    const alertDlg = dialogs.find(d => d.props("alertOnly") === true);
    expect(alertDlg).toBeTruthy();
    expect(alertDlg.props("show")).toBe(true);
    expect(alertDlg.props("title")).toBe("无法打开链接");
  });

  it("resets the database and reloads after confirmation", async () => {
    apiMocks.getDatabaseStatus.mockResolvedValue({ ok: false, error: null, schema_compatible: false });
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });

    const wrapper = mountApp();
    await flushPromises();
    // first dialog should be the schema one
    await wrapper.findComponent(ConfirmDialog).vm.$emit("confirm");
    await flushPromises();

    expect(apiMocks.resetDatabase).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
