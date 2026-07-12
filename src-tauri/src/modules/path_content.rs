// Force recompile to pick up new questions bundle
use serde_json::Value;

include!(concat!(env!("OUT_DIR"), "/questions_bundle.rs"));
const FRAMEWORK_JSON: &str = include_str!("../../../content-studio/data/unit-framework.json");

pub fn load_questions() -> Result<Vec<Value>, String> {
    serde_json::from_str(QUESTIONS_JSON).map_err(|e| format!("parse question shards: {e}"))
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn generated_question_bundle_is_valid() {
        let questions = load_questions().expect("load generated question bundle");
        assert!(!questions.is_empty());
        let framework = load_framework().expect("load framework");
        let mut ids = HashSet::new();
        for question in questions {
            let id = question["id"].as_str().expect("question id").to_string();
            assert!(ids.insert(id.clone()), "duplicate question id: {id}");
            let pair_id = question["pairId"].as_str().expect("question pairId");
            let cefr = question["cefr"].as_str().expect("question cefr");
            let section_id = question["sectionId"].as_str().expect("question sectionId");
            let (_, local_section) = section_id.split_once('/').expect("scoped sectionId");
            let (unit_id, section_tail) = local_section.split_once('-').expect("unit-section id");
            let sections = framework[pair_id][cefr]["units"]
                .as_array()
                .expect("framework units")
                .iter()
                .find(|unit| unit["id"].as_str() == Some(unit_id))
                .and_then(|unit| unit["sections"].as_array())
                .expect("question unit exists");
            assert!(
                sections
                    .iter()
                    .any(|section| section["id"].as_str() == Some(section_tail)),
                "question section missing from framework: {section_id}"
            );
        }
    }
}
