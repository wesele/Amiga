import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ConfirmDialog from "@/shared/components/ConfirmDialog.vue";

describe("ConfirmDialog TV back behavior", () => {
  afterEach(() => {
    delete window.__amigaGoBackInPage;
  });

  it("treats remote Back as cancel instead of leaving the route", () => {
    const wrapper = mount(ConfirmDialog, {
      props: { show: true, title: "Confirm", message: "Message" },
      global: { stubs: { Teleport: true } },
    });

    expect(window.__amigaGoBackInPage()).toBe("navigated");
    expect(wrapper.emitted("cancel")).toHaveLength(1);
    wrapper.unmount();
  });
});
