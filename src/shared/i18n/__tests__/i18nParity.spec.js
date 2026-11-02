// @vitest-environment node
import { describe, it, expect } from "vitest";
import zh from "@/shared/i18n/zh.js";
import en from "@/shared/i18n/en.js";
import es from "@/shared/i18n/es.js";

// `t()` silently falls back across dictionaries, so a key that only exists in
// zh/en shows up in the Spanish UI as Chinese or English with no error. These
// tests pin the three dictionaries to the exact same key set so that drift
// fails loudly instead of leaking untranslated strings into the product.
const DICTS = { zh, en, es };
const LOCALES = Object.keys(DICTS);

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

// `{name}` and `{{name}}` are both interpolated by index.js; `{{NAME}}` in the
// prompt templates uses the same syntax. Only the names matter for parity.
function placeholders(value) {
  if (typeof value !== "string") return [];
  const names = new Set();
  for (const m of value.matchAll(/\{\{\s*(\w+)\s*\}\}|\{(\w+)\}/g)) {
    names.add(m[1] || m[2]);
  }
  return [...names].sort();
}

function list(items, limit = 20) {
  const shown = items.slice(0, limit).join("\n  ");
  const more = items.length > limit ? `\n  …and ${items.length - limit} more` : "";
  return `${items.length} key(s):\n  ${shown}${more}`;
}

const FLAT = Object.fromEntries(LOCALES.map((l) => [l, flatten(DICTS[l])]));

// Keys whose localized copy deliberately uses a different illustrative token
// than the other locales. Product copy wins over the test: add an entry here
// with a reason instead of rewriting a translator's wording to satisfy parity.
const PLACEHOLDER_EXCEPTIONS = new Map([
  // 中文用 {{变量}} 作为示意文字，不是真实插值 token（`\w` 也不匹配中文）。
  ["prompts.fields.userPlaceholder", "中文示意文本，非真实 token"],
]);
const KEYS = Object.fromEntries(LOCALES.map((l) => [l, Object.keys(FLAT[l]).sort()]));
const KEY_SETS = Object.fromEntries(LOCALES.map((l) => [l, new Set(KEYS[l])]));

describe("i18n dictionary parity", () => {
  it("exposes the same flattened key set in every locale", () => {
    for (const locale of LOCALES) {
      // Guard against a flattening regression that would make everything pass.
      expect(KEYS[locale].length, `${locale}.js looks empty after flattening`).toBeGreaterThan(600);
    }

    for (const a of LOCALES) {
      for (const b of LOCALES) {
        if (a === b) continue;
        const missing = KEYS[a].filter((k) => !KEY_SETS[b].has(k));
        const extra = KEYS[b].filter((k) => !KEY_SETS[a].has(k));
        expect(missing, `${b}.js is missing ${list(missing)} (present in ${a}.js)`).toEqual([]);
        expect(extra, `${b}.js has ${list(extra)} that ${a}.js lacks`).toEqual([]);
      }
    }
  });

  it("never uses an empty string as a value", () => {
    const empty = [];
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(FLAT[locale])) {
        const items = Array.isArray(value) ? value : [value];
        if (items.length === 0) empty.push(`${locale}:${key} (empty list)`);
        for (const item of items) {
          if (typeof item !== "string") empty.push(`${locale}:${key} (not a string)`);
          else if (item.trim() === "") empty.push(`${locale}:${key} (blank)`);
        }
      }
    }
    expect(empty, `empty values found — ${list(empty)}`).toEqual([]);
  });

  it("uses the same placeholders for a key in every locale", () => {
    const mismatches = [];
    for (const key of KEYS.zh) {
      // Missing keys are reported by the key-set test; skip them here so the
      // failure output stays focused on placeholder drift.
      if (!KEY_SETS.en.has(key) || !KEY_SETS.es.has(key)) continue;
      if (PLACEHOLDER_EXCEPTIONS.has(key)) continue;
      const sets = LOCALES.map((l) => placeholders(FLAT[l][key]));
      const signature = sets.map((s) => s.join(","));
      if (new Set(signature).size > 1) {
        mismatches.push(`${key} → ${LOCALES.map((l, i) => `${l}:[${signature[i]}]`).join(" ")}`);
      }
    }
    expect(mismatches, `placeholder mismatches — ${list(mismatches)}`).toEqual([]);
  });
});
