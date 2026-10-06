use crate::modules::database::DatabasePool;
use crate::modules::reading as reading_mod;
use log;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

type TaskRegistry = Mutex<HashMap<String, u32>>;

static RUNNING_TASKS: OnceLock<TaskRegistry> = OnceLock::new();

fn get_running_tasks() -> &'static TaskRegistry {
    RUNNING_TASKS.get_or_init(|| Mutex::new(HashMap::new()))
}

static CANCELLED_TASKS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn get_cancelled_tasks() -> &'static Mutex<HashSet<String>> {
    CANCELLED_TASKS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn is_task_cancelled(task_id: &str) -> bool {
    get_cancelled_tasks()
        .lock()
        .map(|c| c.contains(task_id))
        .unwrap_or(false)
}

type ProgressRegistry = Mutex<HashMap<String, ImportProgressEvent>>;
static IMPORT_PROGRESS: OnceLock<ProgressRegistry> = OnceLock::new();

fn get_import_progress_registry() -> &'static ProgressRegistry {
    IMPORT_PROGRESS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn get_import_progress(task_id: &str) -> Option<ImportProgressEvent> {
    get_import_progress_registry()
        .lock()
        .ok()?
        .get(task_id)
        .cloned()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct YoutubeMetadata {
    pub url: String,
    pub video_id: String,
    pub title: String,
    pub channel: Option<String>,
    pub duration_sec: Option<i64>,
    pub filesize_approx_mb: Option<f64>,
    pub has_manual_subtitles: bool,
    pub has_auto_captions: bool,
    pub subtitle_lang: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SubtitleParagraph {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImportProgressEvent {
    pub task_id: String,
    pub phase: String, // "analyzing", "subtitles", "audio", "saving", "completed", "error"
    pub percent: f64,
    pub speed_mb_s: Option<f64>,
    pub message: String,
}

/// Locate yt-dlp executable
pub fn resolve_ytdlp_path() -> PathBuf {
    // 1. Check local app bin directory (%LOCALAPPDATA%/idioma/bin/yt-dlp.exe)
    if let Some(mut local_data) = dirs::data_local_dir() {
        local_data.push("idioma");
        local_data.push("bin");
        #[cfg(windows)]
        let exe = local_data.join("yt-dlp.exe");
        #[cfg(not(windows))]
        let exe = local_data.join("yt-dlp");
        if exe.exists() {
            return exe;
        }
    }

    // 2. Check Python user scripts paths on Windows (%APPDATA%\Python and %LOCALAPPDATA%\Programs\Python)
    #[cfg(windows)]
    {
        if let Some(mut app_data) = dirs::data_dir() {
            app_data.push("Python");
            if let Ok(entries) = fs::read_dir(&app_data) {
                for entry in entries.flatten() {
                    let p = entry.path().join("Scripts").join("yt-dlp.exe");
                    if p.exists() {
                        return p;
                    }
                }
            }
        }
        if let Some(mut local_data) = dirs::data_local_dir() {
            local_data.push("Programs");
            local_data.push("Python");
            if let Ok(entries) = fs::read_dir(&local_data) {
                for entry in entries.flatten() {
                    let p = entry.path().join("Scripts").join("yt-dlp.exe");
                    if p.exists() {
                        return p;
                    }
                }
            }
        }
    }

    // 3. Check PATH
    PathBuf::from("yt-dlp")
}

pub fn update_ytdlp() -> Result<String, String> {
    let ytdlp = resolve_ytdlp_path();
    let output = Command::new(ytdlp)
        .arg("-U")
        .output()
        .map_err(|e| format!("Failed to run yt-dlp -U: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if output.status.success() {
        Ok(if stdout.trim().is_empty() {
            stderr
        } else {
            stdout
        })
    } else {
        Err(format!("Update failed: {} {}", stdout, stderr))
    }
}

pub fn extract_video_id(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if let Some(pos) = trimmed.find("v=") {
        let rest = &trimmed[pos + 2..];
        let id: String = rest
            .chars()
            .take_while(|c| *c != '&' && *c != '#' && *c != '?')
            .collect();
        if !id.is_empty() {
            return Some(id);
        }
    }
    if let Some(pos) = trimmed.find("youtu.be/") {
        let rest = &trimmed[pos + 9..];
        let id: String = rest
            .chars()
            .take_while(|c| *c != '&' && *c != '#' && *c != '?')
            .collect();
        if !id.is_empty() {
            return Some(id);
        }
    }
    if let Some(pos) = trimmed.find("youtube.com/shorts/") {
        let rest = &trimmed[pos + 19..];
        let id: String = rest
            .chars()
            .take_while(|c| *c != '&' && *c != '#' && *c != '?')
            .collect();
        if !id.is_empty() {
            return Some(id);
        }
    }
    None
}

/// Fetch metadata and check subtitle availability for target language
pub fn fetch_youtube_metadata(url: &str, target_lang: &str) -> Result<YoutubeMetadata, String> {
    let ytdlp = resolve_ytdlp_path();
    let video_id = extract_video_id(url).unwrap_or_else(|| "unknown".to_string());

    let output = Command::new(ytdlp)
        .arg("--dump-single-json")
        .arg("--skip-download")
        .arg("--no-playlist")
        .arg(url)
        .output()
        .map_err(|e| {
            format!(
                "Failed to execute yt-dlp: {}. Please check your network or yt-dlp component.",
                e
            )
        })?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp error: {}", err.trim()));
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse metadata JSON: {}", e))?;

    let title = json
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Untitled")
        .to_string();
    let channel = json
        .get("uploader")
        .or_else(|| json.get("channel"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let duration_sec = json.get("duration").and_then(|v| v.as_i64());

    // Approximate audio size calculation (assume ~64kbps = 8KB/s)
    let approx_mb = duration_sec.map(|sec| (sec as f64 * 8.0) / 1024.0);

    let norm_lang = target_lang.to_lowercase();
    let lang_prefix = norm_lang.split('-').next().unwrap_or(&norm_lang);

    let mut has_manual = false;
    let mut has_auto = false;
    let mut matched_lang = None;

    if let Some(subtitles) = json.get("subtitles").and_then(|v| v.as_object()) {
        for (k, _) in subtitles {
            let kl = k.to_lowercase();
            if kl == norm_lang || kl.starts_with(lang_prefix) {
                has_manual = true;
                matched_lang = Some(k.clone());
                break;
            }
        }
    }

    if !has_manual {
        if let Some(auto_caps) = json.get("automatic_captions").and_then(|v| v.as_object()) {
            for (k, _) in auto_caps {
                let kl = k.to_lowercase();
                if kl == norm_lang || kl.starts_with(lang_prefix) {
                    has_auto = true;
                    matched_lang = Some(k.clone());
                    break;
                }
            }
        }
    }

    Ok(YoutubeMetadata {
        url: url.to_string(),
        video_id,
        title,
        channel,
        duration_sec,
        filesize_approx_mb: approx_mb,
        has_manual_subtitles: has_manual,
        has_auto_captions: has_auto,
        subtitle_lang: matched_lang,
    })
}

/// Helper function to parse seconds from WebVTT timestamp (00:01:23.456 or 01:23.456)
fn parse_vtt_timestamp(ts: &str) -> Option<f64> {
    let parts: Vec<&str> = ts.trim().split(':').collect();
    if parts.len() == 3 {
        let h: f64 = parts[0].parse().ok()?;
        let m: f64 = parts[1].parse().ok()?;
        let s: f64 = parts[2].parse().ok()?;
        Some(h * 3600.0 + m * 60.0 + s)
    } else if parts.len() == 2 {
        let m: f64 = parts[0].parse().ok()?;
        let s: f64 = parts[1].parse().ok()?;
        Some(m * 60.0 + s)
    } else {
        None
    }
}

fn is_vtt_sentence_terminator(c: char) -> bool {
    matches!(c, '.' | '?' | '!' | '。' | '？' | '！')
}

fn text_ends_with_sentence(text: &str) -> bool {
    let trimmed = text.trim_end_matches(['"', '\'', ')', '”', '’']);
    trimmed.ends_with(is_vtt_sentence_terminator)
}

fn strip_vtt_tags(s: &str) -> String {
    let mut cleaned = String::new();
    let mut in_tag = false;
    for ch in s.chars() {
        if ch == '<' {
            in_tag = true;
        } else if ch == '>' {
            in_tag = false;
        } else if !in_tag {
            cleaned.push(ch);
        }
    }
    cleaned.trim().to_string()
}

fn split_segment_into_sentences(start: f64, end: f64, text: &str) -> Vec<(f64, f64, String)> {
    let chars: Vec<char> = text.chars().collect();
    if chars.is_empty() {
        return Vec::new();
    }

    let mut sentence_slices: Vec<String> = Vec::new();
    let mut cur = String::new();
    let mut i = 0;
    while i < chars.len() {
        cur.push(chars[i]);
        if is_vtt_sentence_terminator(chars[i]) {
            let mut j = i + 1;
            while j < chars.len()
                && (chars[j] == '"'
                    || chars[j] == '\''
                    || chars[j] == '”'
                    || chars[j] == '’'
                    || chars[j] == ')')
            {
                cur.push(chars[j]);
                j += 1;
            }
            if j == chars.len() || chars[j].is_whitespace() {
                let trimmed = cur.trim().to_string();
                if !trimmed.is_empty() {
                    sentence_slices.push(trimmed);
                }
                cur.clear();
                while j < chars.len() && chars[j].is_whitespace() {
                    j += 1;
                }
                i = j;
                continue;
            }
        }
        i += 1;
    }
    let rem = cur.trim();
    if !rem.is_empty() {
        sentence_slices.push(rem.to_string());
    }

    if sentence_slices.is_empty() {
        return Vec::new();
    }
    if sentence_slices.len() == 1 {
        return vec![(start, end, sentence_slices.remove(0))];
    }

    let total_chars: usize = sentence_slices.iter().map(|s| s.len()).sum();
    let duration = (end - start).max(0.0);
    let mut result = Vec::new();
    let mut cur_time = start;

    for s in sentence_slices {
        let frac = if total_chars > 0 {
            s.len() as f64 / total_chars as f64
        } else {
            0.0
        };
        let s_dur = duration * frac;
        let s_end = cur_time + s_dur;
        result.push((cur_time, s_end, s));
        cur_time = s_end;
    }

    result
}

/// Clean WebVTT subtitles and group into coherent paragraphs with time spans
pub fn clean_and_parse_vtt(vtt_content: &str) -> Vec<SubtitleParagraph> {
    let mut cues: Vec<(f64, f64, Vec<String>)> = Vec::new();
    let lines: Vec<&str> = vtt_content.lines().collect();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i].trim();
        if line.contains("-->") {
            let arrow_parts: Vec<&str> = line.split("-->").collect();
            if arrow_parts.len() == 2 {
                let start_str = arrow_parts[0].split_whitespace().next().unwrap_or("");
                let end_str = arrow_parts[1].split_whitespace().next().unwrap_or("");
                if let (Some(start), Some(end)) =
                    (parse_vtt_timestamp(start_str), parse_vtt_timestamp(end_str))
                {
                    i += 1;
                    while i < lines.len() && lines[i].trim().is_empty() {
                        i += 1;
                    }
                    let mut cue_lines = Vec::new();
                    while i < lines.len()
                        && !lines[i].trim().is_empty()
                        && !lines[i].contains("-->")
                    {
                        cue_lines.push(lines[i].trim().to_string());
                        i += 1;
                    }
                    if !cue_lines.is_empty() {
                        cues.push((start, end, cue_lines));
                    }
                    continue;
                }
            }
        }
        i += 1;
    }

    if cues.is_empty() {
        return Vec::new();
    }

    let mut clean_segments: Vec<(f64, f64, String)> = Vec::new();
    for (start, end, tlines) in cues {
        if end - start < 0.05 {
            continue;
        }
        let c_lines: Vec<&String> = tlines
            .iter()
            .filter(|l| l.contains("<c>") || l.contains("</c>"))
            .collect();
        if !c_lines.is_empty() {
            for cl in c_lines {
                let cleaned = strip_vtt_tags(cl);
                if !cleaned.is_empty() {
                    clean_segments.push((start, end, cleaned));
                }
            }
        } else {
            let mut joined = String::new();
            for l in tlines {
                let cl = strip_vtt_tags(&l);
                if !cl.is_empty() {
                    if !joined.is_empty() {
                        joined.push(' ');
                    }
                    joined.push_str(&cl);
                }
            }
            if !joined.is_empty() {
                clean_segments.push((start, end, joined));
            }
        }
    }

    let mut deduped: Vec<(f64, f64, String)> = Vec::new();
    for (start, end, text) in clean_segments {
        if let Some(last) = deduped.last_mut() {
            if text == last.2 {
                last.1 = end;
                continue;
            }
            if last.2.ends_with(&text) {
                last.1 = end;
                continue;
            }
            if text.starts_with(&last.2) {
                let new_part = text[last.2.len()..].trim();
                if !new_part.is_empty() {
                    last.2.push(' ');
                    last.2.push_str(new_part);
                }
                last.1 = end;
                continue;
            }
        }
        deduped.push((start, end, text));
    }

    let mut sentence_units: Vec<(f64, f64, String)> = Vec::new();
    for (start, end, text) in deduped {
        let parts = split_segment_into_sentences(start, end, &text);
        sentence_units.extend(parts);
    }

    let mut paragraphs: Vec<SubtitleParagraph> = Vec::new();
    let mut cur_start = 0.0;
    let mut cur_end = 0.0;
    let mut cur_text = String::new();

    for (start, end, text) in sentence_units {
        if cur_text.is_empty() {
            cur_start = start;
            cur_end = end;
            cur_text = text;
        } else {
            let pause = start - cur_end;
            let is_sentence_end = text_ends_with_sentence(&cur_text);

            let should_break = if is_sentence_end {
                cur_text.len() >= 180 || pause >= 1.2
            } else if pause >= 3.0 {
                true
            } else {
                cur_text.len() >= 450 && pause >= 1.5
            };

            if should_break {
                paragraphs.push(SubtitleParagraph {
                    start: cur_start,
                    end: cur_end,
                    text: cur_text,
                });
                cur_start = start;
                cur_end = end;
                cur_text = text;
            } else {
                cur_text.push(' ');
                cur_text.push_str(&text);
                cur_end = end;
            }
        }
    }

    if !cur_text.is_empty() {
        paragraphs.push(SubtitleParagraph {
            start: cur_start,
            end: cur_end,
            text: cur_text,
        });
    }

    paragraphs
}

pub fn cancel_import(task_id: &str) {
    if let Ok(mut c) = get_cancelled_tasks().lock() {
        c.insert(task_id.to_string());
    }
    let pid_opt = {
        let mut tasks = get_running_tasks().lock().unwrap();
        tasks.remove(task_id)
    };
    if let Some(pid) = pid_opt {
        #[cfg(windows)]
        {
            let _ = Command::new("taskkill")
                .arg("/F")
                .arg("/T")
                .arg("/PID")
                .arg(pid.to_string())
                .output();
        }
        #[cfg(not(windows))]
        {
            unsafe {
                libc::kill(pid as i32, libc::SIGKILL);
            }
        }
    }
}

pub fn run_import_pipeline(
    app: AppHandle,
    db: DatabasePool,
    task_id: String,
    url: String,
    target_lang: String,
    user_id: String,
    cefr_level: Option<String>,
    prefetched_meta: Option<YoutubeMetadata>,
) {
    let app_clone = app.clone();
    let task_id_clone = task_id.clone();

    std::thread::spawn(move || {
        let notify = |phase: &str, percent: f64, speed: Option<f64>, msg: &str| {
            let evt = ImportProgressEvent {
                task_id: task_id_clone.clone(),
                phase: phase.to_string(),
                percent,
                speed_mb_s: speed,
                message: msg.to_string(),
            };
            if let Ok(mut reg) = get_import_progress_registry().lock() {
                reg.insert(task_id_clone.clone(), evt.clone());
            }
            let _ = app_clone.emit("youtube-import-progress", evt);
        };

        if is_task_cancelled(&task_id_clone) {
            notify("error", 0.0, None, "导入已取消");
            return;
        }

        notify("analyzing", 5.0, None, "正在解析视频元数据与字幕信息...");

        let ytdlp = resolve_ytdlp_path();
        let meta = match prefetched_meta {
            Some(m) => m,
            None => match fetch_youtube_metadata(&url, &target_lang) {
                Ok(m) => m,
                Err(e) => {
                    notify("error", 0.0, None, &format!("获取视频信息失败: {}", e));
                    return;
                }
            },
        };

        if is_task_cancelled(&task_id_clone) {
            notify("error", 0.0, None, "导入已取消");
            return;
        }

        if !meta.has_manual_subtitles && !meta.has_auto_captions {
            notify(
                "error",
                0.0,
                None,
                "该视频没有学习目标语言的字幕，无法导入。",
            );
            return;
        }

        let matched_lang = meta.subtitle_lang.as_deref().unwrap_or(&target_lang);

        // Prepare temporary directory
        let temp_dir = std::env::temp_dir().join(format!("amiga_yt_{}", task_id_clone));
        let _ = fs::create_dir_all(&temp_dir);

        // 1. Download subtitle
        notify("subtitles", 15.0, None, "正在下载字幕...");
        let mut sub_cmd = Command::new(&ytdlp);
        sub_cmd
            .arg("--skip-download")
            .arg("--sub-format")
            .arg("vtt")
            .arg("-o")
            .arg(temp_dir.join("sub.%(ext)s"))
            .arg("--no-playlist")
            .arg(&url)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if meta.has_manual_subtitles {
            sub_cmd
                .arg("--write-sub")
                .arg("--sub-lang")
                .arg(matched_lang);
        } else {
            sub_cmd
                .arg("--write-auto-sub")
                .arg("--sub-lang")
                .arg(matched_lang);
        }

        let mut sub_child = match sub_cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                notify("error", 0.0, None, &format!("启动字幕下载失败: {}", e));
                let _ = fs::remove_dir_all(&temp_dir);
                return;
            }
        };

        let sub_pid = sub_child.id();
        {
            let mut tasks = get_running_tasks().lock().unwrap();
            tasks.insert(task_id_clone.clone(), sub_pid);
        }

        let sub_stdout = sub_child.stdout.take();
        let sub_out_handle = std::thread::spawn(move || {
            if let Some(out) = sub_stdout {
                let reader = BufReader::new(out);
                for _ in reader.lines().map_while(Result::ok) {}
            }
        });

        let sub_stderr = sub_child.stderr.take();
        let sub_err_handle = std::thread::spawn(move || {
            let mut err_msg = String::new();
            if let Some(err) = sub_stderr {
                let reader = BufReader::new(err);
                for line in reader.lines().map_while(Result::ok) {
                    if !err_msg.is_empty() {
                        err_msg.push('\n');
                    }
                    err_msg.push_str(&line);
                }
            }
            err_msg
        });

        let sub_res = sub_child.wait();
        let _ = sub_out_handle.join();
        let sub_err_output = sub_err_handle.join().unwrap_or_default();

        // Clear sub task pid
        {
            let mut tasks = get_running_tasks().lock().unwrap();
            tasks.remove(&task_id_clone);
        }

        if is_task_cancelled(&task_id_clone) {
            notify("error", 0.0, None, "导入已取消");
            let _ = fs::remove_dir_all(&temp_dir);
            return;
        }

        if sub_res.is_err() || !sub_res.unwrap().success() {
            let detail = if sub_err_output.trim().is_empty() {
                "下载字幕失败或任务已被取消。".to_string()
            } else {
                format!("下载字幕失败: {}", sub_err_output.trim())
            };
            notify("error", 0.0, None, &detail);
            let _ = fs::remove_dir_all(&temp_dir);
            return;
        }

        // Find downloaded VTT file
        let mut vtt_file = None;
        if let Ok(entries) = fs::read_dir(&temp_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().map(|e| e == "vtt").unwrap_or(false) {
                    vtt_file = Some(p);
                    break;
                }
            }
        }

        let Some(vtt_path) = vtt_file else {
            notify("error", 0.0, None, "未能生成字幕文件。");
            let _ = fs::remove_dir_all(&temp_dir);
            return;
        };

        let vtt_content = match fs::read_to_string(&vtt_path) {
            Ok(s) => s,
            Err(e) => {
                notify("error", 0.0, None, &format!("读取字幕失败: {}", e));
                let _ = fs::remove_dir_all(&temp_dir);
                return;
            }
        };

        let paragraphs = clean_and_parse_vtt(&vtt_content);
        if paragraphs.is_empty() {
            notify("error", 0.0, None, "字幕内容为空或无法识别有效段落。");
            let _ = fs::remove_dir_all(&temp_dir);
            return;
        }

        // 2. Download audio
        notify("audio", 30.0, None, "开始下载音频...");

        // Determine destination audio path
        let mut audio_dir = dirs::data_local_dir().unwrap_or_else(std::env::temp_dir);
        audio_dir.push("idioma");
        audio_dir.push("audio");
        let _ = fs::create_dir_all(&audio_dir);
        let audio_dest = audio_dir.join(format!("yt_{}_{}.m4a", meta.video_id, task_id_clone));

        let mut audio_cmd = Command::new(&ytdlp);
        audio_cmd
            .arg("-f")
            .arg("bestaudio[ext=m4a]/bestaudio/best")
            .arg("-o")
            .arg(&audio_dest)
            .arg("--newline")
            .arg("--no-playlist")
            .arg(&url)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut audio_child = match audio_cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                notify("error", 0.0, None, &format!("启动音频下载失败: {}", e));
                let _ = fs::remove_dir_all(&temp_dir);
                return;
            }
        };

        let audio_pid = audio_child.id();
        {
            let mut tasks = get_running_tasks().lock().unwrap();
            tasks.insert(task_id_clone.clone(), audio_pid);
        }

        let stdout = audio_child.stdout.take();
        let stderr = audio_child.stderr.take();

        // Drain stderr concurrently to prevent pipe buffer deadlock
        let stderr_handle = std::thread::spawn(move || {
            let mut err_msg = String::new();
            if let Some(err) = stderr {
                let reader = BufReader::new(err);
                for line in reader.lines().map_while(Result::ok) {
                    if !err_msg.is_empty() {
                        err_msg.push('\n');
                    }
                    err_msg.push_str(&line);
                }
            }
            err_msg
        });

        // Read progress from stdout
        if let Some(out) = stdout {
            let reader = BufReader::new(out);
            for line in reader.lines().map_while(Result::ok) {
                if line.contains("[download]") && line.contains('%') {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    for &part in &parts {
                        if part.ends_with('%') {
                            if let Ok(pct) = part.trim_end_matches('%').parse::<f64>() {
                                // map download percent (0-100) to overall percent (30-90)
                                let mapped = 30.0 + (pct * 0.60);
                                let mut speed = None;
                                if let Some(at_idx) = parts.iter().position(|&p| p == "at") {
                                    if let Some(spd_str) = parts.get(at_idx + 1) {
                                        if spd_str.ends_with("MiB/s") {
                                            speed = spd_str
                                                .trim_end_matches("MiB/s")
                                                .parse::<f64>()
                                                .ok();
                                        }
                                    }
                                }
                                notify(
                                    "audio",
                                    mapped,
                                    speed,
                                    &format!("正在下载音频: {:.1}%", pct),
                                );
                            }
                        }
                    }
                }
            }
        }

        let audio_res = audio_child.wait();

        // Remove from running tasks map
        {
            let mut tasks = get_running_tasks().lock().unwrap();
            tasks.remove(&task_id_clone);
        }

        let audio_err_output = stderr_handle.join().unwrap_or_default();

        if is_task_cancelled(&task_id_clone) {
            notify("error", 0.0, None, "导入已取消");
            let _ = fs::remove_file(&audio_dest);
            let _ = fs::remove_dir_all(&temp_dir);
            return;
        }

        if audio_res.is_err() || !audio_res.unwrap().success() || !audio_dest.exists() {
            let detail = if audio_err_output.trim().is_empty() {
                "音频下载失败或已被取消。".to_string()
            } else {
                format!("音频下载失败: {}", audio_err_output.trim())
            };
            notify("error", 0.0, None, &detail);
            let _ = fs::remove_file(&audio_dest);
            let _ = fs::remove_dir_all(&temp_dir);
            return;
        }

        // Clean cancelled set
        if let Ok(mut c) = get_cancelled_tasks().lock() {
            c.remove(&task_id_clone);
        }

        // 3. Save article
        notify("saving", 92.0, None, "正在保存文章与音频信息...");

        let subtitles_json =
            serde_json::to_string(&paragraphs).unwrap_or_else(|_| "[]".to_string());
        let audio_path_str = audio_dest.to_string_lossy().to_string();

        let save_res = reading_mod::save_imported_article(
            &db,
            &user_id,
            &target_lang,
            "youtube",
            &url,
            &meta.video_id,
            &meta.title,
            meta.channel.as_deref(),
            meta.duration_sec,
            Some(&audio_path_str),
            &subtitles_json,
            cefr_level.as_deref(),
        );

        let _ = fs::remove_dir_all(&temp_dir);

        match save_res {
            Ok(aid) => {
                log::info!("Successfully imported YouTube video article: {}", aid);
                notify("completed", 100.0, None, "导入完成！");
            }
            Err(e) => {
                notify("error", 0.0, None, &format!("保存文章记录失败: {}", e));
                let _ = fs::remove_file(&audio_dest);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_video_id() {
        assert_eq!(
            extract_video_id("https://www.youtube.com/watch?v=mmXMGqAO82o"),
            Some("mmXMGqAO82o".to_string())
        );
        assert_eq!(
            extract_video_id("https://youtu.be/mmXMGqAO82o?t=10"),
            Some("mmXMGqAO82o".to_string())
        );
    }

    #[test]
    fn test_clean_and_parse_vtt() {
        let vtt = r#"WEBVTT
Kind: captions
Language: es

00:00:01.000 --> 00:00:03.000
Hola mundo.<00:00:02.000><c> Bienvenidos.</c>

00:00:03.500 --> 00:00:05.500
Este es un test.
"#;
        let paragraphs = clean_and_parse_vtt(vtt);
        assert_eq!(paragraphs.len(), 1);
        assert!(paragraphs[0].text.contains("Hola mundo"));
        assert!(paragraphs[0].text.contains("Bienvenidos"));
    }

    #[test]
    fn test_clean_and_parse_vtt_rolling_captions() {
        let vtt = r#"WEBVTT
Kind: captions
Language: es

00:00:00.120 --> 00:00:01.990 align:start position:0%
Este<00:00:00.320><c> es</c><00:00:00.440><c> probablemente</c><00:00:01.000><c> uno</c><00:00:01.199><c> de</c><00:00:01.360><c> los</c><00:00:01.560><c> peores</c>

00:00:01.990 --> 00:00:02.000 align:start position:0%
Este es probablemente uno de los peores

00:00:02.000 --> 00:00:03.669 align:start position:0%
Este es probablemente uno de los peores
hoteles<00:00:02.399><c> en</c><00:00:02.600><c> los</c><00:00:02.720><c> que</c><00:00:02.840><c> he</c><00:00:03.040><c> dormido</c><00:00:03.399><c> en</c><00:00:03.560><c> mi</c>

00:00:03.669 --> 00:00:03.679 align:start position:0%
hoteles en los que he dormido en mi

00:00:03.679 --> 00:00:05.470 align:start position:0%
hoteles en los que he dormido en mi
vida,<00:00:04.000><c> o</c><00:00:04.200><c> más</c><00:00:04.359><c> bien</c><00:00:04.560><c> debería</c><00:00:05.000><c> decir</c><00:00:05.240><c> en</c><00:00:05.359><c> los</c>
"#;
        let paragraphs = clean_and_parse_vtt(vtt);
        assert_eq!(paragraphs.len(), 1);
        // Verify no duplicate repeats
        let text = &paragraphs[0].text;
        assert_eq!(text.matches("Este es probablemente").count(), 1);
        assert_eq!(text.matches("hoteles en los que").count(), 1);
    }
}
