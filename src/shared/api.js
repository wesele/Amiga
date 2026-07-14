import { invoke as tauriInvoke, isTauri } from "@tauri-apps/api/core";

let _invoke = tauriInvoke;

function invokeWithOptionalArgs(invoke, command, args) {
  return args === undefined ? invoke(command) : invoke(command, args);
}

export function createApiClient(invoke) {
  if (typeof invoke !== "function") {
    throw new TypeError("createApiClient requires an invoke function");
  }

  const call = (command, args) => invokeWithOptionalArgs(invoke, command, args);

  return {
    // Database
    isSchemaCompatible: () => call("is_schema_compatible_cmd"),
    resetDatabase: () => call("reset_database_cmd"),
    getDatabaseStatus: () => call("get_database_status_cmd"),
    deleteDatabaseFile: () => call("delete_database_file_cmd"),
    deleteDatabaseAndRestart: () => call("delete_database_and_restart_cmd"),
    exitApp: () => call("exit_app_cmd"),

    // User
    getCurrentUser: () => call("get_current_user"),
    createUser: (request) => call("create_user", { request }),
    updateUser: (request) => call("update_user_cmd", { request }),
    saveLearningGoal: (goal) => call("save_learning_goal_cmd", { goal }),
    getLearningGoals: (userId) => call("get_learning_goals_cmd", { userId }),
    isWizardCompleted: () => call("is_wizard_completed_cmd"),
    resetWizard: () => call("reset_wizard_cmd"),
    setTargetLanguage: (language) => call("set_target_language_cmd", { language }),
    getTargetLanguage: () => call("get_target_language_cmd"),
    updateLearningGoalCefr: (targetLanguage, cefrLevel) =>
      call("update_learning_goal_cefr_cmd", { targetLanguage, cefrLevel }),

    // Vocabulary
    importVocabBank: () => call("import_vocab_bank_cmd"),
    reimportVocabBank: () => call("reimport_vocab_bank_cmd"),
    initUserVocab: (userId, cefrLevel) =>
      call("init_user_vocab_cmd", { userId, cefrLevel }),
    updateWordMastery: (userId, wordId, mastery, source) =>
      call("update_word_mastery_cmd", { userId, wordId, mastery, source }),
    getUnknownWords: (userId, cefrLevel, limit, targetLang) =>
      call("get_unknown_words_cmd", { userId, cefrLevel, limit, targetLang }),
    getUserVocabStats: (userId, targetLang) =>
      call("get_user_vocab_stats_cmd", { userId, targetLang }),
    getUserVocabByLevel: (userId, language, cefrLevel) =>
      call("get_user_vocab_by_level_cmd", { userId, language, cefrLevel }),
    getUserVocabStatsByLevel: (userId, language) =>
      call("get_user_vocab_stats_by_level_cmd", { userId, language }),
    markWordsSeen: (userId, wordIds) =>
      call("mark_words_seen_cmd", { userId, wordIds }),
    lookupWordIds: (words, language) =>
      call("lookup_word_ids_cmd", { words, language }),
    addDiscoveredWord: (userId, word, language, context) =>
      call("add_discovered_word_cmd", { userId, word, language, context }),
    ensureWordsSeen: (userId, words, language) =>
      call("ensure_words_seen_cmd", { userId, words, language }),
    resetUserVocabByLevel: (userId, language, cefrLevel) =>
      call("reset_user_vocab_by_level_cmd", { userId, language, cefrLevel }),

    // Progression path
    getPathCurriculum: (nativeLang, targetLang, cefr) =>
      call("get_path_curriculum_cmd", { nativeLang, targetLang, cefr }),
    getSectionLesson: (nativeLang, targetLang, cefr, sectionId) =>
      call("get_section_lesson_cmd", { nativeLang, targetLang, cefr, sectionId }),
    getTeachingContent: (nativeLang, targetLang, cefr, nodeId) =>
      call("get_teaching_content_cmd", { nativeLang, targetLang, cefr, nodeId }),
    getGrammarExplanationCached: (cefr, unitId, pointText) =>
      call("get_grammar_explanation_cached_cmd", { cefr, unitId, pointText }),
    explainGrammarPoint: (cefr, targetLang, unitId, pointText, unitTitle, unitGoal) =>
      call("explain_grammar_point_cmd", {
        cefr,
        targetLang,
        unitId,
        pointText,
        unitTitle,
        unitGoal,
      }),
    completeTeachingNode: (nativeLang, targetLang, cefr, nodeId) =>
      call("complete_teaching_node_cmd", { nativeLang, targetLang, cefr, nodeId }),
    completeSection: (nativeLang, targetLang, cefr, sectionId, correctCount, totalCount) =>
      call("complete_section_cmd", {
        nativeLang,
        targetLang,
        cefr,
        sectionId,
        correctCount,
        totalCount,
      }),

    // News
    fetchNews: (region, targetLang) => call("fetch_news_cmd", { region, targetLang }),
    getArticles: (region) => call("get_articles_cmd", { region }),
    getArticle: (articleId) => call("get_article_cmd", { articleId }),
    saveReadingLog: (logEntry) => call("save_reading_log_cmd", { logEntry }),
    getReadArticleCount: (userId) => call("get_read_article_count_cmd", { userId }),
    getLearningDays: (userId) => call("get_learning_days_cmd", { userId }),

    // Achievements
    getAchievementDays: (userId, startDate, endDate) =>
      call("get_achievement_days_cmd", { userId, startDate, endDate }),
    recordAppOpen: () => call("record_app_open_cmd"),
    getAchievementProgress: (userId) =>
      call("get_achievement_progress_cmd", { userId }),

    // LLM
    rewriteArticle: (articleId, cefrLevel, userId, targetLang) =>
      call("rewrite_article_cmd", { articleId, cefrLevel, userId, targetLang }),
    translateWord: (word, context, sourceLang, nativeLang) =>
      call("translate_word_cmd", { word, context, sourceLang, nativeLang }),
    testLlmConnection: (config) => call("test_llm_connection_cmd", { config }),
    saveLlmConfig: (key, config) => call("save_llm_config_cmd", { key, config }),
    getLlmConfig: () => call("get_llm_config_cmd"),
    getBilingual: (articleId, sourceLang, nativeLang) =>
      call("get_bilingual_cmd", { articleId, sourceLang, nativeLang }),
    translateText: (text, sourceLang, nativeLang) =>
      call("translate_text_cmd", { text, sourceLang, nativeLang }),
    gradeTranslation: (sourceText, acceptedAnswers, userAnswer, targetLang) =>
      call("grade_translation_cmd", { sourceText, acceptedAnswers, userAnswer, targetLang }),

    // Settings
    saveSetting: (key, value) => call("save_setting_cmd", { key, value }),
    getSetting: (key) => call("get_setting_cmd", { key }),

    // Prompts
    getAllPrompts: () => call("get_all_prompts_cmd"),
    getPrompt: (key) => call("get_prompt_cmd", { key }),
    savePrompt: (key, name, category, systemPrompt, userPromptTemplate) =>
      call("save_prompt_cmd", { key, name, category, systemPrompt, userPromptTemplate }),
    resetPrompt: (key) => call("reset_prompt_cmd", { key }),
    resetAllPrompts: () => call("reset_all_prompts_cmd"),

    // Update
    checkUpdate: () => call("check_update"),

    // Chat
    chatCompletion: (messages, nativeLang, targetLang) =>
      call("chat_completion_cmd", { messages, nativeLang, targetLang }),
    chatCompletionWithSession: (sessionId, message, nativeLang, targetLang) =>
      call("chat_completion_with_session_cmd", { sessionId, message, nativeLang, targetLang }),
    createChatSession: (userId, title, contactType, targetLang) =>
      call("create_chat_session_cmd", { userId, title, contactType, targetLang }),
    getChatSessions: (targetLang) => call("get_chat_sessions_cmd", { targetLang }),
    deleteChatSession: (sessionId) => call("delete_chat_session_cmd", { sessionId }),
    getChatMessages: (sessionId, limit = 50) =>
      call("get_chat_messages_cmd", { sessionId, limit }),
    updateChatSessionTitle: (sessionId, title) =>
      call("update_chat_session_title_cmd", { sessionId, title }),
    getAmigaProfile: (targetLang) => call("get_amiga_profile_cmd", { targetLang }),

    shareText: (text) => call("share_text_cmd", { text }),

    // Reading
    getReadingArticles: (userId, targetLanguage) =>
      call("get_reading_articles_cmd", { userId, targetLanguage }),
    regenerateReadingArticle: (articleId, cefrLevel, nativeLang) =>
      call("regenerate_reading_article_cmd", { articleId, cefrLevel, nativeLang }),
    ensureReadingArticle: (userId, targetLanguage, cefrLevel, nativeLang) =>
      call("ensure_reading_article_cmd", { userId, targetLanguage, cefrLevel, nativeLang }),
    getReadingArticle: (articleId) =>
      call("get_reading_article_cmd", { articleId }),
    markReadingArticleRead: (articleId) =>
      call("mark_reading_article_read_cmd", { articleId }),
    getOrGenerateReadingTest: (articleId, targetLanguage, cefrLevel) =>
      call("get_or_generate_reading_test_cmd", { articleId, targetLanguage, cefrLevel }),
    explainReadingAnswer: (articleId, questionIndex, questionJson, userAnswer, correctAnswer, targetLanguage, nativeLang) =>
      call("explain_reading_answer_cmd", { articleId, questionIndex, questionJson, userAnswer, correctAnswer, targetLanguage, nativeLang }),
    submitReadingTest: (articleId, userId, answersJson, correctCount, totalCount) =>
      call("submit_reading_test_cmd", { articleId, userId, answersJson, correctCount, totalCount }),
    getReadingTestExplanations: (articleId) =>
      call("get_reading_test_explanations_cmd", { articleId }),
    getCompletedReadingCount: (userId) =>
      call("get_completed_reading_count_cmd", { userId }),

    // Speaking
    speakingListTopics: () => call("speaking_list_topics_cmd"),
    speakingStartSession: (userId, topicId, targetLang, nativeLang, cefrLevel) =>
      call("speaking_start_session_cmd", {
        userId,
        topicId,
        targetLang,
        nativeLang,
        cefrLevel,
      }),
    speakingScoreTurn: (sessionId, audioBase64, audioFormat, usedHint) =>
      call("speaking_score_turn_cmd", {
        sessionId,
        audioBase64,
        audioFormat,
        usedHint,
      }),
    speakingHint: (sessionId) => call("speaking_hint_cmd", { sessionId }),
    speakingTranslate: (sessionId) => call("speaking_translate_cmd", { sessionId }),
    speakingFinish: (sessionId) => call("speaking_finish_cmd", { sessionId }),
    getCompletedSpeakingCount: (userId) =>
      call("get_completed_speaking_count_cmd", { userId }),
    getMultimodalConfig: () => call("get_multimodal_config_cmd"),
    saveMultimodalConfig: (config) => call("save_multimodal_config_cmd", { config }),
    testMultimodalConnection: (config) =>
      call("test_multimodal_connection_cmd", { config }),

    // Soul Mate
    initializeSoulMate: (request) => call("initialize_soulmate_cmd", { request }),
    getSoulMateWorld: (userId) => call("get_soulmate_world_cmd", { userId }),
    updateSoulMate: (request) => call("update_soulmate_cmd", { request }),
    getSoulMateHome: (userId) => call("get_soulmate_home_cmd", { userId }),
    generateSoulMateEpisode: (userId) =>
      call("generate_soulmate_episode_cmd", { userId }),
    getSoulMateEpisode: (episodeId) =>
      call("get_soulmate_episode_cmd", { episodeId }),
    markSoulMateStoryRead: (episodeId) =>
      call("mark_soulmate_story_read_cmd", { episodeId }),
    getSoulMateChat: (userId, episodeId) =>
      call("get_soulmate_chat_cmd", { userId, episodeId }),
    submitSoulMateTurn: (userId, episodeId, message) =>
      call("submit_soulmate_turn_cmd", { userId, episodeId, message }),
    resetSoulMate: (userId) => call("reset_soulmate_cmd", { userId }),

    // Cloud sync
    testCloudSync: () => call("test_cloud_sync_cmd"),
    getCloudSyncStatus: () => call("get_cloud_sync_status_cmd"),
    setCloudSyncEnabled: (enabled, forceEnable = false) =>
      call("set_cloud_sync_enabled_cmd", { enabled, forceEnable }),
    runCloudSync: () => call("run_cloud_sync_cmd"),
    checkCloudRestore: (nickname) =>
      call("check_cloud_restore_cmd", { nickname }),
    restoreFromCloudWizard: (nickname) =>
      call("restore_from_cloud_wizard_cmd", { nickname }),
  };
}

// In a plain browser (vite dev without Tauri shell), every Tauri call throws.
// The components already handle that with try/catch + empty states, so we just
// route the calls through `tauriInvoke` and let them reject. The reason we
// expose `isTauri` is so pages can skip certain interactions entirely in
// browser dev mode if needed.
export const inTauri = isTauri;

export const defaultApiClient = createApiClient((command, args) =>
  invokeWithOptionalArgs(_invoke, command, args),
);

export function __setInvoke(fn) {
  _invoke = fn;
}

export function __resetInvoke() {
  _invoke = tauriInvoke;
}

// --- Database ---
export const isSchemaCompatible = (...args) => defaultApiClient.isSchemaCompatible(...args);
export const resetDatabase = (...args) => defaultApiClient.resetDatabase(...args);
export const getDatabaseStatus = (...args) => defaultApiClient.getDatabaseStatus(...args);
export const deleteDatabaseFile = (...args) => defaultApiClient.deleteDatabaseFile(...args);
export const deleteDatabaseAndRestart = (...args) =>
  defaultApiClient.deleteDatabaseAndRestart(...args);
export const exitApp = (...args) => defaultApiClient.exitApp(...args);

// --- User ---
export const getCurrentUser = (...args) => defaultApiClient.getCurrentUser(...args);
export const createUser = (...args) => defaultApiClient.createUser(...args);
export const updateUser = (...args) => defaultApiClient.updateUser(...args);
export const saveLearningGoal = (...args) => defaultApiClient.saveLearningGoal(...args);
export const getLearningGoals = (...args) => defaultApiClient.getLearningGoals(...args);
export const isWizardCompleted = (...args) => defaultApiClient.isWizardCompleted(...args);
export const resetWizard = (...args) => defaultApiClient.resetWizard(...args);
export const setTargetLanguage = (...args) => defaultApiClient.setTargetLanguage(...args);
export const getTargetLanguage = (...args) => defaultApiClient.getTargetLanguage(...args);
export const updateLearningGoalCefr = (...args) =>
  defaultApiClient.updateLearningGoalCefr(...args);

// --- Vocabulary ---
export const importVocabBank = (...args) => defaultApiClient.importVocabBank(...args);
export const reimportVocabBank = (...args) => defaultApiClient.reimportVocabBank(...args);
export const initUserVocab = (...args) => defaultApiClient.initUserVocab(...args);
export const updateWordMastery = (...args) => defaultApiClient.updateWordMastery(...args);
export const getUnknownWords = (...args) => defaultApiClient.getUnknownWords(...args);
export const getUserVocabStats = (...args) => defaultApiClient.getUserVocabStats(...args);
export const getUserVocabByLevel = (...args) => defaultApiClient.getUserVocabByLevel(...args);
export const getUserVocabStatsByLevel = (...args) =>
  defaultApiClient.getUserVocabStatsByLevel(...args);
export const markWordsSeen = (...args) => defaultApiClient.markWordsSeen(...args);
export const lookupWordIds = (...args) => defaultApiClient.lookupWordIds(...args);
export const addDiscoveredWord = (...args) => defaultApiClient.addDiscoveredWord(...args);
export const ensureWordsSeen = (...args) => defaultApiClient.ensureWordsSeen(...args);
export const resetUserVocabByLevel = (...args) =>
  defaultApiClient.resetUserVocabByLevel(...args);

// --- Progression path ---
export const getPathCurriculum = (...args) => defaultApiClient.getPathCurriculum(...args);
export const getSectionLesson = (...args) => defaultApiClient.getSectionLesson(...args);
export const getTeachingContent = (...args) => defaultApiClient.getTeachingContent(...args);
export const getGrammarExplanationCached = (...args) =>
  defaultApiClient.getGrammarExplanationCached(...args);
export const explainGrammarPoint = (...args) => defaultApiClient.explainGrammarPoint(...args);
export const completeTeachingNode = (...args) => defaultApiClient.completeTeachingNode(...args);
export const completeSection = (...args) => defaultApiClient.completeSection(...args);

// --- News ---
export const fetchNews = (...args) => defaultApiClient.fetchNews(...args);
export const getArticles = (...args) => defaultApiClient.getArticles(...args);
export const getArticle = (...args) => defaultApiClient.getArticle(...args);
export const saveReadingLog = (...args) => defaultApiClient.saveReadingLog(...args);
export const getReadArticleCount = (...args) => defaultApiClient.getReadArticleCount(...args);
export const getLearningDays = (...args) => defaultApiClient.getLearningDays(...args);

// --- Achievements ---
export const getAchievementDays = (...args) => defaultApiClient.getAchievementDays(...args);
export const recordAppOpen = (...args) => defaultApiClient.recordAppOpen(...args);
export const getAchievementProgress = (...args) => defaultApiClient.getAchievementProgress(...args);

// --- LLM ---
export const rewriteArticle = (...args) => defaultApiClient.rewriteArticle(...args);
export const translateWord = (...args) => defaultApiClient.translateWord(...args);
export const testLlmConnection = (...args) => defaultApiClient.testLlmConnection(...args);
export const saveLlmConfig = (...args) => defaultApiClient.saveLlmConfig(...args);
export const getLlmConfig = (...args) => defaultApiClient.getLlmConfig(...args);
export const getBilingual = (...args) => defaultApiClient.getBilingual(...args);
export const translateText = (...args) => defaultApiClient.translateText(...args);
export const gradeTranslation = (...args) => defaultApiClient.gradeTranslation(...args);

// --- Settings ---
export const saveSetting = (...args) => defaultApiClient.saveSetting(...args);
export const getSetting = (...args) => defaultApiClient.getSetting(...args);

// --- Prompts ---
export const getAllPrompts = (...args) => defaultApiClient.getAllPrompts(...args);
export const getPrompt = (...args) => defaultApiClient.getPrompt(...args);
export const savePrompt = (...args) => defaultApiClient.savePrompt(...args);
export const resetPrompt = (...args) => defaultApiClient.resetPrompt(...args);
export const resetAllPrompts = (...args) => defaultApiClient.resetAllPrompts(...args);

// --- Update ---
export const checkUpdate = (...args) => defaultApiClient.checkUpdate(...args);

// --- Chat ---
export const chatCompletion = (...args) => defaultApiClient.chatCompletion(...args);
export const chatCompletionWithSession = (...args) =>
  defaultApiClient.chatCompletionWithSession(...args);
export const createChatSession = (...args) => defaultApiClient.createChatSession(...args);
export const getChatSessions = (...args) => defaultApiClient.getChatSessions(...args);
export const deleteChatSession = (...args) => defaultApiClient.deleteChatSession(...args);
export const getChatMessages = (...args) => defaultApiClient.getChatMessages(...args);
export const updateChatSessionTitle = (...args) =>
  defaultApiClient.updateChatSessionTitle(...args);
export const getAmigaProfile = (...args) => defaultApiClient.getAmigaProfile(...args);

export const shareText = (...args) => defaultApiClient.shareText(...args);

// --- Cloud sync ---
export const testCloudSync = (...args) => defaultApiClient.testCloudSync(...args);
export const getCloudSyncStatus = (...args) => defaultApiClient.getCloudSyncStatus(...args);
export const setCloudSyncEnabled = (...args) => defaultApiClient.setCloudSyncEnabled(...args);
export const runCloudSync = (...args) => defaultApiClient.runCloudSync(...args);
export const checkCloudRestore = (...args) => defaultApiClient.checkCloudRestore(...args);
export const restoreFromCloudWizard = (...args) =>
  defaultApiClient.restoreFromCloudWizard(...args);

// --- Reading ---
export const getReadingArticles = (...args) => defaultApiClient.getReadingArticles(...args);
export const regenerateReadingArticle = (...args) =>
  defaultApiClient.regenerateReadingArticle(...args);
export const ensureReadingArticle = (...args) => defaultApiClient.ensureReadingArticle(...args);
export const getReadingArticle = (...args) => defaultApiClient.getReadingArticle(...args);
export const markReadingArticleRead = (...args) => defaultApiClient.markReadingArticleRead(...args);
export const getOrGenerateReadingTest = (...args) =>
  defaultApiClient.getOrGenerateReadingTest(...args);
export const explainReadingAnswer = (...args) => defaultApiClient.explainReadingAnswer(...args);
export const submitReadingTest = (...args) => defaultApiClient.submitReadingTest(...args);
export const getReadingTestExplanations = (...args) =>
  defaultApiClient.getReadingTestExplanations(...args);
export const getCompletedReadingCount = (...args) =>
  defaultApiClient.getCompletedReadingCount(...args);

// --- Speaking ---
export const speakingListTopics = (...args) => defaultApiClient.speakingListTopics(...args);
export const speakingStartSession = (...args) => defaultApiClient.speakingStartSession(...args);
export const speakingScoreTurn = (...args) => defaultApiClient.speakingScoreTurn(...args);
export const speakingHint = (...args) => defaultApiClient.speakingHint(...args);
export const speakingTranslate = (...args) => defaultApiClient.speakingTranslate(...args);
export const speakingFinish = (...args) => defaultApiClient.speakingFinish(...args);
export const getCompletedSpeakingCount = (...args) =>
  defaultApiClient.getCompletedSpeakingCount(...args);
export const getMultimodalConfig = (...args) => defaultApiClient.getMultimodalConfig(...args);
export const saveMultimodalConfig = (...args) => defaultApiClient.saveMultimodalConfig(...args);
export const testMultimodalConnection = (...args) =>
  defaultApiClient.testMultimodalConnection(...args);

// --- Soul Mate ---
export const initializeSoulMate = (...args) => defaultApiClient.initializeSoulMate(...args);
export const getSoulMateWorld = (...args) => defaultApiClient.getSoulMateWorld(...args);
export const updateSoulMate = (...args) => defaultApiClient.updateSoulMate(...args);
export const getSoulMateHome = (...args) => defaultApiClient.getSoulMateHome(...args);
export const generateSoulMateEpisode = (...args) =>
  defaultApiClient.generateSoulMateEpisode(...args);
export const getSoulMateEpisode = (...args) => defaultApiClient.getSoulMateEpisode(...args);
export const markSoulMateStoryRead = (...args) =>
  defaultApiClient.markSoulMateStoryRead(...args);
export const getSoulMateChat = (...args) => defaultApiClient.getSoulMateChat(...args);
export const submitSoulMateTurn = (...args) => defaultApiClient.submitSoulMateTurn(...args);
export const resetSoulMate = (...args) => defaultApiClient.resetSoulMate(...args);
