// Lightweight i18n composable + Vue plugin.
//
// Design choices (see AGENTS.md "minimal deps"):
//   - No external library. We build a small reactive dictionary + a `t()`
//     function that takes a dotted key and optional `{name}` placeholders.
//   - Locale is stored in a single module-level `ref` so all components
//     share it. `t()` reads it, so templates that call `t()` re-render
//     automatically when the locale changes (Vue tracks the dep).
//   - "母语" and "UI 语言" are the same concept: `user.native_language` is
//     the single source of truth. `setLocale()` syncs both the i18n ref
//     and the user row; `initLocale()` reads from the user row first, with
//     `app_settings.ui_language` as a legacy fallback.
//   - A missing key falls back to the Chinese (default) string and finally
//     to the key itself, so untranslated keys are visible in the UI.

import { readonly, ref } from "vue";
import { getSetting, saveSetting, getCurrentUser, updateUser } from "@/shared/api.js";
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
  return str.replace(/\{\{\s*(\w+)\s*\}\}|\{(\w+)\}/g, (m, doubleName, singleName) => {
    const name = doubleName || singleName;
    return params[name] != null ? String(params[name]) : m;
  });
}

export function t(key, params) {
  const dict = DICTS[_locale.value] || DICTS[DEFAULT_LOCALE];
  let v = lookup(dict, key);
  if (v == null) v = lookup(DICTS[DEFAULT_LOCALE], key);
  if (v == null) {
    for (const fallback of Object.values(DICTS)) {
      v = lookup(fallback, key);
      if (v != null) break;
    }
  }
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
    syncNativeLanguage(lang);
  }
}

function syncNativeLanguage(lang) {
  getCurrentUser()
    .then((user) => {
      if (user.native_language !== lang) {
        updateUser({ id: user.id, native_language: lang }).catch((e) => {
          console.warn("Failed to sync native_language", e);
        });
      }
    })
    .catch(() => {});
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
    const user = await getCurrentUser();
    const lang = user.native_language;
    if (lang && SUPPORTED_LOCALES.includes(lang)) {
      setLocale(lang, { persist: false });
      return;
    }
  } catch (e) { /* backend unavailable */ }
  try {
    const saved = await getSetting(SETTINGS_KEY);
    if (saved && SUPPORTED_LOCALES.includes(saved)) {
      setLocale(saved, { persist: false });
    }
  } catch (e) { /* no backend yet */ }
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
