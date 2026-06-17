use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AssetInfo {
    pub name: String,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub release_notes: String,
    pub release_url: String,
    pub download_urls: Vec<AssetInfo>,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    body: Option<String>,
    html_url: String,
    assets: Vec<GithubAsset>,
}

#[derive(Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

#[tauri::command]
pub async fn check_update(app: tauri::AppHandle) -> Result<UpdateInfo, String> {
    let current_version = app.config().version.clone().unwrap_or_else(|| "0.0.0".to_string());
    let owner = "wesele";
    let repo = "Amiga";
    let api_url = format!(
        "https://api.github.com/repos/{}/{}/releases/latest",
        owner, repo
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&api_url)
        .header("User-Agent", "Idioma-App")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("无法连接到 GitHub: {}", e))?;

    let release: GithubRelease = resp
        .json()
        .await
        .map_err(|e| format!("解析 GitHub 响应失败: {}", e))?;

    let latest_tag = release.tag_name.trim_start_matches('v');
    let has_update = compare_versions(latest_tag, &current_version) == std::cmp::Ordering::Greater;

    let download_urls: Vec<AssetInfo> = release
        .assets
        .into_iter()
        .map(|a| AssetInfo {
            name: a.name,
            url: a.browser_download_url,
        })
        .collect();

    Ok(UpdateInfo {
        current_version,
        latest_version: latest_tag.to_string(),
        has_update,
        release_notes: release.body.unwrap_or_default(),
        release_url: release.html_url,
        download_urls,
    })
}

fn compare_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let parts_a: Vec<u32> = a.split('.').filter_map(|s| s.parse().ok()).collect();
    let parts_b: Vec<u32> = b.split('.').filter_map(|s| s.parse().ok()).collect();
    for i in 0..parts_a.len().max(parts_b.len()) {
        let va = parts_a.get(i).copied().unwrap_or(0);
        let vb = parts_b.get(i).copied().unwrap_or(0);
        if va != vb {
            return va.cmp(&vb);
        }
    }
    std::cmp::Ordering::Equal
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cmp::Ordering;

    #[test]
    fn test_compare_versions_equal() {
        assert_eq!(compare_versions("0.1.0", "0.1.0"), Ordering::Equal);
        assert_eq!(compare_versions("1.0.0", "1.0.0"), Ordering::Equal);
        assert_eq!(compare_versions("0.0.0", "0.0.0"), Ordering::Equal);
    }

    #[test]
    fn test_compare_versions_newer() {
        assert_eq!(compare_versions("0.2.0", "0.1.0"), Ordering::Greater);
        assert_eq!(compare_versions("1.0.0", "0.9.9"), Ordering::Greater);
        assert_eq!(compare_versions("1.1.0", "1.0.9"), Ordering::Greater);
        assert_eq!(compare_versions("0.1.10", "0.1.9"), Ordering::Greater);
    }

    #[test]
    fn test_compare_versions_older() {
        assert_eq!(compare_versions("0.1.0", "0.2.0"), Ordering::Less);
        assert_eq!(compare_versions("0.9.9", "1.0.0"), Ordering::Less);
        assert_eq!(compare_versions("1.0.9", "1.1.0"), Ordering::Less);
    }

    #[test]
    fn test_compare_versions_uneven_parts() {
        assert_eq!(compare_versions("1.0", "1.0.0"), Ordering::Equal);
        assert_eq!(compare_versions("1.1", "1.0.5"), Ordering::Greater);
        assert_eq!(compare_versions("1.0", "1.0.1"), Ordering::Less);
    }

}
