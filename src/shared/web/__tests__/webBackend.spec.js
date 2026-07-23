import { beforeEach, describe, expect, it } from "vitest";
import { invokeWebCommand, webStateStore } from "../webBackend.js";

describe("WebBackend", () => {
  beforeEach(async () => {
    await webStateStore.reset();
  });

  it("boots with a completed demo user and no cloud restore", async () => {
    const user = await invokeWebCommand("get_current_user");

    expect(user.id).toBe("demo-user");
    expect(await invokeWebCommand("is_wizard_completed_cmd")).toBe(true);
    expect(await invokeWebCommand("check_cloud_restore_cmd", { nickname: user.nickname })).toBe(false);
  });

  it("refreshes the built-in LLM config instead of using a stale persisted key", async () => {
    await webStateStore.update((state) => {
      state.llm_config.builtin.api_key = "stale-key";
      return null;
    });

    const config = await invokeWebCommand("get_llm_config_cmd");

    expect(config.builtin.base_url).toBe("/llm/nvidia/v1");
    expect(config.builtin.api_key).not.toBe("stale-key");
    expect(config.builtin.model).toBe("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning");
    expect(config.builtin.provider).toBe("nvidia_nim");
    expect(config.builtin.thinking_enabled).toBe(true);
  });

  it("persists an explicit built-in reasoning preference", async () => {
    await invokeWebCommand("save_setting_cmd", {
      key: "builtin_thinking_enabled",
      value: "false",
    });
    expect((await invokeWebCommand("get_llm_config_cmd")).builtin.thinking_enabled).toBe(false);

    await invokeWebCommand("save_setting_cmd", {
      key: "builtin_thinking_enabled",
      value: "true",
    });
    expect((await invokeWebCommand("get_llm_config_cmd")).builtin.thinking_enabled).toBe(true);
  });

  it("resets a reasoning preference saved for an older built-in model", async () => {
    await webStateStore.update((state) => {
      state.settings.builtin_thinking_enabled = "false";
      state.settings.builtin_thinking_model = "older/builtin-model";
      return null;
    });

    const config = await invokeWebCommand("get_llm_config_cmd");

    expect(config.builtin.thinking_enabled).toBe(true);
    const state = await webStateStore.get();
    expect(state.settings.builtin_thinking_enabled).toBe("true");
    expect(state.settings.builtin_thinking_model).toBe(config.builtin.model);
  });

  it("persists vocabulary mastery through the Tauri-compatible command contract", async () => {
    const words = await invokeWebCommand("get_user_vocab_by_level_cmd", {
      userId: "demo-user",
      language: "es",
      cefrLevel: "A1",
    });
    expect(words.length).toBeGreaterThan(100);

    await invokeWebCommand("update_word_mastery_cmd", {
      userId: "demo-user",
      wordId: words[0].id,
      mastery: 2,
      source: "test",
    });

    const updated = await invokeWebCommand("get_user_vocab_by_level_cmd", {
      userId: "demo-user",
      language: "es",
      cefrLevel: "A1",
    });
    expect(updated[0].mastery).toBe(2);
  });

  it("builds the real curriculum bundle and unlocks nodes after completion", async () => {
    const args = { nativeLang: "zh", targetLang: "es", cefr: "A1" };
    const initial = await invokeWebCommand("get_path_curriculum_cmd", args);
    const first = initial.units[0].sections[0];
    const second = initial.units[0].sections[1];

    expect(initial.status).toBe("active");
    expect(first.locked).toBe(false);
    expect(second.locked).toBe(true);

    await invokeWebCommand("complete_teaching_node_cmd", { ...args, nodeId: first.id });
    const refreshed = await invokeWebCommand("get_path_curriculum_cmd", args);

    expect(refreshed.units[0].sections[0].stars).toBe(3);
    expect(refreshed.units[0].sections[1].locked).toBe(false);
  });

  it("returns seeded news, reading, achievements, and Soul Mate data", async () => {
    const [news, reading, achievements, home] = await Promise.all([
      invokeWebCommand("get_articles_cmd", { region: "world" }),
      invokeWebCommand("get_reading_articles_cmd", { userId: "demo-user", targetLanguage: "es" }),
      invokeWebCommand("get_achievement_progress_cmd", { userId: "demo-user" }),
      invokeWebCommand("get_soulmate_home_cmd", { userId: "demo-user", targetLang: "es" }),
    ]);

    expect(news.length).toBeGreaterThanOrEqual(3);
    expect(reading.length).toBeGreaterThanOrEqual(2);
    expect(achievements.learning_total).toBeGreaterThan(0);
    expect(home.initialized).toBe(true);
    expect(home.world.companion_name).toBe("Luna");
  });
});
