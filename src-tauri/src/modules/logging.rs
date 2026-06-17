use log::{LevelFilter, Log, Metadata, Record};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

struct FileLogger {
    log_dir: PathBuf,
    current_file: Mutex<Option<(String, fs::File)>>,
}

impl FileLogger {
    fn new(log_dir: PathBuf) -> Self {
        if let Err(e) = fs::create_dir_all(&log_dir) {
            eprintln!("[logging] Failed to create log directory: {}", e);
        }
        Self {
            log_dir,
            current_file: Mutex::new(None),
        }
    }

    #[allow(dead_code)]
    fn today_str() -> String {
        chrono::Local::now().format("%Y-%m-%d").to_string()
    }

    fn get_or_create_file(&self, date: &str) -> Option<fs::File> {
        let path = self.log_dir.join(format!("idioma-{}.log", date));
        fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .ok()
    }

    fn cleanup_old_logs(&self) {
        let cutoff = chrono::Local::now() - chrono::Duration::days(3);
        let cutoff_str = cutoff.format("%Y-%m-%d").to_string();

        if let Ok(entries) = fs::read_dir(&self.log_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                if name_str.starts_with("idioma-") && name_str.ends_with(".log") {
                    // Extract date from filename: idioma-YYYY-MM-DD.log
                    if let Some(date_part) = name_str
                        .strip_prefix("idioma-")
                        .and_then(|s| s.strip_suffix(".log"))
                    {
                        if date_part < cutoff_str.as_str() {
                            let _ = fs::remove_file(entry.path());
                        }
                    }
                }
            }
        }
    }
}

impl Log for FileLogger {
    fn enabled(&self, _metadata: &Metadata) -> bool {
        true
    }

    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }

        let now = chrono::Local::now();
        let date = now.format("%Y-%m-%d").to_string();
        let timestamp = now.format("%H:%M:%S%.3f");

        let line = format!(
            "[{}] [{}] [{}] {}\n",
            timestamp,
            record.level(),
            record.target(),
            record.args()
        );

        let mut guard = self.current_file.lock().unwrap();
        let needs_new_file = match guard.as_ref() {
            Some((d, _)) => d != &date,
            None => true,
        };

        if needs_new_file {
            if let Some(file) = self.get_or_create_file(&date) {
                *guard = Some((date.clone(), file));
            }
        }

        if let Some((_, file)) = guard.as_mut() {
            let _ = file.write_all(line.as_bytes());
        }
    }

    fn flush(&self) {
        let mut guard = self.current_file.lock().unwrap();
        if let Some((_, file)) = guard.as_mut() {
            let _ = file.flush();
        }
    }
}

pub fn init_logging() {
    #[cfg(target_os = "android")]
    let log_dir = PathBuf::from("/data/data/com.idioma.app/files")
        .join("idioma")
        .join("logs");

    #[cfg(not(target_os = "android"))]
    let log_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("idioma")
        .join("logs");

    let logger = FileLogger::new(log_dir);
    logger.cleanup_old_logs();

    log::set_boxed_logger(Box::new(logger)).expect("Failed to set logger");
    log::set_max_level(LevelFilter::Debug);

    log::info!("=== Idioma application started ===");
    log::debug!("Log directory: {:?}", dirs::data_local_dir().map(|p| p.join("idioma/logs")));
}
