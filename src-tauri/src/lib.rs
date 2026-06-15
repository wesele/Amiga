mod commands;
mod modules;

use modules::database::DatabasePool;
use modules::logging;
use commands::llm::LlmState;
use modules::llm::LlmClient;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging first
    logging::init_logging();
    log::info!("Starting Idioma application...");

    // Initialize database and run migrations
    let db_pool = DatabasePool::new();

    // Import vocabulary bank if not already imported
    if let Err(e) = modules::vocabulary::import_vocab_bank(&db_pool) {
        log::error!("Failed to import vocabulary bank: {}", e);
    }

    // Create LLM client
    let llm_state = LlmState {
        client: LlmClient::new(),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(db_pool)
        .manage(llm_state)
        .invoke_handler(tauri::generate_handler![
            // Greeting (legacy)
            commands::greeting::greet,
            // User commands
            commands::user::create_user,
            commands::user::get_current_user,
            commands::user::update_user_cmd,
            commands::user::save_learning_goal_cmd,
            commands::user::get_learning_goals_cmd,
            commands::user::is_wizard_completed_cmd,
            commands::user::reset_wizard_cmd,
            // Vocabulary commands
            commands::vocabulary::import_vocab_bank_cmd,
            commands::vocabulary::init_user_vocab_cmd,
            commands::vocabulary::update_word_mastery_cmd,
            commands::vocabulary::get_unknown_words_cmd,
            commands::vocabulary::get_user_vocab_stats_cmd,
            // LLM commands
            commands::llm::rewrite_article_cmd,
            commands::llm::translate_word_cmd,
            commands::llm::test_llm_connection_cmd,
            commands::llm::save_llm_config_cmd,
            commands::llm::get_llm_config_cmd,
            commands::llm::save_setting_cmd,
            commands::llm::get_setting_cmd,
            // News commands
            commands::news::fetch_news_cmd,
            commands::news::get_articles_cmd,
            commands::news::get_article_cmd,
            commands::news::save_reading_log_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
