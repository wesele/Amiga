// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  MAX_LLM_PRESETS,
  findPreset,
  normalizePresetUrl,
  parsePresets,
  presetFromConfig,
  removePreset,
  serializePresets,
  upsertPreset,
} from "../llmPresets.js";

const OPENAI = {
  base_url: "https://api.openai.com/v1",
  api_key: "sk-openai",
  model: "gpt-4o",
  provider: "openai",
  thinking_enabled: true,
};

describe("normalizePresetUrl", () => {
  it("trims, drops trailing slashes and ignores case", () => {
    expect(normalizePresetUrl("  https://API.OpenAI.com/v1/  ")).toBe("https://api.openai.com/v1");
    expect(normalizePresetUrl("https://api.openai.com/v1///")).toBe("https://api.openai.com/v1");
    expect(normalizePresetUrl(null)).toBe("");
    expect(normalizePresetUrl(undefined)).toBe("");
  });
});

describe("presetFromConfig", () => {
  it("maps the LLM config shape to a preset", () => {
    expect(presetFromConfig({
      base_url: " https://api.openai.com/v1/ ",
      api_key: " sk-1 ",
      model: " gpt-4o ",
      provider: "openai",
      thinking_enabled: 1,
    })).toEqual({
      base_url: "https://api.openai.com/v1",
      api_key: "sk-1",
      model: "gpt-4o",
      provider: "openai",
      thinking_enabled: true,
    });
  });

  it("returns null when the Base URL is missing", () => {
    expect(presetFromConfig(null)).toBeNull();
    expect(presetFromConfig({ base_url: "   " })).toBeNull();
  });
});

describe("upsertPreset", () => {
  it("appends a new preset at the front", () => {
    const next = upsertPreset([OPENAI], presetFromConfig({
      base_url: "https://api.deepseek.com/v1",
      api_key: "sk-d",
      model: "deepseek-chat",
      provider: "deepseek",
    }));
    expect(next).toHaveLength(2);
    expect(next[0].base_url).toBe("https://api.deepseek.com/v1");
  });

  it("replaces the entry with the same Base URL (new one wins)", () => {
    const next = upsertPreset([OPENAI], presetFromConfig({
      base_url: "https://api.openai.com/v1/",
      api_key: "sk-new",
      model: "gpt-4o-mini",
      provider: "openai",
      thinking_enabled: false,
    }));
    expect(next).toHaveLength(1);
    expect(next[0].api_key).toBe("sk-new");
    expect(next[0].model).toBe("gpt-4o-mini");
    expect(next[0].thinking_enabled).toBe(false);
  });

  it("caps the list length", () => {
    let list = [];
    for (let i = 0; i < MAX_LLM_PRESETS + 5; i += 1) {
      list = upsertPreset(list, presetFromConfig({
        base_url: `https://host-${i}.test/v1`,
        api_key: `k${i}`,
        model: "m",
        provider: "openai",
      }));
    }
    expect(list).toHaveLength(MAX_LLM_PRESETS);
    expect(list[0].base_url).toBe(`https://host-${MAX_LLM_PRESETS + 4}.test/v1`);
  });
});

describe("findPreset / removePreset", () => {
  it("finds by normalized URL", () => {
    expect(findPreset([OPENAI], " HTTPS://API.OPENAI.COM/v1 ")).toMatchObject({ api_key: "sk-openai" });
    expect(findPreset([OPENAI], "https://api.deepseek.com/v1")).toBeNull();
    expect(findPreset([OPENAI], "")).toBeNull();
  });

  it("removes only the matching entry", () => {
    const list = [OPENAI, { ...OPENAI, base_url: "https://api.deepseek.com/v1" }];
    const next = removePreset(list, "https://api.openai.com/v1/");
    expect(next).toHaveLength(1);
    expect(next[0].base_url).toBe("https://api.deepseek.com/v1");
  });
});

describe("parse / serialize", () => {
  it("round-trips through JSON", () => {
    expect(parsePresets(serializePresets([OPENAI]))).toEqual([OPENAI]);
  });

  it("tolerates empty and corrupt values", () => {
    expect(parsePresets(null)).toEqual([]);
    expect(parsePresets("")).toEqual([]);
    expect(parsePresets("not json")).toEqual([]);
    expect(parsePresets('{"a":1}')).toEqual([]);
  });

  it("drops entries without a Base URL", () => {
    const raw = JSON.stringify([OPENAI, { api_key: "sk-x" }, null]);
    expect(parsePresets(raw)).toHaveLength(1);
  });
});
