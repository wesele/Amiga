use crate::modules::database::DatabasePool;
use crate::modules::reading as reading_mod;
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
            .take_while(|c| *c != '&' && *c != '#' && *c != '?' && *c != '/')
            .collect();
        if !id.is_empty() {
            return Some(id);
        }
    }
    if let Some(pos) = trimmed.find("youtu.be/") {
        let rest = &trimmed[pos + 9..];
        let id: String = rest
            .chars()
            .take_while(|c| *c != '&' && *c != '#' && *c != '?' && *c != '/')
            .collect();
        if !id.is_empty() {
            return Some(id);
        }
    }
    if let Some(pos) = trimmed.find("youtube.com/shorts/") {
        let rest = &trimmed[pos + 19..];
        let id: String = rest
            .chars()
            .take_while(|c| *c != '&' && *c != '#' && *c != '?' && *c != '/')
            .collect();
        if !id.is_empty() {
            return Some(id);
        }
    }
    if let Some(pos) = trimmed.find("youtube.com/live/") {
        let rest = &trimmed[pos + 17..];
        let id: String = rest
            .chars()
            .take_while(|c| *c != '&' && *c != '#' && *c != '?' && *c != '/')
            .collect();
        if !id.is_empty() {
            return Some(id);
        }
    }
    if let Some(pos) = trimmed.find("youtube.com/embed/") {
        let rest = &trimmed[pos + 18..];
        let id: String = rest
            .chars()
            .take_while(|c| *c != '&' && *c != '#' && *c != '?' && *c != '/')
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

    let mut chosen_response = match player_json {
        Some(json)
            if json.pointer("/playabilityStatus/status").and_then(|v| v.as_str()) == Some("OK") =>
        {
            Some(json)
        }
        _ => html_player_response.clone().or(player_json),
    };

    if let (Some(ref mut chosen), Some(ref html_pj)) = (&mut chosen_response, &html_player_response) {
        let has_captions = chosen
            .pointer("/captions/playerCaptionsTracklistRenderer/captionTracks")
            .and_then(|v| v.as_array())
            .map(|a| !a.is_empty())
            .unwrap_or(false);
        if !has_captions {
            if let Some(captions) = html_pj.get("captions") {
                chosen["captions"] = captions.clone();
            }
        }
    }

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

    let mut req = client
        .get(&sub_url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        )
        .timeout(std::time::Duration::from_secs(20));
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
    let mut file = std::fs::File::create(dest_path)
        .map_err(|e| format!("创建音频本地文件失败: {}", e))?;

    let chunk_size: u64 = 2 * 1024 * 1024;
    let mut start: u64 = 0;
    let mut total_bytes: Option<u64> = approx_size;
    let mut downloaded: u64 = 0;
    let start_time = std::time::Instant::now();
    let mut last_notify = std::time::Instant::now();

    loop {
        if is_task_cancelled(task_id) {
            let _ = std::fs::remove_file(dest_path);
            return Err("导入已取消".to_string());
        }

        let range_val = match total_bytes {
            Some(total) => {
                let end = (start + chunk_size - 1).min(total.saturating_sub(1));
                format!("bytes={}-{}", start, end)
            }
            None => {
                format!("bytes={}-{}", start, start + chunk_size - 1)
            }
        };

        let mut retries = 0;
        let max_retries = 3;
        let mut chunk_res = None;

        while retries <= max_retries {
            if is_task_cancelled(task_id) {
                let _ = std::fs::remove_file(dest_path);
                return Err("导入已取消".to_string());
            }

            let mut req = client
                .get(audio_url)
                .header(
                    "User-Agent",
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
                )
                .header("Range", &range_val)
                .timeout(std::time::Duration::from_secs(30));

            if !cookies.is_empty() {
                req = req.header("Cookie", cookies);
            }

            match req.send().await {
                Ok(resp) => {
                    let status = resp.status();
                    if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
                        chunk_res = Some((status, Vec::new()));
                        break;
                    }

                    if !status.is_success() && status != reqwest::StatusCode::PARTIAL_CONTENT {
                        retries += 1;
                        if retries > max_retries {
                            let _ = std::fs::remove_file(dest_path);
                            return Err(format!("音频流请求失败，状态码: {}", status));
                        }
                        tokio::time::sleep(std::time::Duration::from_millis(500 * retries as u64)).await;
                        continue;
                    }

                    if total_bytes.is_none() {
                        if let Some(cr_val) = resp.headers().get(reqwest::header::CONTENT_RANGE) {
                            if let Ok(cr_str) = cr_val.to_str() {
                                if let Some(total_str) = cr_str.split('/').nth(1) {
                                    if let Ok(tot) = total_str.trim().parse::<u64>() {
                                        total_bytes = Some(tot);
                                    }
                                }
                            }
                        }
                    }

                    match resp.bytes().await {
                        Ok(bytes) => {
                            chunk_res = Some((status, bytes.to_vec()));
                            break;
                        }
                        Err(e) => {
                            retries += 1;
                            if retries > max_retries {
                                let _ = std::fs::remove_file(dest_path);
                                return Err(format!("下载音频数据错误: {}", e));
                            }
                            tokio::time::sleep(std::time::Duration::from_millis(500 * retries as u64)).await;
                        }
                    }
                }
                Err(e) => {
                    retries += 1;
                    if retries > max_retries {
                        let _ = std::fs::remove_file(dest_path);
                        return Err(format!("连接音频流失败: {}", e));
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(500 * retries as u64)).await;
                }
            }
        }

        let (status, chunk) = match chunk_res {
            Some(res) => res,
            None => {
                let _ = std::fs::remove_file(dest_path);
                return Err("获取音频分块数据失败，重试已耗尽".to_string());
            }
        };

        if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
            break;
        }

        if chunk.is_empty() {
            if let Some(tot) = total_bytes {
                if downloaded < tot {
                    let _ = std::fs::remove_file(dest_path);
                    return Err(format!(
                        "音频流提前中断：已下载 {} 字节，预期 {} 字节",
                        downloaded, tot
                    ));
                }
            }
            break;
        }

        file.write_all(&chunk)
            .map_err(|e| format!("写入音频数据失败: {}", e))?;
        downloaded += chunk.len() as u64;
        start += chunk.len() as u64;

        if last_notify.elapsed() >= std::time::Duration::from_millis(200) {
            let total_estimate = total_bytes.unwrap_or(downloaded.max(10_000_000));
            let pct = ((downloaded as f64 / total_estimate as f64) * 100.0).min(100.0);
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

        if status == reqwest::StatusCode::OK {
            if let Some(tot) = total_bytes {
                if downloaded < tot {
                    let _ = std::fs::remove_file(dest_path);
                    return Err(format!(
                        "音频流响应不完整（状态码 200）：已接收 {} 字节，预期 {} 字节",
                        downloaded, tot
                    ));
                }
            }
            break;
        }

        if let Some(tot) = total_bytes {
            if start >= tot {
                break;
            }
        }
    }

    file.flush()
        .map_err(|e| format!("刷新音频文件写入失败: {}", e))?;

    if downloaded == 0 {
        let _ = std::fs::remove_file(dest_path);
        return Err("音频数据为空".to_string());
    }

    if let Some(tot) = total_bytes {
        let min_acceptable = (tot as f64 * 0.98) as u64;
        if downloaded < min_acceptable {
            let _ = std::fs::remove_file(dest_path);
            return Err(format!(
                "音频文件大小未达到预期：实际 {} 字节，预期 {} 字节",
                downloaded, tot
            ));
        }
    }

    Ok(())
}

fn wrap_box(tag: &[u8; 4], payload: &[u8]) -> Vec<u8> {
    let sz = (8 + payload.len()) as u32;
    let mut b = Vec::with_capacity(8 + payload.len());
    b.extend_from_slice(&sz.to_be_bytes());
    b.extend_from_slice(tag);
    b.extend_from_slice(payload);
    b
}

struct Mp4BoxHeader {
    offset: u64,
    size: u64,
    header_size: u64,
    tag: [u8; 4],
}

fn read_box_header<R: std::io::Read + std::io::Seek>(
    r: &mut R,
    cur_pos: u64,
) -> std::io::Result<Option<Mp4BoxHeader>> {
    let mut hdr = [0u8; 8];
    if let Err(e) = r.read_exact(&mut hdr) {
        if e.kind() == std::io::ErrorKind::UnexpectedEof {
            return Ok(None);
        }
        return Err(e);
    }
    let sz32 = u32::from_be_bytes([hdr[0], hdr[1], hdr[2], hdr[3]]) as u64;
    let tag = [hdr[4], hdr[5], hdr[6], hdr[7]];
    if sz32 == 1 {
        let mut large = [0u8; 8];
        r.read_exact(&mut large)?;
        let sz = u64::from_be_bytes(large);
        Ok(Some(Mp4BoxHeader {
            offset: cur_pos,
            size: sz,
            header_size: 16,
            tag,
        }))
    } else if sz32 == 0 {
        let end = r.seek(std::io::SeekFrom::End(0))?;
        r.seek(std::io::SeekFrom::Start(cur_pos + 8))?;
        Ok(Some(Mp4BoxHeader {
            offset: cur_pos,
            size: end.saturating_sub(cur_pos),
            header_size: 8,
            tag,
        }))
    } else {
        Ok(Some(Mp4BoxHeader {
            offset: cur_pos,
            size: sz32,
            header_size: 8,
            tag,
        }))
    }
}

fn find_sub_box<'a>(data: &'a [u8], target_tag: &[u8; 4]) -> Option<(&'a [u8], usize)> {
    let mut off = 0;
    while off + 8 <= data.len() {
        let sz = u32::from_be_bytes([data[off], data[off + 1], data[off + 2], data[off + 3]]) as usize;
        let tag = [data[off + 4], data[off + 5], data[off + 6], data[off + 7]];
        if sz < 8 || off + sz > data.len() {
            break;
        }
        if &tag == target_tag {
            return Some((&data[off + 8..off + sz], off));
        }
        off += sz;
    }
    None
}

fn build_progressive_moov(
    timescale: u32,
    total_duration: u64,
    stsd_box: &[u8],
    sample_durations: &[u32],
    sample_sizes: &[u32],
    chunk_offset: u64,
) -> Vec<u8> {
    let total_samples = sample_sizes.len() as u32;

    // stts: run-length encoded time-to-sample table
    let mut stts_entries: Vec<(u32, u32)> = Vec::new();
    for &dur in sample_durations {
        if let Some(last) = stts_entries.last_mut() {
            if last.1 == dur {
                last.0 += 1;
                continue;
            }
        }
        stts_entries.push((1, dur));
    }
    let mut stts_payload = Vec::with_capacity(8 + stts_entries.len() * 8);
    stts_payload.extend_from_slice(&[0, 0, 0, 0]); // version/flags
    stts_payload.extend_from_slice(&(stts_entries.len() as u32).to_be_bytes());
    for (cnt, delta) in stts_entries {
        stts_payload.extend_from_slice(&cnt.to_be_bytes());
        stts_payload.extend_from_slice(&delta.to_be_bytes());
    }
    let stts = wrap_box(b"stts", &stts_payload);

    // Chunking: group samples into ~1-second chunks (~43 AAC samples at 44.1kHz / 1024 frames)
    // This allows Chromium's FFmpegDemuxer to buffer chunk-by-chunk and stream indefinitely
    // without hitting PIPELINE_ERROR_READ from internal buffer exhaustion.
    const CHUNK_SIZE: u32 = 43;
    let num_full_chunks = total_samples / CHUNK_SIZE;
    let rem_samples = total_samples % CHUNK_SIZE;
    let total_chunks = if rem_samples > 0 { num_full_chunks + 1 } else { num_full_chunks };

    let mut stsc_payload = Vec::new();
    stsc_payload.extend_from_slice(&[0, 0, 0, 0]); // version/flags
    if rem_samples == 0 || num_full_chunks == 0 {
        stsc_payload.extend_from_slice(&1u32.to_be_bytes()); // 1 entry
        stsc_payload.extend_from_slice(&1u32.to_be_bytes()); // first_chunk
        stsc_payload.extend_from_slice(&(total_samples.min(CHUNK_SIZE).max(1)).to_be_bytes());
        stsc_payload.extend_from_slice(&1u32.to_be_bytes()); // sample_description_index
    } else {
        stsc_payload.extend_from_slice(&2u32.to_be_bytes()); // 2 entries
        stsc_payload.extend_from_slice(&1u32.to_be_bytes()); // first_chunk: 1
        stsc_payload.extend_from_slice(&CHUNK_SIZE.to_be_bytes()); // samples_per_chunk: 43
        stsc_payload.extend_from_slice(&1u32.to_be_bytes());

        stsc_payload.extend_from_slice(&(num_full_chunks + 1).to_be_bytes()); // first_chunk: last
        stsc_payload.extend_from_slice(&rem_samples.to_be_bytes()); // samples_per_chunk: remainder
        stsc_payload.extend_from_slice(&1u32.to_be_bytes());
    }
    let stsc = wrap_box(b"stsc", &stsc_payload);

    // stsz: sample sizes table
    let mut stsz_payload = Vec::with_capacity(12 + sample_sizes.len() * 4);
    stsz_payload.extend_from_slice(&[0, 0, 0, 0]);
    stsz_payload.extend_from_slice(&0u32.to_be_bytes()); // variable sample size
    stsz_payload.extend_from_slice(&total_samples.to_be_bytes());
    for &sz in sample_sizes {
        stsz_payload.extend_from_slice(&sz.to_be_bytes());
    }
    let stsz = wrap_box(b"stsz", &stsz_payload);

    // co64: 64-bit chunk offsets table
    let mut co64_payload = Vec::with_capacity(8 + (total_chunks as usize) * 8);
    co64_payload.extend_from_slice(&[0, 0, 0, 0]);
    co64_payload.extend_from_slice(&total_chunks.to_be_bytes());

    let mut current_offset = chunk_offset;
    let mut sample_idx = 0;
    for c in 0..total_chunks {
        co64_payload.extend_from_slice(&current_offset.to_be_bytes());
        let count = if c < num_full_chunks { CHUNK_SIZE } else { rem_samples };
        for _ in 0..count {
            if sample_idx < sample_sizes.len() {
                current_offset += sample_sizes[sample_idx] as u64;
                sample_idx += 1;
            }
        }
    }
    let co64 = wrap_box(b"co64", &co64_payload);

    // stbl
    let mut stbl_payload = Vec::with_capacity(stsd_box.len() + stts.len() + stsc.len() + stsz.len() + co64.len());
    stbl_payload.extend_from_slice(stsd_box);
    stbl_payload.extend_from_slice(&stts);
    stbl_payload.extend_from_slice(&stsc);
    stbl_payload.extend_from_slice(&stsz);
    stbl_payload.extend_from_slice(&co64);
    let stbl = wrap_box(b"stbl", &stbl_payload);

    // smhd
    let smhd = wrap_box(b"smhd", &[0, 0, 0, 0, 0, 0, 0, 0]);

    // dinf
    let url_box = wrap_box(b"url ", &[0, 0, 0, 1]);
    let mut dref_payload = Vec::with_capacity(8 + url_box.len());
    dref_payload.extend_from_slice(&[0, 0, 0, 0]);
    dref_payload.extend_from_slice(&1u32.to_be_bytes());
    dref_payload.extend_from_slice(&url_box);
    let dref = wrap_box(b"dref", &dref_payload);
    let dinf = wrap_box(b"dinf", &dref);

    // minf
    let mut minf_payload = Vec::with_capacity(smhd.len() + dinf.len() + stbl.len());
    minf_payload.extend_from_slice(&smhd);
    minf_payload.extend_from_slice(&dinf);
    minf_payload.extend_from_slice(&stbl);
    let minf = wrap_box(b"minf", &minf_payload);

    // hdlr
    let mut hdlr_payload = Vec::with_capacity(36);
    hdlr_payload.extend_from_slice(&[0, 0, 0, 0, 0, 0, 0, 0]);
    hdlr_payload.extend_from_slice(b"soun");
    hdlr_payload.extend_from_slice(&[0u8; 12]);
    hdlr_payload.extend_from_slice(b"SoundHandler\0");
    let hdlr = wrap_box(b"hdlr", &hdlr_payload);

    // mdhd
    let mut mdhd_payload = Vec::with_capacity(24);
    mdhd_payload.extend_from_slice(&[0, 0, 0, 0]);
    mdhd_payload.extend_from_slice(&0u32.to_be_bytes()); // create
    mdhd_payload.extend_from_slice(&0u32.to_be_bytes()); // mod
    mdhd_payload.extend_from_slice(&timescale.to_be_bytes());
    let dur32 = total_duration.min(u32::MAX as u64) as u32;
    mdhd_payload.extend_from_slice(&dur32.to_be_bytes());
    mdhd_payload.extend_from_slice(&0x55c4u16.to_be_bytes()); // und language
    mdhd_payload.extend_from_slice(&0u16.to_be_bytes());
    let mdhd = wrap_box(b"mdhd", &mdhd_payload);

    // mdia
    let mut mdia_payload = Vec::with_capacity(mdhd.len() + hdlr.len() + minf.len());
    mdia_payload.extend_from_slice(&mdhd);
    mdia_payload.extend_from_slice(&hdlr);
    mdia_payload.extend_from_slice(&minf);
    let mdia = wrap_box(b"mdia", &mdia_payload);

    // tkhd
    let mut tkhd_payload = Vec::with_capacity(84);
    tkhd_payload.extend_from_slice(&[0, 0, 0, 7]); // enabled | in movie | in preview
    tkhd_payload.extend_from_slice(&0u32.to_be_bytes());
    tkhd_payload.extend_from_slice(&0u32.to_be_bytes());
    tkhd_payload.extend_from_slice(&1u32.to_be_bytes()); // track 1
    tkhd_payload.extend_from_slice(&0u32.to_be_bytes());
    tkhd_payload.extend_from_slice(&dur32.to_be_bytes());
    tkhd_payload.extend_from_slice(&[0u8; 8]);
    tkhd_payload.extend_from_slice(&0u16.to_be_bytes()); // layer 0
    tkhd_payload.extend_from_slice(&0u16.to_be_bytes()); // alt 0
    tkhd_payload.extend_from_slice(&0x0100u16.to_be_bytes()); // vol 1.0
    tkhd_payload.extend_from_slice(&0u16.to_be_bytes());
    tkhd_payload.extend_from_slice(&0x00010000u32.to_be_bytes());
    tkhd_payload.extend_from_slice(&0u32.to_be_bytes());
    tkhd_payload.extend_from_slice(&0u32.to_be_bytes());
    tkhd_payload.extend_from_slice(&0u32.to_be_bytes());
    tkhd_payload.extend_from_slice(&0x00010000u32.to_be_bytes());
    tkhd_payload.extend_from_slice(&0u32.to_be_bytes());
    tkhd_payload.extend_from_slice(&0u32.to_be_bytes());
    tkhd_payload.extend_from_slice(&0u32.to_be_bytes());
    tkhd_payload.extend_from_slice(&0x40000000u32.to_be_bytes());
    tkhd_payload.extend_from_slice(&0u32.to_be_bytes()); // width 0
    tkhd_payload.extend_from_slice(&0u32.to_be_bytes()); // height 0
    let tkhd = wrap_box(b"tkhd", &tkhd_payload);

    // trak
    let mut trak_payload = Vec::with_capacity(tkhd.len() + mdia.len());
    trak_payload.extend_from_slice(&tkhd);
    trak_payload.extend_from_slice(&mdia);
    let trak = wrap_box(b"trak", &trak_payload);

    // mvhd
    let mut mvhd_payload = Vec::with_capacity(100);
    mvhd_payload.extend_from_slice(&[0, 0, 0, 0]);
    mvhd_payload.extend_from_slice(&0u32.to_be_bytes());
    mvhd_payload.extend_from_slice(&0u32.to_be_bytes());
    mvhd_payload.extend_from_slice(&timescale.to_be_bytes());
    mvhd_payload.extend_from_slice(&dur32.to_be_bytes());
    mvhd_payload.extend_from_slice(&0x00010000u32.to_be_bytes()); // rate 1.0
    mvhd_payload.extend_from_slice(&0x0100u16.to_be_bytes()); // vol 1.0
    mvhd_payload.extend_from_slice(&[0u8; 10]);
    mvhd_payload.extend_from_slice(&0x00010000u32.to_be_bytes());
    mvhd_payload.extend_from_slice(&0u32.to_be_bytes());
    mvhd_payload.extend_from_slice(&0u32.to_be_bytes());
    mvhd_payload.extend_from_slice(&0u32.to_be_bytes());
    mvhd_payload.extend_from_slice(&0x00010000u32.to_be_bytes());
    mvhd_payload.extend_from_slice(&0u32.to_be_bytes());
    mvhd_payload.extend_from_slice(&0u32.to_be_bytes());
    mvhd_payload.extend_from_slice(&0u32.to_be_bytes());
    mvhd_payload.extend_from_slice(&0x40000000u32.to_be_bytes());
    mvhd_payload.extend_from_slice(&[0u8; 24]);
    mvhd_payload.extend_from_slice(&2u32.to_be_bytes()); // next track id 2
    let mvhd = wrap_box(b"mvhd", &mvhd_payload);

    // moov
    let mut moov_payload = Vec::with_capacity(mvhd.len() + trak.len());
    moov_payload.extend_from_slice(&mvhd);
    moov_payload.extend_from_slice(&trak);
    wrap_box(b"moov", &moov_payload)
}

/// Remux a fragmented MP4 (DASH audio stream) into a standard progressive .m4a container.
/// Returns Ok(true) if remuxed, Ok(false) if the file was not fragmented.
pub fn remux_fmp4_to_m4a(raw_path: &std::path::Path, out_path: &std::path::Path) -> Result<bool, String> {
    use std::io::{Read, Seek, SeekFrom, Write};

    let mut r = std::fs::File::open(raw_path).map_err(|e| format!("打开原始音频文件失败: {}", e))?;
    let file_len = r.metadata().map_err(|e| format!("读取文件属性失败: {}", e))?.len();

    let mut cur_pos: u64 = 0;
    let mut timescale: u32 = 44100;
    let mut stsd_box: Option<Vec<u8>> = None;
    let mut sample_sizes: Vec<u32> = Vec::new();
    let mut sample_durations: Vec<u32> = Vec::new();
    let mut mdat_chunks: Vec<(u64, u64)> = Vec::new();
    let mut has_moof = false;

    while cur_pos < file_len {
        r.seek(SeekFrom::Start(cur_pos)).map_err(|e| format!("定位文件失败: {}", e))?;
        let b_hdr = match read_box_header(&mut r, cur_pos).map_err(|e| format!("读取box头失败: {}", e))? {
            Some(h) => h,
            None => break,
        };

        if b_hdr.size == 0 || cur_pos.checked_add(b_hdr.size).is_none() {
            break;
        }

        let p_off = b_hdr.offset + b_hdr.header_size;
        let p_len = b_hdr.size.saturating_sub(b_hdr.header_size);

        if &b_hdr.tag == b"moov" {
            let mut moov_buf = vec![0u8; p_len as usize];
            r.seek(SeekFrom::Start(p_off)).map_err(|e| format!("定位moov失败: {}", e))?;
            r.read_exact(&mut moov_buf).map_err(|e| format!("读取moov失败: {}", e))?;

            if let Some((trak, _)) = find_sub_box(&moov_buf, b"trak") {
                if let Some((mdia, _)) = find_sub_box(trak, b"mdia") {
                    if let Some((mdhd, _)) = find_sub_box(mdia, b"mdhd") {
                        if mdhd.len() >= 16 {
                            let ver = mdhd[0];
                            if ver == 0 && mdhd.len() >= 16 {
                                timescale = u32::from_be_bytes([mdhd[12], mdhd[13], mdhd[14], mdhd[15]]);
                            } else if ver == 1 && mdhd.len() >= 24 {
                                timescale = u32::from_be_bytes([mdhd[20], mdhd[21], mdhd[22], mdhd[23]]);
                            }
                        }
                    }
                    if let Some((minf, _)) = find_sub_box(mdia, b"minf") {
                        if let Some((stbl, _)) = find_sub_box(minf, b"stbl") {
                            if let Some((stsd_payload, stsd_off)) = find_sub_box(stbl, b"stsd") {
                                let stsd_sz = u32::from_be_bytes([
                                    stbl[stsd_off],
                                    stbl[stsd_off + 1],
                                    stbl[stsd_off + 2],
                                    stbl[stsd_off + 3],
                                ]) as usize;
                                if stsd_off + stsd_sz <= stbl.len() {
                                    stsd_box = Some(stbl[stsd_off..stsd_off + stsd_sz].to_vec());
                                } else {
                                    stsd_box = Some(wrap_box(b"stsd", stsd_payload));
                                }
                            }

                            // If this is an existing progressive M4A that was previously remuxed with only a single chunk,
                            // detect it so we can re-chunk it into ~1s chunks to prevent demuxer read buffer exhaustion.
                            if let Some((stsz, _)) = find_sub_box(stbl, b"stsz") {
                                if stsz.len() >= 12 {
                                    let default_sz = u32::from_be_bytes([stsz[4], stsz[5], stsz[6], stsz[7]]);
                                    let sample_cnt = u32::from_be_bytes([stsz[8], stsz[9], stsz[10], stsz[11]]) as usize;
                                    if default_sz == 0 && sample_cnt > 100 && stsz.len() >= 12 + sample_cnt * 4 {
                                        let needs_rechunk = if let Some((co64, _)) = find_sub_box(stbl, b"co64") {
                                            co64.len() >= 8 && u32::from_be_bytes([co64[4], co64[5], co64[6], co64[7]]) == 1
                                        } else if let Some((stco, _)) = find_sub_box(stbl, b"stco") {
                                            stco.len() >= 8 && u32::from_be_bytes([stco[4], stco[5], stco[6], stco[7]]) == 1
                                        } else {
                                            false
                                        };
                                        if needs_rechunk {
                                            for i in 0..sample_cnt {
                                                let ptr = 12 + i * 4;
                                                sample_sizes.push(u32::from_be_bytes([stsz[ptr], stsz[ptr + 1], stsz[ptr + 2], stsz[ptr + 3]]));
                                            }
                                            if let Some((stts, _)) = find_sub_box(stbl, b"stts") {
                                                if stts.len() >= 8 {
                                                    let entry_cnt = u32::from_be_bytes([stts[4], stts[5], stts[6], stts[7]]) as usize;
                                                    let mut ptr = 8;
                                                    for _ in 0..entry_cnt {
                                                        if ptr + 8 <= stts.len() {
                                                            let cnt = u32::from_be_bytes([stts[ptr], stts[ptr + 1], stts[ptr + 2], stts[ptr + 3]]);
                                                            let delta = u32::from_be_bytes([stts[ptr + 4], stts[ptr + 5], stts[ptr + 6], stts[ptr + 7]]);
                                                            for _ in 0..cnt {
                                                                sample_durations.push(delta);
                                                            }
                                                            ptr += 8;
                                                        }
                                                    }
                                                }
                                            }
                                            while sample_durations.len() < sample_sizes.len() {
                                                sample_durations.push(1024);
                                            }
                                            has_moof = true; // Mark as eligible for remux
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } else if &b_hdr.tag == b"moof" {
            has_moof = true;
            let mut moof_buf = vec![0u8; p_len as usize];
            r.seek(SeekFrom::Start(p_off)).map_err(|e| format!("定位moof失败: {}", e))?;
            r.read_exact(&mut moof_buf).map_err(|e| format!("读取moof失败: {}", e))?;

            if let Some((traf, _)) = find_sub_box(&moof_buf, b"traf") {
                let mut default_dur = 1024u32;
                let mut default_sz = 0u32;
                if let Some((tfhd, _)) = find_sub_box(traf, b"tfhd") {
                    if tfhd.len() >= 8 {
                        let tfhd_flags = u32::from_be_bytes([0, tfhd[1], tfhd[2], tfhd[3]]);
                        let mut ptr = 8;
                        if tfhd_flags & 0x000001 != 0 { ptr += 8; }
                        if tfhd_flags & 0x000002 != 0 { ptr += 4; }
                        if tfhd_flags & 0x000008 != 0 && ptr + 4 <= tfhd.len() {
                            default_dur = u32::from_be_bytes([tfhd[ptr], tfhd[ptr + 1], tfhd[ptr + 2], tfhd[ptr + 3]]);
                            ptr += 4;
                        }
                        if tfhd_flags & 0x000010 != 0 && ptr + 4 <= tfhd.len() {
                            default_sz = u32::from_be_bytes([tfhd[ptr], tfhd[ptr + 1], tfhd[ptr + 2], tfhd[ptr + 3]]);
                        }
                    }
                }
                if let Some((trun, _)) = find_sub_box(traf, b"trun") {
                    if trun.len() >= 8 {
                        let trun_flags = u32::from_be_bytes([0, trun[1], trun[2], trun[3]]);
                        let sample_cnt = u32::from_be_bytes([trun[4], trun[5], trun[6], trun[7]]) as usize;
                        let mut ptr = 8;
                        if trun_flags & 0x000001 != 0 { ptr += 4; }
                        if trun_flags & 0x000004 != 0 { ptr += 4; }
                        for _ in 0..sample_cnt {
                            if ptr > trun.len() { break; }
                            let dur = if trun_flags & 0x000100 != 0 && ptr + 4 <= trun.len() {
                                let d = u32::from_be_bytes([trun[ptr], trun[ptr + 1], trun[ptr + 2], trun[ptr + 3]]);
                                ptr += 4;
                                d
                            } else {
                                default_dur
                            };
                            let sz = if trun_flags & 0x000200 != 0 && ptr + 4 <= trun.len() {
                                let s = u32::from_be_bytes([trun[ptr], trun[ptr + 1], trun[ptr + 2], trun[ptr + 3]]);
                                ptr += 4;
                                s
                            } else {
                                default_sz
                            };
                            if trun_flags & 0x000400 != 0 { ptr += 4; }
                            if trun_flags & 0x000800 != 0 { ptr += 4; }
                            sample_durations.push(dur);
                            sample_sizes.push(sz);
                        }
                    }
                }
            }
        } else if &b_hdr.tag == b"mdat" {
            mdat_chunks.push((p_off, p_len));
        }

        cur_pos += b_hdr.size;
    }

    if !has_moof || sample_sizes.is_empty() || mdat_chunks.is_empty() {
        return Ok(false);
    }

    let stsd = match stsd_box {
        Some(s) => s,
        None => return Err("未能从原始音频中提取到stsd音频描述".to_string()),
    };

    let total_duration: u64 = sample_durations.iter().map(|&d| d as u64).sum();
    let total_media_size: u64 = mdat_chunks.iter().map(|&(_, l)| l).sum();

    let ftyp = wrap_box(b"ftyp", b"M4A \0\0\0\0M4A mp42isom\0\0\0\0");
    let ftyp_len = ftyp.len() as u64;

    let dummy_moov = build_progressive_moov(timescale, total_duration, &stsd, &sample_durations, &sample_sizes, 0);
    let moov_len = dummy_moov.len() as u64;
    let mdat_header_len = if total_media_size + 8 <= u32::MAX as u64 { 8u64 } else { 16u64 };
    let exact_chunk_offset = ftyp_len + moov_len + mdat_header_len;

    let final_moov = build_progressive_moov(timescale, total_duration, &stsd, &sample_durations, &sample_sizes, exact_chunk_offset);

    let out_file = std::fs::File::create(out_path).map_err(|e| format!("创建输出音频文件失败: {}", e))?;
    let mut w = std::io::BufWriter::with_capacity(128 * 1024, out_file);

    w.write_all(&ftyp).map_err(|e| format!("写入ftyp失败: {}", e))?;
    w.write_all(&final_moov).map_err(|e| format!("写入moov失败: {}", e))?;

    if total_media_size + 8 <= u32::MAX as u64 {
        let mdat_sz = (total_media_size + 8) as u32;
        w.write_all(&mdat_sz.to_be_bytes()).map_err(|e| format!("写入mdat头失败: {}", e))?;
        w.write_all(b"mdat").map_err(|e| format!("写入mdat头失败: {}", e))?;
    } else {
        w.write_all(&1u32.to_be_bytes()).map_err(|e| format!("写入mdat头失败: {}", e))?;
        w.write_all(b"mdat").map_err(|e| format!("写入mdat头失败: {}", e))?;
        let total_sz = total_media_size + 16;
        w.write_all(&total_sz.to_be_bytes()).map_err(|e| format!("写入mdat头失败: {}", e))?;
    }

    let mut copy_buf = vec![0u8; 128 * 1024];
    for (p_off, p_len) in mdat_chunks {
        r.seek(SeekFrom::Start(p_off)).map_err(|e| format!("定位mdat失败: {}", e))?;
        let mut remaining = p_len;
        while remaining > 0 {
            let to_read = remaining.min(copy_buf.len() as u64) as usize;
            r.read_exact(&mut copy_buf[..to_read]).map_err(|e| format!("读取mdat数据失败: {}", e))?;
            w.write_all(&copy_buf[..to_read]).map_err(|e| format!("写入mdat数据失败: {}", e))?;
            remaining -= to_read as u64;
        }
    }
    w.flush().map_err(|e| format!("刷新输出文件失败: {}", e))?;

    Ok(true)
}

/// Automatically detect if an existing audio file on disk is an un-remuxed fragmented MP4
/// and convert it in-place to a standard progressive Fast Start M4A.
pub fn ensure_audio_remuxed_inplace(path: &std::path::Path) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }
    let temp_out = path.with_extension("remux_tmp.m4a");
    match remux_fmp4_to_m4a(path, &temp_out) {
        Ok(true) => {
            if std::fs::rename(&temp_out, path).is_err() {
                let _ = std::fs::copy(&temp_out, path);
                let _ = std::fs::remove_file(&temp_out);
            }
            log::info!("In-place remuxed legacy audio to progressive M4A: {:?}", path);
            Ok(true)
        }
        Ok(false) => {
            let _ = std::fs::remove_file(&temp_out);
            Ok(false)
        }
        Err(e) => {
            let _ = std::fs::remove_file(&temp_out);
            log::warn!("In-place remux check failed for {:?}: {}", path, e);
            Err(e)
        }
    }
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
            .connect_timeout(std::time::Duration::from_secs(15))
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
                    let raw_dest = temp_dir.join(format!("raw_{}_{}.mp4", meta.video_id, task_id_clone));
                    let direct_res = download_audio_direct(
                        &client,
                        &audio_url,
                        cookies_ref,
                        &raw_dest,
                        approx_size,
                        &task_id_clone,
                        |mapped, speed, msg| {
                            // Scale 0..85% during download
                            notify("audio", mapped * 0.9, speed, msg);
                        },
                    )
                    .await;

                    let is_size_acceptable = if let Some(exp_sz) = approx_size {
                        let min_acceptable = (exp_sz as f64 * 0.98) as u64;
                        fs::metadata(&raw_dest).map(|m| m.len() >= min_acceptable).unwrap_or(false)
                    } else {
                        fs::metadata(&raw_dest).map(|m| m.len() > 1024).unwrap_or(false)
                    };

                    if direct_res.is_ok()
                        && raw_dest.exists()
                        && is_size_acceptable
                    {
                        notify("audio", 88.0, None, "正在优化音频索引...");
                        match remux_fmp4_to_m4a(&raw_dest, &audio_dest) {
                            Ok(true) => {
                                let _ = fs::remove_file(&raw_dest);
                                audio_downloaded = true;
                            }
                            Ok(false) => {
                                if fs::rename(&raw_dest, &audio_dest).is_err() {
                                    let _ = fs::copy(&raw_dest, &audio_dest);
                                    let _ = fs::remove_file(&raw_dest);
                                }
                                audio_downloaded = true;
                            }
                            Err(e) => {
                                log::warn!("fMP4转封装失败，回退到原始音频: {}", e);
                                if fs::rename(&raw_dest, &audio_dest).is_err() {
                                    let _ = fs::copy(&raw_dest, &audio_dest);
                                    let _ = fs::remove_file(&raw_dest);
                                }
                                audio_downloaded = true;
                            }
                        }
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
        assert_eq!(
            extract_video_id("https://www.youtube.com/live/5hRaRgbMUG4?is=myyYkVEbYE_tb5ry"),
            Some("5hRaRgbMUG4".to_string())
        );
        assert_eq!(
            extract_video_id("https://www.youtube.com/embed/5hRaRgbMUG4"),
            Some("5hRaRgbMUG4".to_string())
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

    #[tokio::test]
    async fn test_cmxkrr_video() {
        let url = "https://youtu.be/CMXkrrSJEck?si=unSW1EFbciNfgZGE";
        let res = fetch_youtube_metadata(url, "es").await;
        if let Ok(meta) = res {
            assert_eq!(meta.video_id, "CMXkrrSJEck");
            assert!(meta.has_auto_captions || meta.has_manual_subtitles);
        }
        let client = reqwest::Client::new();
        if let Ok(session) = fetch_youtube_session(&client, "CMXkrrSJEck", "es").await {
            if let Some(ref pj) = session.player_response {
                if let Some((ref audio_url, approx_size)) = find_audio_format(pj) {
                    let temp_dest = std::env::temp_dir().join("test_cmxkrr_direct.m4a");
                    let dl_res = download_audio_direct(
                        &client,
                        audio_url,
                        &session.cookies,
                        &temp_dest,
                        approx_size,
                        "test_cmxkrr_task",
                        |_p, _s, _m| {},
                    ).await;
                    assert!(dl_res.is_ok(), "dl_res error: {:?}", dl_res);
                    assert!(temp_dest.exists());
                    let sz = std::fs::metadata(&temp_dest).map(|m| m.len()).unwrap_or(0);
                    assert!(sz > 10_000_000);
                    let _ = std::fs::remove_file(&temp_dest);
                }
            }
        }
    }

    #[tokio::test]
    #[allow(non_snake_case)]
    async fn test_5hRaRgbMUG4_video() {
        let url = "https://www.youtube.com/live/5hRaRgbMUG4?is=myyYkVEbYE_tb5ry";
        let res = fetch_youtube_metadata(url, "es").await;
        println!("5hRaRgbMUG4 metadata res: {:?}", res);
        assert!(res.is_ok(), "fetch_youtube_metadata failed: {:?}", res);
        let meta = res.unwrap();
        assert_eq!(meta.video_id, "5hRaRgbMUG4");
        println!("5hRaRgbMUG4 title: {}, sub_lang: {:?}, manual: {}, auto: {}", meta.title, meta.subtitle_lang, meta.has_manual_subtitles, meta.has_auto_captions);
        let client = reqwest::Client::new();
        let session_res = fetch_youtube_session(&client, "5hRaRgbMUG4", "es").await;
        println!("5hRaRgbMUG4 session ok: {}", session_res.is_ok());
        if let Ok(session) = session_res {
            if let Some(ref pj) = session.player_response {
                let fmt = find_audio_format(pj);
                println!("5hRaRgbMUG4 audio fmt: {:?}", fmt.is_some());
                assert!(fmt.is_some());

                let sub_url = find_subtitle_url(pj, "es");
                println!("5hRaRgbMUG4 sub url: {:?}", sub_url);
                if let Some(ref u) = sub_url {
                    let dl_sub = download_subtitle_direct(&client, u, &session.cookies).await;
                    println!("5hRaRgbMUG4 sub dl: ok={}, len={:?}", dl_sub.is_ok(), dl_sub.as_ref().map(|s| s.len()));
                }
            } else {
                panic!("no player_response");
            }
        }
    }

    #[tokio::test]
    async fn test_remux_cmxkrr() {
        let client = reqwest::Client::new();
        if let Ok(session) = fetch_youtube_session(&client, "CMXkrrSJEck", "es").await {
            if let Some(ref pj) = session.player_response {
                if let Some((ref audio_url, approx_size)) = find_audio_format(pj) {
                    let raw_dest = std::env::temp_dir().join("test_cmxkrr_raw.mp4");
                    let remux_dest = std::env::temp_dir().join("test_cmxkrr_remuxed.m4a");
                    let dl_res = download_audio_direct(
                        &client,
                        audio_url,
                        &session.cookies,
                        &raw_dest,
                        approx_size,
                        "test_cmxkrr_task",
                        |_p, _s, _m| {},
                    ).await;
                    assert!(dl_res.is_ok());
                    assert!(raw_dest.exists());

                    let remux_res = remux_fmp4_to_m4a(&raw_dest, &remux_dest);
                    assert!(remux_res.is_ok());
                    assert!(remux_res.unwrap());
                    assert!(remux_dest.exists());

                    let bytes = std::fs::read(&remux_dest).unwrap();
                    assert!(bytes.len() > 10_000_000);
                    assert_eq!(&bytes[4..8], b"ftyp");
                    let sz = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
                    let tag2 = &bytes[sz + 4..sz + 8];
                    assert_eq!(tag2, b"moov");

                    let inplace_res = ensure_audio_remuxed_inplace(&raw_dest);
                    assert!(inplace_res.is_ok());
                    assert!(inplace_res.unwrap());

                    let _ = std::fs::copy(&remux_dest, "target/test_cmxkrr_remuxed.m4a");
                    let _ = std::fs::copy(&raw_dest, "target/test_cmxkrr_raw.mp4");
                    let _ = std::fs::remove_file(&raw_dest);
                    let _ = std::fs::remove_file(&remux_dest);
                }
            }
        }
    }
}
