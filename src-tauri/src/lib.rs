mod commands;
mod modules;

use commands::llm::LlmState;
use modules::database::DatabasePool;
use modules::llm::LlmClient;
use modules::logging;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging first
    logging::init_logging();
    log::info!("Starting Idioma application...");

    // Initialize database and run migrations.
    // Never panic here: if opening retained old data fails we create a
    // broken stand-in pool so the frontend can show a proper dialog
    // (delete old data + restart, or exit) instead of a white screen.
    let db_pool = DatabasePool::new();

    // Import vocabulary bank if not already imported
    if let Err(e) = modules::vocabulary::import_vocab_bank(&db_pool) {
        log::error!("Failed to import vocabulary bank: {}", e);
    }

    // Insert default prompts if not already present
    modules::prompts::ensure_default_prompts(&db_pool);

    // Seed reading topics if not already seeded
    modules::reading::ensure_default_topics(&db_pool);

    // Create LLM client
    let llm_state = LlmState {
        client: LlmClient::new(),
    };

    let db_for_startup_sync = db_pool.clone();
    tauri::async_runtime::spawn(async move {
        if let Ok(true) = modules::sync::is_cloud_sync_enabled(&db_for_startup_sync) {
            if let Err(e) = modules::sync::run_cloud_sync(&db_for_startup_sync).await {
                log::warn!("Startup cloud sync failed: {}", e);
            }
        }
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(commands::share::init())
        .manage(db_pool)
        .manage(llm_state)
        .invoke_handler(tauri::generate_handler![
            // Greeting (legacy)
            commands::greeting::greet,
            // Database commands
            commands::database::is_schema_compatible_cmd,
            commands::database::reset_database_cmd,
            commands::database::get_database_status_cmd,
            commands::database::delete_database_file_cmd,
            commands::database::delete_database_and_restart_cmd,
            commands::database::exit_app_cmd,
            // User commands
            commands::user::create_user,
            commands::user::get_current_user,
            commands::user::update_user_cmd,
            commands::user::save_learning_goal_cmd,
            commands::user::get_learning_goals_cmd,
            commands::user::is_wizard_completed_cmd,
            commands::user::reset_wizard_cmd,
            commands::user::set_target_language_cmd,
            commands::user::get_target_language_cmd,
            commands::user::update_learning_goal_cefr_cmd,
            // Vocabulary commands
            commands::vocabulary::import_vocab_bank_cmd,
            commands::vocabulary::reimport_vocab_bank_cmd,
            commands::vocabulary::init_user_vocab_cmd,
            commands::vocabulary::update_word_mastery_cmd,
            commands::vocabulary::get_unknown_words_cmd,
            commands::vocabulary::get_user_vocab_stats_cmd,
            commands::vocabulary::get_user_vocab_by_level_cmd,
            commands::vocabulary::get_user_vocab_stats_by_level_cmd,
            commands::vocabulary::mark_words_seen_cmd,
            commands::vocabulary::lookup_word_ids_cmd,
            commands::vocabulary::add_discovered_word_cmd,
            commands::vocabulary::ensure_words_seen_cmd,
            commands::vocabulary::reset_user_vocab_by_level_cmd,
            // LLM commands
            commands::llm::rewrite_article_cmd,
            commands::llm::translate_word_cmd,
            commands::llm::test_llm_connection_cmd,
            commands::llm::save_llm_config_cmd,
            commands::llm::get_llm_config_cmd,
            commands::llm::save_setting_cmd,
            commands::llm::get_setting_cmd,
            commands::llm::get_bilingual_cmd,
            commands::llm::translate_text_cmd,
            // News commands
            commands::news::fetch_news_cmd,
            commands::news::get_articles_cmd,
            commands::news::get_article_cmd,
            commands::news::save_reading_log_cmd,
            commands::news::get_read_article_count_cmd,
            commands::news::get_learning_days_cmd,
            // Reading commands
            commands::reading::get_reading_articles_cmd,
            commands::reading::regenerate_reading_article_cmd,
            commands::reading::ensure_reading_article_cmd,
            commands::reading::get_reading_article_cmd,
            commands::reading::mark_reading_article_read_cmd,
            commands::reading::get_or_generate_reading_test_cmd,
            commands::reading::explain_reading_answer_cmd,
            commands::reading::submit_reading_test_cmd,
            commands::reading::get_reading_test_explanations_cmd,
            commands::reading::get_completed_reading_count_cmd,
            // Speaking commands
            commands::speaking::speaking_list_topics_cmd,
            commands::speaking::speaking_start_session_cmd,
            commands::speaking::speaking_score_turn_cmd,
            commands::speaking::speaking_hint_cmd,
            commands::speaking::speaking_translate_cmd,
            commands::speaking::speaking_finish_cmd,
            commands::speaking::get_multimodal_config_cmd,
            commands::speaking::save_multimodal_config_cmd,
            commands::speaking::test_multimodal_connection_cmd,
            // Prompt commands
            commands::prompts::get_all_prompts_cmd,
            commands::prompts::get_prompt_cmd,
            commands::prompts::save_prompt_cmd,
            commands::prompts::reset_prompt_cmd,
            commands::prompts::reset_all_prompts_cmd,
            // Update commands
            commands::update::check_update,
            // Chat commands
            commands::chat::chat_completion_cmd,
            commands::chat::chat_completion_with_session_cmd,
            commands::chat::create_chat_session_cmd,
            commands::chat::get_chat_sessions_cmd,
            commands::chat::delete_chat_session_cmd,
            commands::chat::get_chat_messages_cmd,
            commands::chat::update_chat_session_title_cmd,
            commands::chat::get_amiga_profile_cmd,
            // Share commands
            commands::share::share_text_cmd,
            // Path / progression commands
            commands::path::get_path_curriculum_cmd,
            commands::path::get_section_lesson_cmd,
            commands::path::get_teaching_content_cmd,
            commands::path::get_grammar_explanation_cached_cmd,
            commands::path::explain_grammar_point_cmd,
            commands::path::complete_teaching_node_cmd,
            commands::path::complete_section_cmd,
            // Cloud sync commands
            commands::sync::test_cloud_sync_cmd,
            commands::sync::get_cloud_sync_status_cmd,
            commands::sync::set_cloud_sync_enabled_cmd,
            commands::sync::run_cloud_sync_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
