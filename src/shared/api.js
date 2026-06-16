import { invoke } from "@tauri-apps/api/core";

// ─── User ───
export const getCurrentUser = () => invoke("get_current_user");
export const createUser = (request) => invoke("create_user", { request });
export const updateUser = (request) => invoke("update_user_cmd", { request });
export const saveLearningGoal = (goal) => invoke("save_learning_goal_cmd", { goal });
export const getLearningGoals = (userId) => invoke("get_learning_goals_cmd", { userId });
export const isWizardCompleted = () => invoke("is_wizard_completed_cmd");
export const resetWizard = () => invoke("reset_wizard_cmd");

// ─── Vocabulary ───
export const importVocabBank = () => invoke("import_vocab_bank_cmd");
export const initUserVocab = (userId, cefrLevel) =>
  invoke("init_user_vocab_cmd", { userId, cefrLevel });
export const updateWordMastery = (userId, wordId, mastery, source) =>
  invoke("update_word_mastery_cmd", { userId, wordId, mastery, source });
export const getUnknownWords = (userId, cefrLevel, limit) =>
  invoke("get_unknown_words_cmd", { userId, cefrLevel, limit });
export const getUserVocabStats = (userId) =>
  invoke("get_user_vocab_stats_cmd", { userId });

// ─── News ───
export const fetchNews = (region, targetLang) =>
  invoke("fetch_news_cmd", { region, targetLang });
export const getArticles = (region) => invoke("get_articles_cmd", { region });
export const getArticle = (articleId) => invoke("get_article_cmd", { articleId });
export const saveReadingLog = (logEntry) =>
  invoke("save_reading_log_cmd", { logEntry });

// ─── LLM ───
export const rewriteArticle = (articleId, cefrLevel, userId) =>
  invoke("rewrite_article_cmd", { articleId, cefrLevel, userId });
export const translateWord = (word, context, nativeLang) =>
  invoke("translate_word_cmd", { word, context, nativeLang });
export const testLlmConnection = (config) =>
  invoke("test_llm_connection_cmd", { config });
export const saveLlmConfig = (key, config) =>
  invoke("save_llm_config_cmd", { key, config });
export const getLlmConfig = () => invoke("get_llm_config_cmd");
export const getBilingual = (articleId, nativeLang) =>
  invoke("get_bilingual_cmd", { articleId, nativeLang });
export const translateText = (text, nativeLang) =>
  invoke("translate_text_cmd", { text, nativeLang });

// ─── Settings ───
export const saveSetting = (key, value) =>
  invoke("save_setting_cmd", { key, value });
export const getSetting = (key) => invoke("get_setting_cmd", { key });

// ─── Legacy ───
export const greet = (name) => invoke("greet", { name });
