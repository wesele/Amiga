// Force rerun build script to bundle questions
use std::{env, fs, path::PathBuf};

fn main() {
    generate_questions_bundle();
    tauri_build::build()
}

fn generate_questions_bundle() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let questions_dir = manifest_dir.join("../content-studio/data/questions");
    let index_path = questions_dir.join("index.json");
    println!("cargo:rerun-if-changed={}", questions_dir.display());
    let index_text = fs::read_to_string(&index_path).expect("read questions/index.json");
    let index: serde_json::Value =
        serde_json::from_str(&index_text).expect("parse questions/index.json");
    let shards = index["shards"]
        .as_array()
        .expect("questions index shards array");
    let mut questions = Vec::new();
    for shard in shards {
        let relative = shard["file"].as_str().expect("question shard file");
        let path = questions_dir.join(relative);
        let text =
            fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
        let values: Vec<serde_json::Value> =
            serde_json::from_str(&text).unwrap_or_else(|e| panic!("parse {}: {e}", path.display()));
        questions.extend(values);
    }
    let json = serde_json::to_string(&questions).expect("serialize questions bundle");
    let output = format!("pub const QUESTIONS_JSON: &str = {:?};\n", json);
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    fs::write(out_dir.join("questions_bundle.rs"), output).expect("write questions bundle");
}
