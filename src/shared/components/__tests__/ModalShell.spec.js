import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ModalShell from "@/shared/components/ModalShell.vue";

describe("ModalShell", () => {
  function mountShell(props = {}, slots = {}) {
    return mount(ModalShell, {
      props: { show: true, title: "Title", description: "Description", ...props },
      slots,
      global: { stubs: { Teleport: true } },
    });
  }

  it("renders title, description, default slot, and actions slot", () => {
    const wrapper = mountShell(
      {},
      {
        default: "<p class=\"body-content\">Body</p>",
        actions: "<button class=\"action-btn\">OK</button>",
      },
    );

    expect(wrapper.text()).toContain("Title");
    expect(wrapper.text()).toContain("Description");
    expect(wrapper.find(".body-content").exists()).toBe(true);
    expect(wrapper.find(".action-btn").exists()).toBe(true);
    expect(wrapper.find(".modal-actions").exists()).toBe(true);
  });

  it("emits close when overlay is clicked and closeOnOverlay is true", async () => {
    const wrapper = mountShell({ closeOnOverlay: true });
    await wrapper.find(".modal-overlay").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("does not emit close when overlay is clicked and closeOnOverlay is false", async () => {
    const wrapper = mountShell({ closeOnOverlay: false });
    await wrapper.find(".modal-overlay").trigger("click");
    expect(wrapper.emitted("close")).toBeUndefined();
  });

  it("hides content when show is false", () => {
    const wrapper = mountShell({ show: false });
    expect(wrapper.find(".modal-overlay").exists()).toBe(false);
  });
});