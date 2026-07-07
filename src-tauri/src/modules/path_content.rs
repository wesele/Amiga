use serde_json::Value;

const QUESTIONS_JSON: &str = include_str!("../../../content-studio/data/questions.json");
const FRAMEWORK_JSON: &str = include_str!("../../../content-studio/data/unit-framework.json");

pub fn load_questions() -> Result<Vec<Value>, String> {
    serde_json::from_str(QUESTIONS_JSON).map_err(|e| format!("parse questions.json: {e}"))
}

pub fn load_framework() -> Result<Value, String> {
    serde_json::from_str(FRAMEWORK_JSON).map_err(|e| format!("parse unit-framework.json: {e}"))
}

pub fn pair_langs(pair_key: &str) -> Option<(String, String)> {
    match pair_key {
        "zh-es" => Some(("zh".to_string(), "es".to_string())),
        "pair_1781451962486" => Some(("es".to_string(), "zh".to_string())),
        "pair_1782569237717" => Some(("zh".to_string(), "en".to_string())),
        _ => {
            let (from, to) = pair_key.split_once('-')?;
            Some((from.to_string(), to.to_string()))
        }
    }
}
