// Application-wide constants. Keep this file dependency-free (no Vue / Pinia)
// so it can be imported from anywhere (Pinia stores, modules, Rust commands).

// Languages the app currently supports as a learning target. Adding a new
// one here requires (a) a `vocab_bank` populated for that language (via
// the JSON source in `content-studio/data/vocabulary.json`) and (b) an
// RSS feed mapping in `src-tauri/src/modules/news.rs::get_rss_feeds`.
// `code` is the short ISO 639-1-ish tag used in the database.
export const AVAILABLE_LANGUAGES = [
  { code: "es", flag: "🇪🇸", nameKey: "learningLang.es" },
  { code: "en", flag: "🇬🇧", nameKey: "learningLang.en" },
  { code: "zh", flag: "🇨🇳", nameKey: "learningLang.zh" },
];

export function isAvailableLanguage(code) {
  return AVAILABLE_LANGUAGES.some((l) => l.code === code);
}

// CEFR levels in display order. Used by the wizard and vocab stats.
export const CEFR_LEVELS = ["A0", "A1", "A2", "B1", "B2", "C1"];

// Levels with bundled vocabulary and path curriculum content, by target language.
const BASE_LEARNING_CEFR_LEVELS = ["A1", "A2"];
const EXTENDED_LEARNING_CEFR_LEVELS = ["A1", "A2", "B1", "B2"];

export function learningCefrLevels(targetLanguage) {
  return targetLanguage === "es" || targetLanguage === "en"
    ? EXTENDED_LEARNING_CEFR_LEVELS
    : BASE_LEARNING_CEFR_LEVELS;
}

// Map a language code to a display name in the given UI locale.
// This is a non-i18n escape hatch used by the Rust system prompts (which
// are generated server-side and need a plain string) and by the news
// reader's dynamic language labels.
export const LANG_DISPLAY = {
  es: { zh: "西班牙语", en: "Spanish", es: "Español" },
  en: { zh: "英语", en: "English", es: "Inglés" },
  zh: { zh: "中文", en: "Chinese", es: "Chino" },
};

export function displayLang(code, uiLocale = "zh") {
  return LANG_DISPLAY[code]?.[uiLocale] ?? code;
}
