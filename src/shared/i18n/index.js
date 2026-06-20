// Lightweight i18n composable + Vue plugin.
//
// Design choices (see AGENTS.md "minimal deps"):
//   - No external library. We build a small reactive dictionary + a `t()`
//     function that takes a dotted key and optional `{name}` placeholders.
//   - Locale is stored in a single module-level `ref` so all components
//     share it. `t()` reads it, so templates that call `t()` re-render
//     automatically when the locale changes (Vue tracks the dep).
//   - The locale is persisted via the existing `app_settings` key-value
//     store under `ui_language`. On startup, `initLocale()` hydrates it.
//   - A missing key falls back to the Chinese (default) string and finally
//     to the key itself, so untranslated keys are visible in the UI.

import { readonly, ref } from "vue";
import { getSetting, saveSetting } from "@/shared/api.js";
import zh from "./zh.js";
import en from "./en.js";
import es from "./es.js";

export const DICTS = { zh, en, es };
export const SUPPORTED_LOCALES = ["zh", "en", "es"];
export const DEFAULT_LOCALE = "zh";
const SETTINGS_KEY = "ui_language";

const _locale = ref(DEFAULT_LOCALE);

function lookup(dict, key) {
  const parts = key.split(".");
  let cur = dict;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) cur = cur[p];
    else return undefined;
  }
  return cur;
}

function interpolate(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, name) =>
    params[name] != null ? String(params[name]) : m,
  );
}

export function t(key, params) {
  const dict = DICTS[_locale.value] || DICTS[DEFAULT_LOCALE];
  let v = lookup(dict, key);
  if (v == null) v = lookup(DICTS[DEFAULT_LOCALE], key);
  if (v == null) return key;
  if (typeof v !== "string") return key;
  return interpolate(v, params);
}

export function setLocale(lang, { persist = true } = {}) {
  if (!SUPPORTED_LOCALES.includes(lang)) lang = DEFAULT_LOCALE;
  _locale.value = lang;
  if (persist) {
    saveSetting(SETTINGS_KEY, lang).catch((e) => {
      console.warn("Failed to persist ui_language", e);
    });
  }
}

export function getLocale() {
  return _locale.value;
}

/**
 * Hydrate the locale from the persistent setting. Call this once at app
 * boot, before the router resolves routes, so the first render uses the
 * right language.
 */
export async function initLocale() {
  try {
    const saved = await getSetting(SETTINGS_KEY);
    if (saved && SUPPORTED_LOCALES.includes(saved)) {
      setLocale(saved, { persist: false });
    }
  } catch (e) {
    // No backend yet (e.g. running in a browser dev environment) — keep the default.
  }
}

export function useI18n() {
  return {
    locale: readonly(_locale),
    setLocale,
    t,
  };
}

// `i18n` plain object (handy for non-component code paths).
export const i18n = {
  locale: readonly(_locale),
  setLocale,
  t,
};

export default {
  install(app) {
    app.config.globalProperties.$t = t;
    app.config.globalProperties.$locale = readonly(_locale);
    app.config.globalProperties.$setLocale = setLocale;
    app.provide("i18n", { t, locale: readonly(_locale), setLocale });
  },
};
