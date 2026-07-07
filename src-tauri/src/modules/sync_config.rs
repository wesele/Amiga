pub const SYNC_API_BASE_URL: &str = "https://amiga-chat-social.wh1018.workers.dev";
pub const ENV_SYNC_API_BASE_URL: &str = "IDIOMA_SYNC_API_BASE_URL";

pub fn normalize_api_base_url(value: Option<&str>, default: &str) -> String {
    value
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or(default)
        .trim_end_matches('/')
        .to_string()
}

pub fn sync_api_base_url() -> String {
    normalize_api_base_url(
        std::env::var(ENV_SYNC_API_BASE_URL).ok().as_deref(),
        SYNC_API_BASE_URL,
    )
}
