import { invoke as tauriInvoke } from "@tauri-apps/api/core";

let _invoke = tauriInvoke;

export function __setInvoke(fn) {
  _invoke = fn;
}

export function __resetInvoke() {
  _invoke = tauriInvoke;
}

// ─── User ───
export const getCurrentUser = () => _invoke("get_current_user");
export const createUser = (request) => _invoke("create_user", { request });
export const updateUser = (request) => _invoke("update_user_cmd", { request });
export const saveLearningGoal = (goal) => _invoke("save_learning_goal_cmd", { goal });
export const getLearningGoals = (userId) => _invoke("get_learning_goals_cmd", { userId });
export const isWizardCompleted = () => _invoke("is_wizard_completed_cmd");
export const resetWizard = () => _invoke("reset_wizard_cmd");

// ─── Vocabulary ───
export const importVocabBank = () => _invoke("import_vocab_bank_cmd");
export const initUserVocab = (userId, cefrLevel) =>
  _invoke("init_user_vocab_cmd", { userId, cefrLevel });
export const updateWordMastery = (userId, wordId, mastery, source) =>
  _invoke("update_word_mastery_cmd", { userId, wordId, mastery, source });
export const getUnknownWords = (userId, cefrLevel, limit) =>
  _invoke("get_unknown_words_cmd", { userId, cefrLevel, limit });
export const getUserVocabStats = (userId) =>
  _invoke("get_user_vocab_stats_cmd", { userId });
export const getUserVocabByLevel = (userId, language, cefrLevel) =>
  _invoke("get_user_vocab_by_level_cmd", { userId, language, cefrLevel });
export const getUserVocabStatsByLevel = (userId, language) =>
  _invoke("get_user_vocab_stats_by_level_cmd", { userId, language });
export const markWordsSeen = (userId, wordIds) =>
  _invoke("mark_words_seen_cmd", { userId, wordIds });
export const lookupWordIds = (words, language) =>
  _invoke("lookup_word_ids_cmd", { words, language });
export const resetUserVocabByLevel = (userId, language, cefrLevel) =>
  _invoke("reset_user_vocab_by_level_cmd", { userId, language, cefrLevel });

// ─── News ───
export const fetchNews = (region, targetLang) =>
  _invoke("fetch_news_cmd", { region, targetLang });
export const getArticles = (region) => _invoke("get_articles_cmd", { region });
export const getArticle = (articleId) => _invoke("get_article_cmd", { articleId });
export const saveReadingLog = (logEntry) =>
  _invoke("save_reading_log_cmd", { logEntry });

// ─── LLM ───
export const rewriteArticle = (articleId, cefrLevel, userId) =>
  _invoke("rewrite_article_cmd", { articleId, cefrLevel, userId });
export const translateWord = (word, context, nativeLang) =>
  _invoke("translate_word_cmd", { word, context, nativeLang });
export const testLlmConnection = (config) =>
  _invoke("test_llm_connection_cmd", { config });
export const saveLlmConfig = (key, config) =>
  _invoke("save_llm_config_cmd", { key, config });
export const getLlmConfig = () => _invoke("get_llm_config_cmd");
export const getBilingual = (articleId, nativeLang) =>
  _invoke("get_bilingual_cmd", { articleId, nativeLang });
export const translateText = (text, nativeLang) =>
  _invoke("translate_text_cmd", { text, nativeLang });

// ─── Settings ───
export const saveSetting = (key, value) =>
  _invoke("save_setting_cmd", { key, value });
export const getSetting = (key) => _invoke("get_setting_cmd", { key });

// ─── Prompts ───
export const getAllPrompts = () => _invoke("get_all_prompts_cmd");
export const getPrompt = (key) => _invoke("get_prompt_cmd", { key });
export const savePrompt = (key, name, category, systemPrompt, userPromptTemplate) =>
  _invoke("save_prompt_cmd", { key, name, category, systemPrompt, userPromptTemplate });
export const resetPrompt = (key) => _invoke("reset_prompt_cmd", { key });
export const resetAllPrompts = () => _invoke("reset_all_prompts_cmd");

// ─── Update ───
export const checkUpdate = () => _invoke("check_update");

// ─── Chat ───
export const chatCompletion = (messages, nativeLang, targetLang) =>
  _invoke("chat_completion_cmd", { messages, nativeLang, targetLang });
export const chatCompletionWithSession = (sessionId, message, nativeLang, targetLang) =>
  _invoke("chat_completion_with_session_cmd", { sessionId, message, nativeLang, targetLang });
export const createChatSession = (userId, title, contactType) =>
  _invoke("create_chat_session_cmd", { userId, title, contactType });
export const getChatSessions = () =>
  _invoke("get_chat_sessions_cmd");
export const deleteChatSession = (sessionId) =>
  _invoke("delete_chat_session_cmd", { sessionId });
export const getChatMessages = (sessionId, limit = 50) =>
  _invoke("get_chat_messages_cmd", { sessionId, limit });
export const updateChatSessionTitle = (sessionId, title) =>
  _invoke("update_chat_session_title_cmd", { sessionId, title });
export const getAmigaProfile = () => _invoke("get_amiga_profile_cmd");

// ─── Legacy ───
export const greet = (name) => _invoke("greet", { name });
