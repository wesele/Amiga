import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import * as api from "@/shared/api.js";
import { getLocale, setLocale, i18n } from "@/shared/i18n";

vi.mock("@tauri-apps/plugin-shell", () => ({}));

const WizardFlow = (await import("@/modules/wizard/WizardFlow.vue")).default;
const StepProfile = (await import("@/modules/wizard/steps/StepProfile.vue")).default;
const StepLearning = (await import("@/modules/wizard/steps/StepLearning.vue")).default;
const StepDemographics = (await import("@/modules/wizard/steps/StepDemographics.vue")).default;
const StepAvatar = (await import("@/modules/wizard/steps/StepAvatar.vue")).default;

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div/>" } },
      { path: "/wizard", component: WizardFlow },
      { path: "/learn", name: "learn", component: { template: "<div/>" } },
    ],
  });
}

function mountWizard() {
  const router = makeRouter();
  return mount(WizardFlow, {
    global: {
      plugins: [router],
    },
  });
}

describe("WizardFlow", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke = vi.fn().mockResolvedValue(undefined);
    api.__setInvoke(mockInvoke);
    // Reset locale to a known state so the "switches UI locale" test is
    // independent of whatever the previous test left behind.
    setLocale("zh", { persist: false });
  });

  it("renders 4 step dots", () => {
    const wrapper = mountWizard();
    expect(wrapper.findAll(".step-dot")).toHaveLength(4);
  });

  it("starts on StepProfile (native language + nickname)", () => {
    const wrapper = mountWizard();
    expect(wrapper.findComponent(StepProfile).exists()).toBe(true);
  });

  it("disables Next on Step 1 until nickname is filled", async () => {
    const wrapper = mountWizard();
    const next = wrapper.find("button.btn-primary");
    expect(next.attributes("disabled")).toBeDefined();
    await wrapper.find("input#nickname").setValue("TestUser");
    expect(next.attributes("disabled")).toBeUndefined();
  });

  it("advances to StepLearning after valid Step 1 submission", async () => {
    const wrapper = mountWizard();
    await wrapper.find("input#nickname").setValue("TestUser");
    await wrapper.findAll("button.btn-primary")[0].trigger("click");
    await flushPromises();
    expect(wrapper.findComponent(StepLearning).exists()).toBe(true);
  });

  it("picking a native language switches the UI locale to match", async () => {
    expect(getLocale()).toBe("zh");
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "update_user_cmd") return Promise.resolve({ id: "u1", native_language: "en" });
      return Promise.resolve(undefined);
    });
    const wrapper = mountWizard();
    const pills = wrapper.findAll(".step-profile .pill-group").at(0).findAll(".pill");
    await pills[1].trigger("click");
    await wrapper.find("input#nickname").setValue("TestUser");
    await wrapper.findAll("button.btn-primary")[0].trigger("click");
    await flushPromises();
    await flushPromises();
    expect(getLocale()).toBe("en");
    expect(mockInvoke).toHaveBeenCalledWith("save_setting_cmd", {
      key: "ui_language",
      value: "en",
    });
  });

  it("keeps the locale unchanged when the user keeps the default native language", async () => {
    expect(getLocale()).toBe("zh");
    const wrapper = mountWizard();
    await wrapper.find("input#nickname").setValue("TestUser");
    await wrapper.findAll("button.btn-primary")[0].trigger("click");
    await flushPromises();
    expect(getLocale()).toBe("zh");
  });

  it("advances to StepDemographics after Step 2 selection", async () => {
    const wrapper = mountWizard();
    await wrapper.find("input#nickname").setValue("TestUser");
    await wrapper.findAll("button.btn-primary")[0].trigger("click");
    await flushPromises();
    await wrapper.findAll("button.btn-primary")[0].trigger("click");
    await flushPromises();
    expect(wrapper.findComponent(StepDemographics).exists()).toBe(true);
  });

  it("Step 3 (demographics) allows advancing with no selection", async () => {
    const wrapper = mountWizard();
    await wrapper.find("input#nickname").setValue("TestUser");
    await wrapper.findAll("button.btn-primary")[0].trigger("click");
    await flushPromises();
    await wrapper.findAll("button.btn-primary")[0].trigger("click");
    await flushPromises();
    const step3Next = wrapper.findAll("button.btn-primary")[0];
    expect(step3Next.attributes("disabled")).toBeUndefined();
    await step3Next.trigger("click");
    await flushPromises();
    expect(wrapper.findComponent(StepAvatar).exists()).toBe(true);
  });

  it("picking an avatar on Step 4 saves the user and replaces history with /learn", async () => {
    const router = makeRouter();
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "create_user") return Promise.resolve({ id: "user-1" });
      if (cmd === "save_learning_goal_cmd") return Promise.resolve({});
      if (cmd === "init_user_vocab_cmd") return Promise.resolve(undefined);
      if (cmd === "set_target_language_cmd") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });
    const replaceSpy = vi.spyOn(router, "replace");
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(WizardFlow, { global: { plugins: [router] } });
    await router.push("/wizard");
    await flushPromises();
    await wrapper.find("input#nickname").setValue("TestUser");
    await wrapper.findAll("button.btn-primary")[0].trigger("click");
    await flushPromises();
    await wrapper.findAll("button.btn-primary")[0].trigger("click");
    await flushPromises();
    await wrapper.findAll("button.btn-primary")[0].trigger("click");
    await flushPromises();
    const avatars = wrapper.findAll(".avatar-circle");
    expect(avatars.length).toBeGreaterThan(0);
    await avatars[1].trigger("click");
    await flushPromises();
    const createUserCall = mockInvoke.mock.calls.find((c) => c[0] === "create_user");
    expect(createUserCall).toBeTruthy();
    expect(createUserCall[1].request).toMatchObject({
      nickname: "TestUser",
      avatar: expect.any(String),
      age_range: null,
    });
    expect(mockInvoke).toHaveBeenCalledWith("save_learning_goal_cmd", expect.any(Object));
    expect(mockInvoke).toHaveBeenCalledWith("init_user_vocab_cmd", expect.any(Object));
    expect(replaceSpy).toHaveBeenCalledWith({ name: "learn" });
    expect(pushSpy).not.toHaveBeenCalledWith("/learn");
    expect(pushSpy).not.toHaveBeenCalledWith({ name: "learn" });
    expect(router.currentRoute.value.path).toBe("/learn");
  });

  it("does not leave /wizard on the history stack after completion", async () => {
    const router = makeRouter();
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "create_user") return Promise.resolve({ id: "user-1" });
      if (cmd === "save_learning_goal_cmd") return Promise.resolve({});
      if (cmd === "init_user_vocab_cmd") return Promise.resolve(undefined);
      if (cmd === "set_target_language_cmd") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });
    const wrapper = mount(WizardFlow, { global: { plugins: [router] } });
    await router.push("/wizard");
    await flushPromises();
    await wrapper.find("input#nickname").setValue("TestUser");
    await wrapper.findAll("button.btn-primary")[0].trigger("click");
    await flushPromises();
    await wrapper.findAll("button.btn-primary")[0].trigger("click");
    await flushPromises();
    await wrapper.findAll("button.btn-primary")[0].trigger("click");
    await flushPromises();
    await wrapper.findAll(".avatar-circle")[0].trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/learn");
    await router.back();
    expect(router.currentRoute.value.path).not.toBe("/wizard");
  });

  it("sends age_range when selected", async () => {
    const router = makeRouter();
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "create_user") return Promise.resolve({ id: "user-1" });
      return Promise.resolve(undefined);
    });
    const wrapper = mount(WizardFlow, { global: { plugins: [router] } });
    await router.push("/wizard");
    await flushPromises();
    await wrapper.find("input#nickname").setValue("TestUser");
    await wrapper.findAll("button.btn-primary")[0].trigger("click");
    await flushPromises();
    await wrapper.findAll("button.btn-primary")[0].trigger("click");
    await flushPromises();
    const agePills = wrapper.findAll(".step-demo .pill-group").at(0).findAll(".pill");
    await agePills[0].trigger("click");
    await flushPromises();
    await wrapper.findAll("button.btn-primary")[0].trigger("click");
    await flushPromises();
    await wrapper.findAll(".avatar-circle")[0].trigger("click");
    await flushPromises();
    const createUserCall = mockInvoke.mock.calls.find((c) => c[0] === "create_user");
    expect(createUserCall).toBeTruthy();
    expect(createUserCall[1].request).toMatchObject({ age_range: "under_18" });
  });
});

describe("StepProfile", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("emits next with nickname and native language", async () => {
    const wrapper = mount(StepProfile);
    await wrapper.find("input#nickname").setValue("Alice");
    const pills = wrapper.findAll(".pill");
    await pills[1].trigger("click");
    await wrapper.find("button.btn-primary").trigger("click");
    const emitted = wrapper.emitted("next");
    expect(emitted).toBeTruthy();
    expect(emitted[0][0]).toMatchObject({ nickname: "Alice", nativeLanguage: "en" });
  });

  it("keeps next button disabled with empty nickname", async () => {
    const wrapper = mount(StepProfile);
    expect(wrapper.find("button.btn-primary").attributes("disabled")).toBeDefined();
  });
});

describe("StepLearning", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("only shows A1 and A2 levels", () => {
    const wrapper = mount(StepLearning);
    const levelPills = wrapper.findAll(".form-group").at(1).findAll(".pill");
    expect(levelPills).toHaveLength(2);
    expect(levelPills[0].text()).toContain("A1");
    expect(levelPills[1].text()).toContain("A2");
  });

  it("shows all available target languages", () => {
    const wrapper = mount(StepLearning);
    const langPills = wrapper.findAll(".form-group").at(0).findAll(".pill");
    expect(langPills.length).toBe(3);
  });
});

describe("StepDemographics", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("has 4 age range pills and 3 gender pills", () => {
    const wrapper = mount(StepDemographics);
    const groups = wrapper.findAll(".form-group");
    expect(groups[0].findAll(".pill")).toHaveLength(4);
    expect(groups[1].findAll(".pill")).toHaveLength(3);
  });

  it("emits null when nothing is selected", async () => {
    const wrapper = mount(StepDemographics);
    await wrapper.find("button.btn-primary").trigger("click");
    const emitted = wrapper.emitted("next");
    expect(emitted[0][0]).toMatchObject({ ageRange: null, gender: null });
  });

  it("deselects a pill when clicked twice", async () => {
    const wrapper = mount(StepDemographics);
    const agePills = wrapper.findAll(".form-group").at(0).findAll(".pill");
    await agePills[0].trigger("click");
    expect(wrapper.vm.form.ageRange).toBe("under_18");
    await agePills[0].trigger("click");
    expect(wrapper.vm.form.ageRange).toBeNull();
  });
});

describe("StepAvatar", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("emits next immediately when an avatar is picked", async () => {
    const wrapper = mount(StepAvatar);
    const circles = wrapper.findAll(".avatar-circle");
    expect(circles.length).toBeGreaterThan(0);
    await circles[0].trigger("click");
    const emitted = wrapper.emitted("next");
    expect(emitted).toBeTruthy();
    expect(emitted[0][0]).toHaveProperty("avatar");
  });

  it("skip button emits the default avatar", async () => {
    const wrapper = mount(StepAvatar);
    await wrapper.find("button.btn-link").trigger("click");
    const emitted = wrapper.emitted("next");
    expect(emitted[0][0]).toMatchObject({ avatar: "😊" });
  });
});
