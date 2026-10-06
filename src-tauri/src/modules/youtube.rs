use crate::modules::database::DatabasePool;
use crate::modules::reading as reading_mod;
use futures_util::StreamExt;
use log;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

#[cfg(not(target_os = "android"))]
use std::io::{BufRead, BufReader};
#[cfg(not(target_os = "android"))]
use std::process::{Command, Stdio};

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

pub fn resolve_audio_dir() -> PathBuf {
    #[cfg(target_os = "android")]
    {
        crate::modules::android_paths::app_files_dir()
            .join("idioma")
            .join("audio")
    }
    #[cfg(not(target_os = "android"))]
    {
        dirs::data_local_dir()
            .unwrap_or_else(std::env::temp_dir)
            .join("idioma")
            .join("audio")
    }
}

/// Locate yt-dlp executable if available (not available on Android)
#[allow(dead_code)]
pub fn resolve_ytdlp_path() -> Option<PathBuf> {
    #[cfg(target_os = "android")]
    {
        None
    }
    #[cfg(not(target_os = "android"))]
    {
        // 1. Check local app bin directory (%LOCALAPPDATA%/idioma/bin/yt-dlp.exe)
        if let Some(mut local_data) = dirs::data_local_dir() {
            local_data.push("idioma");
            local_data.push("bin");
            #[cfg(windows)]
            let exe = local_data.join("yt-dlp.exe");
            #[cfg(not(windows))]
            let exe = local_data.join("yt-dlp");
            if exe.exists() {
                return Some(exe);
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
                            return Some(p);
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
                            return Some(p);
                        }
                    }
                }
            }
        }

        // 3. Check PATH
        if let Ok(out) = std::process::Command::new("yt-dlp").arg("--version").output() {
            if out.status.success() {
                return Some(PathBuf::from("yt-dlp"));
            }
        }

        None
    }
}

pub fn update_ytdlp() -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        Err("移动端使用内置原生解析器，无需安装或更新外部组件。".to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let Some(ytdlp) = resolve_ytdlp_path() else {
            return Err("未找到本地 yt-dlp 组件。应用已支持内置原生下载，无需额外安装。".to_string());
        };
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

struct YoutubeSession {
    cookies: String,
    player_response: Option<serde_json::Value>,
}

fn extract_visitor_id(html: &str) -> Option<String> {
    let needle = "\"VISITOR_DATA\":\"";
    if let Some(pos) = html.find(needle) {
        let rest = &html[pos + needle.len()..];
        if let Some(end) = rest.find('"') {
            return Some(rest[..end].to_string());
        }
    }
    None
}

fn extract_initial_player_response(html: &str) -> Option<serde_json::Value> {
    let needle = "ytInitialPlayerResponse = ";
    if let Some(pos) = html.find(needle) {
        let rest = &html[pos + needle.len()..];
        let end_candidates = [";</script>", ";var ", ";window", ";const "];
        for end_pat in end_candidates {
            if let Some(end) = rest.find(end_pat) {
                let json_str = rest[..end].trim();
                if let Ok(v) = serde_json::from_str(json_str) {
                    return Some(v);
                }
            }
        }
    }
    None
}

async fn fetch_youtube_session(
    client: &reqwest::Client,
    video_id: &str,
    target_lang: &str,
) -> Result<YoutubeSession, String> {
    let watch_url = format!("https://www.youtube.com/watch?v={}", video_id);
    let watch_resp = client
        .get(&watch_url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        )
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
        .map_err(|e| format!("请求视频页面失败: {}", e))?;

    let mut cookies = String::new();
    for val in watch_resp.headers().get_all(reqwest::header::SET_COOKIE) {
        if let Ok(s) = val.to_str() {
            if let Some(cookie_pair) = s.split(';').next() {
                if !cookies.is_empty() {
                    cookies.push_str("; ");
                }
                cookies.push_str(cookie_pair.trim());
            }
        }
    }

    let html = watch_resp.text().await.unwrap_or_default();
    let visitor_id = extract_visitor_id(&html);
    let html_player_response = extract_initial_player_response(&html);

    let mut player_req = client
        .post("https://www.youtube.com/youtubei/v1/player?prettyPrint=false")
        .header("Content-Type", "application/json")
        .header(
            "User-Agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
        )
        .header("X-Youtube-Client-Name", "101")
        .header("X-Youtube-Client-Version", "1.02")
        .header("Origin", "https://www.youtube.com");

    if let Some(ref vid) = visitor_id {
        player_req = player_req.header("X-Goog-Visitor-Id", vid);
    }
    if !cookies.is_empty() {
        player_req = player_req.header("Cookie", &cookies);
    }

    let body_json = serde_json::json!({
        "context": {
            "client": {
                "clientName": "VISIONOS",
                "clientVersion": "1.02",
                "deviceMake": "Apple",
                "deviceModel": "RealityDevice17,1",
                "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
                "osName": "visionOS",
                "osVersion": "26.5.23O471",
                "hl": target_lang,
                "timeZone": "UTC",
                "utcOffsetMinutes": 0
            }
        },
        "videoId": video_id,
        "playbackContext": {
            "contentPlaybackContext": {
                "html5Preference": "HTML5_PREF_WANTS",
                "signatureTimestamp": 20728
            }
        },
        "contentCheckOk": true,
        "racyCheckOk": true
    });

    let player_json = match player_req.json(&body_json).send().await {
        Ok(resp) => resp.json::<serde_json::Value>().await.ok(),
        Err(_) => None,
    };

    let chosen_response = match player_json {
        Some(json)
            if json.pointer("/playabilityStatus/status").and_then(|v| v.as_str()) == Some("OK") =>
        {
            Some(json)
        }
        _ => html_player_response.or(player_json),
    };

    Ok(YoutubeSession {
        cookies,
        player_response: chosen_response,
    })
}

fn parse_metadata_from_player_json(
    url: &str,
    video_id: &str,
    player_json: &serde_json::Value,
    target_lang: &str,
) -> Result<YoutubeMetadata, String> {
    let title = player_json
        .pointer("/videoDetails/title")
        .and_then(|v| v.as_str())
        .unwrap_or("Untitled")
        .to_string();

    let channel = player_json
        .pointer("/videoDetails/author")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let duration_sec = player_json
        .pointer("/videoDetails/lengthSeconds")
        .and_then(|v| {
            v.as_str()
                .and_then(|s| s.parse::<i64>().ok())
                .or_else(|| v.as_i64())
        });

    let approx_mb = duration_sec.map(|sec| (sec as f64 * 8.0) / 1024.0);

    let norm_lang = target_lang.to_lowercase();
    let lang_prefix = norm_lang.split('-').next().unwrap_or(&norm_lang);

    let mut has_manual = false;
    let mut has_auto = false;
    let mut matched_lang = None;

    if let Some(tracks) = player_json
        .pointer("/captions/playerCaptionsTracklistRenderer/captionTracks")
        .and_then(|v| v.as_array())
    {
        for track in tracks {
            let code = track
                .get("languageCode")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let kind = track.get("kind").and_then(|v| v.as_str());
            let code_lower = code.to_lowercase();
            let matches_lang = code_lower == norm_lang || code_lower.starts_with(lang_prefix);

            if matches_lang {
                if kind == Some("asr") {
                    if !has_manual {
                        has_auto = true;
                        matched_lang = Some(code.to_string());
                    }
                } else {
                    has_manual = true;
                    matched_lang = Some(code.to_string());
                    break;
                }
            }
        }
    }

    Ok(YoutubeMetadata {
        url: url.to_string(),
        video_id: video_id.to_string(),
        title,
        channel,
        duration_sec,
        filesize_approx_mb: approx_mb,
        has_manual_subtitles: has_manual,
        has_auto_captions: has_auto,
        subtitle_lang: matched_lang,
    })
}

fn find_subtitle_url(player_json: &serde_json::Value, target_lang: &str) -> Option<String> {
    let norm_lang = target_lang.to_lowercase();
    let lang_prefix = norm_lang.split('-').next().unwrap_or(&norm_lang);

    let tracks = player_json
        .pointer("/captions/playerCaptionsTracklistRenderer/captionTracks")
        .and_then(|v| v.as_array())?;

    let mut manual_url = None;
    let mut auto_url = None;

    for track in tracks {
        let code = track
            .get("languageCode")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let base_url = track.get("baseUrl").and_then(|v| v.as_str())?;
        let kind = track.get("kind").and_then(|v| v.as_str());
        let code_lower = code.to_lowercase();
        let matches_lang = code_lower == norm_lang || code_lower.starts_with(lang_prefix);

        if matches_lang {
            if kind == Some("asr") {
                if auto_url.is_none() {
                    auto_url = Some(base_url.to_string());
                }
            } else {
                manual_url = Some(base_url.to_string());
                break;
            }
        }
    }

    manual_url.or(auto_url)
}

async fn download_subtitle_direct(
    client: &reqwest::Client,
    base_url: &str,
    cookies: &str,
) -> Result<String, String> {
    let sub_url = if base_url.contains("fmt=") {
        base_url.to_string()
    } else {
        format!("{}&fmt=vtt", base_url)
    };

    let mut req = client.get(&sub_url).header(
        "User-Agent",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    );
    if !cookies.is_empty() {
        req = req.header("Cookie", cookies);
    }

    let resp = req.send().await.map_err(|e| format!("请求字幕失败: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("字幕请求返回状态码: {}", resp.status()));
    }

    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取字幕内容失败: {}", e))?;

    if text.trim().is_empty() {
        return Err("获取到的字幕内容为空".to_string());
    }

    Ok(text)
}

fn find_audio_format(player_json: &serde_json::Value) -> Option<(String, Option<u64>)> {
    let formats = player_json
        .pointer("/streamingData/adaptiveFormats")
        .and_then(|v| v.as_array())?;

    let mut candidates: Vec<(&serde_json::Value, i64, bool)> = Vec::new();

    for f in formats {
        let mime = f.get("mimeType").and_then(|v| v.as_str()).unwrap_or("");
        let url = f.get("url").and_then(|v| v.as_str());
        if !mime.starts_with("audio/") || url.is_none() {
            continue;
        }
        let bitrate = f.get("bitrate").and_then(|v| v.as_i64()).unwrap_or(0);
        let is_m4a = mime.contains("mp4a") || mime.contains("audio/mp4");
        candidates.push((f, bitrate, is_m4a));
    }

    candidates.sort_by(|a, b| match b.2.cmp(&a.2) {
        std::cmp::Ordering::Equal => b.1.cmp(&a.1),
        other => other,
    });

    if let Some(&(f, _, _)) = candidates.first() {
        let url = f.get("url").and_then(|v| v.as_str())?.to_string();
        let content_length = f
            .get("contentLength")
            .and_then(|v| v.as_str().and_then(|s| s.parse::<u64>().ok()));
        Some((url, content_length))
    } else {
        None
    }
}

async fn download_audio_direct<F>(
    client: &reqwest::Client,
    audio_url: &str,
    cookies: &str,
    dest_path: &PathBuf,
    approx_size: Option<u64>,
    task_id: &str,
    mut progress_fn: F,
) -> Result<(), String>
where
    F: FnMut(f64, Option<f64>, &str),
{
    let mut req = client.get(audio_url).header(
        "User-Agent",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
    );
    if !cookies.is_empty() {
        req = req.header("Cookie", cookies);
    }

    let resp = req.send().await.map_err(|e| format!("连接音频流失败: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("音频流请求失败，状态码: {}", resp.status()));
    }

    let total_bytes = resp
        .content_length()
        .or(approx_size)
        .unwrap_or(10_000_000);

    let mut file = std::fs::File::create(dest_path)
        .map_err(|e| format!("创建音频本地文件失败: {}", e))?;

    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;
    let start_time = std::time::Instant::now();
    let mut last_notify = std::time::Instant::now();

    while let Some(chunk_res) = stream.next().await {
        if is_task_cancelled(task_id) {
            let _ = std::fs::remove_file(dest_path);
            return Err("导入已取消".to_string());
        }

        let chunk = chunk_res.map_err(|e| format!("下载音频数据错误: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("写入音频数据失败: {}", e))?;
        downloaded += chunk.len() as u64;

        if last_notify.elapsed() >= std::time::Duration::from_millis(350) {
            let pct = ((downloaded as f64 / total_bytes as f64) * 100.0).min(100.0);
            let mapped = 30.0 + (pct * 0.60);
            let elapsed_secs = start_time.elapsed().as_secs_f64();
            let speed = if elapsed_secs > 0.1 {
                Some((downloaded as f64 / 1024.0 / 1024.0) / elapsed_secs)
            } else {
                None
            };
            progress_fn(mapped, speed, &format!("正在下载音频: {:.1}%", pct));
            last_notify = std::time::Instant::now();
        }
    }

    file.flush()
        .map_err(|e| format!("刷新音频文件写入失败: {}", e))?;

    Ok(())
}

#[cfg(not(target_os = "android"))]
fn fetch_youtube_metadata_ytdlp(
    ytdlp: &std::path::Path,
    url: &str,
    target_lang: &str,
) -> Result<YoutubeMetadata, String> {
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

/// Fetch metadata and check subtitle availability for target language
pub async fn fetch_youtube_metadata(url: &str, target_lang: &str) -> Result<YoutubeMetadata, String> {
    let video_id = extract_video_id(url).ok_or_else(|| "无法从输入中解析出有效的 YouTube 视频 ID".to_string())?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("创建网络客户端失败: {}", e))?;

    match fetch_youtube_session(&client, &video_id, target_lang).await {
        Ok(session) => {
            if let Some(ref pjson) = session.player_response {
                if let Ok(meta) = parse_metadata_from_player_json(url, &video_id, pjson, target_lang) {
                    return Ok(meta);
                }
            }
        }
        Err(e) => {
            log::warn!("Direct YouTube session fetch failed: {}", e);
        }
    }

    #[cfg(not(target_os = "android"))]
    if let Some(ytdlp) = resolve_ytdlp_path() {
        return fetch_youtube_metadata_ytdlp(&ytdlp, url, target_lang);
    }

    Err("获取 YouTube 视频元数据失败，请检查网络或链接是否有效。".to_string())
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
        #[cfg(all(unix, not(target_os = "android")))]
        {
            unsafe {
                libc::kill(pid as i32, libc::SIGKILL);
            }
        }
        #[cfg(target_os = "android")]
        {
            let _ = pid;
        }
    }
}

#[cfg(not(target_os = "android"))]
fn download_subtitle_ytdlp(
    ytdlp: &std::path::Path,
    url: &str,
    matched_lang: &str,
    temp_dir: &std::path::Path,
    task_id: &str,
) -> Option<String> {
    let mut sub_cmd = Command::new(ytdlp);
    sub_cmd
        .arg("--skip-download")
        .arg("--sub-format")
        .arg("vtt")
        .arg("-o")
        .arg(temp_dir.join("sub.%(ext)s"))
        .arg("--no-playlist")
        .arg(url)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .arg("--write-auto-sub")
        .arg("--sub-lang")
        .arg(matched_lang);

    let mut sub_child = sub_cmd.spawn().ok()?;
    let sub_pid = sub_child.id();
    if let Ok(mut tasks) = get_running_tasks().lock() {
        tasks.insert(task_id.to_string(), sub_pid);
    }
    let _ = sub_child.wait();
    if let Ok(mut tasks) = get_running_tasks().lock() {
        tasks.remove(task_id);
    }

    if let Ok(entries) = fs::read_dir(temp_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.extension().map(|e| e == "vtt").unwrap_or(false) {
                return fs::read_to_string(&p).ok();
            }
        }
    }
    None
}

#[cfg(not(target_os = "android"))]
fn download_audio_ytdlp<F>(
    ytdlp: &std::path::Path,
    url: &str,
    dest_path: &std::path::Path,
    task_id: &str,
    mut progress_fn: F,
) -> bool
where
    F: FnMut(f64, Option<f64>, &str),
{
    let mut audio_cmd = Command::new(ytdlp);
    audio_cmd
        .arg("-f")
        .arg("bestaudio[ext=m4a]/bestaudio/best")
        .arg("-o")
        .arg(dest_path)
        .arg("--newline")
        .arg("--no-playlist")
        .arg(url)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut audio_child = match audio_cmd.spawn() {
        Ok(c) => c,
        Err(_) => return false,
    };

    let audio_pid = audio_child.id();
    if let Ok(mut tasks) = get_running_tasks().lock() {
        tasks.insert(task_id.to_string(), audio_pid);
    }

    let stdout = audio_child.stdout.take();
    if let Some(out) = stdout {
        let reader = BufReader::new(out);
        for line in reader.lines().map_while(Result::ok) {
            if line.contains("[download]") && line.contains('%') {
                let parts: Vec<&str> = line.split_whitespace().collect();
                for &part in &parts {
                    if part.ends_with('%') {
                        if let Ok(pct) = part.trim_end_matches('%').parse::<f64>() {
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
                            progress_fn(mapped, speed, &format!("正在下载音频: {:.1}%", pct));
                        }
                    }
                }
            }
        }
    }

    let audio_res = audio_child.wait();
    if let Ok(mut tasks) = get_running_tasks().lock() {
        tasks.remove(task_id);
    }

    audio_res.map(|s| s.success()).unwrap_or(false) && dest_path.exists()
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

    tauri::async_runtime::spawn(async move {
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

        let client = match reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                notify("error", 0.0, None, &format!("创建网络客户端失败: {}", e));
                return;
            }
        };

        let video_id = match extract_video_id(&url) {
            Some(vid) => vid,
            None => {
                notify("error", 0.0, None, "无法识别视频 ID");
                return;
            }
        };

        let session_res = fetch_youtube_session(&client, &video_id, &target_lang).await;
        let session = session_res.ok();

        let meta = match prefetched_meta {
            Some(m) => m,
            None => {
                let from_session = session
                    .as_ref()
                    .and_then(|s| s.player_response.as_ref())
                    .and_then(|pj| parse_metadata_from_player_json(&url, &video_id, pj, &target_lang).ok());

                match from_session {
                    Some(m) => m,
                    None => {
                        #[cfg(not(target_os = "android"))]
                        {
                            if let Some(ytdlp) = resolve_ytdlp_path() {
                                match fetch_youtube_metadata_ytdlp(&ytdlp, &url, &target_lang) {
                                    Ok(m) => m,
                                    Err(e) => {
                                        notify("error", 0.0, None, &format!("获取视频信息失败: {}", e));
                                        return;
                                    }
                                }
                            } else {
                                notify("error", 0.0, None, "获取视频信息失败，请检查网络");
                                return;
                            }
                        }
                        #[cfg(target_os = "android")]
                        {
                            notify("error", 0.0, None, "获取视频信息失败，请检查网络连接");
                            return;
                        }
                    }
                }
            }
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
        let temp_dir = resolve_audio_dir().join("temp").join(&task_id_clone);
        let _ = fs::create_dir_all(&temp_dir);

        // 1. Download subtitle
        notify("subtitles", 15.0, None, "正在下载字幕...");

        let mut vtt_content = None;
        let cookies_ref = session.as_ref().map(|s| s.cookies.as_str()).unwrap_or("");

        if let Some(ref s) = session {
            if let Some(ref pj) = s.player_response {
                if let Some(sub_url) = find_subtitle_url(pj, matched_lang) {
                    if let Ok(text) = download_subtitle_direct(&client, &sub_url, cookies_ref).await {
                        vtt_content = Some(text);
                    }
                }
            }
        }

        #[cfg(not(target_os = "android"))]
        if vtt_content.is_none() {
            if let Some(ytdlp) = resolve_ytdlp_path() {
                vtt_content = download_subtitle_ytdlp(&ytdlp, &url, matched_lang, &temp_dir, &task_id_clone);
            }
        }

        if is_task_cancelled(&task_id_clone) {
            notify("error", 0.0, None, "导入已取消");
            let _ = fs::remove_dir_all(&temp_dir);
            return;
        }

        let Some(vtt_text) = vtt_content else {
            notify("error", 0.0, None, "未能生成字幕文件。");
            let _ = fs::remove_dir_all(&temp_dir);
            return;
        };

        let paragraphs = clean_and_parse_vtt(&vtt_text);
        if paragraphs.is_empty() {
            notify("error", 0.0, None, "字幕内容为空或无法识别有效段落。");
            let _ = fs::remove_dir_all(&temp_dir);
            return;
        }

        // 2. Download audio
        notify("audio", 30.0, None, "开始下载音频...");

        // Determine destination audio path
        let audio_dir = resolve_audio_dir();
        let _ = fs::create_dir_all(&audio_dir);
        let audio_dest = audio_dir.join(format!("yt_{}_{}.m4a", meta.video_id, task_id_clone));

        let mut audio_downloaded = false;

        // Try direct stream download
        if let Some(ref s) = session {
            if let Some(ref pj) = s.player_response {
                if let Some((audio_url, approx_size)) = find_audio_format(pj) {
                    let direct_res = download_audio_direct(
                        &client,
                        &audio_url,
                        cookies_ref,
                        &audio_dest,
                        approx_size,
                        &task_id_clone,
                        |mapped, speed, msg| {
                            notify("audio", mapped, speed, msg);
                        },
                    )
                    .await;

                    if direct_res.is_ok()
                        && audio_dest.exists()
                        && fs::metadata(&audio_dest).map(|m| m.len() > 1024).unwrap_or(false)
                    {
                        audio_downloaded = true;
                    } else if let Err(e) = direct_res {
                        log::warn!("Direct audio download error: {}", e);
                    }
                }
            }
        }

        #[cfg(not(target_os = "android"))]
        if !audio_downloaded && !is_task_cancelled(&task_id_clone) {
            if let Some(ytdlp) = resolve_ytdlp_path() {
                audio_downloaded = download_audio_ytdlp(&ytdlp, &url, &audio_dest, &task_id_clone, |mapped, speed, msg| {
                    notify("audio", mapped, speed, msg);
                });
            }
        }

        if is_task_cancelled(&task_id_clone) {
            notify("error", 0.0, None, "导入已取消");
            let _ = fs::remove_file(&audio_dest);
            let _ = fs::remove_dir_all(&temp_dir);
            return;
        }

        if !audio_downloaded || !audio_dest.exists() {
            notify("error", 0.0, None, "音频下载失败，请检查网络后重试。");
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

    #[tokio::test]
    async fn test_fetch_youtube_metadata_network() {
        let res = fetch_youtube_metadata("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "en").await;
        if let Ok(meta) = res {
            assert_eq!(meta.video_id, "dQw4w9WgXcQ");
            assert!(!meta.title.is_empty());
            assert!(meta.has_manual_subtitles || meta.has_auto_captions);
        }
    }
}
