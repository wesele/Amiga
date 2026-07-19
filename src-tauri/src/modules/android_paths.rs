use std::path::{Path, PathBuf};

/// Default package id used by the phone build and as a last-resort fallback.
const DEFAULT_ANDROID_PACKAGE_NAME: &str = "com.idioma.app";
const ANDROID_UIDS_PER_USER: u32 = 100_000;

/// Resolve the installed Android application id.
///
/// Phone builds use `com.idioma.app`; TV builds use `com.idioma.app.tv`
/// (see `scripts/android-patch.cjs`). Hardcoding either one makes the other
/// try to write under a foreign data directory and fail with EACCES
/// ("Failed to create database directory: Permission denied").
///
/// On Android the process cmdline is the package name, so we read
/// `/proc/self/cmdline` first. Tests and non-Android hosts fall back to the
/// default phone package id.
pub(crate) fn android_package_name() -> String {
    if let Some(name) = package_name_from_cmdline(Path::new("/proc/self/cmdline")) {
        return name;
    }
    DEFAULT_ANDROID_PACKAGE_NAME.to_string()
}

/// Parse `/proc/self/cmdline` (or a test fixture) into a package id.
///
/// The kernel stores the command as one or more NUL-terminated C strings;
/// for Android apps the first entry is the package name.
pub(crate) fn package_name_from_cmdline(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
    let raw = std::str::from_utf8(&bytes[..end]).ok()?.trim();
    if looks_like_package_name(raw) {
        Some(raw.to_string())
    } else {
        None
    }
}

fn looks_like_package_name(s: &str) -> bool {
    if s.is_empty() || !s.contains('.') || s.starts_with('.') || s.ends_with('.') {
        return false;
    }
    s.chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_')
}

pub(crate) fn app_files_dir_for_uid(uid: u32, package_name: &str) -> PathBuf {
    let user_id = uid / ANDROID_UIDS_PER_USER;
    PathBuf::from(format!("/data/user/{user_id}/{package_name}/files"))
}

#[cfg(target_os = "android")]
pub(crate) fn app_files_dir() -> PathBuf {
    // Android assigns app UIDs as userId * 100000 + appId. Deriving the
    // current user from the process UID supports owner, secondary/work, and
    // OEM clone profiles instead of assuming the owner-only /data/data path.
    let uid = unsafe { libc::geteuid() } as u32;
    app_files_dir_for_uid(uid, &android_package_name())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn resolves_owner_user_files_dir_for_phone_package() {
        assert_eq!(
            app_files_dir_for_uid(10_152, "com.idioma.app"),
            PathBuf::from("/data/user/0/com.idioma.app/files")
        );
    }

    #[test]
    fn resolves_owner_user_files_dir_for_tv_package() {
        assert_eq!(
            app_files_dir_for_uid(10_152, "com.idioma.app.tv"),
            PathBuf::from("/data/user/0/com.idioma.app.tv/files")
        );
    }

    #[test]
    fn resolves_secondary_profile_files_dir() {
        assert_eq!(
            app_files_dir_for_uid(1_010_152, "com.idioma.app"),
            PathBuf::from("/data/user/10/com.idioma.app/files")
        );
    }

    #[test]
    fn parses_package_name_from_cmdline_bytes() {
        let dir = std::env::temp_dir().join(format!("amiga-cmdline-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("cmdline");
        {
            let mut f = std::fs::File::create(&path).unwrap();
            f.write_all(b"com.idioma.app.tv\0android.app.ActivityThread\0")
                .unwrap();
        }
        assert_eq!(
            package_name_from_cmdline(&path).as_deref(),
            Some("com.idioma.app.tv")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_non_package_cmdline() {
        let dir = std::env::temp_dir().join(format!("amiga-cmdline-bad-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("cmdline");
        std::fs::write(&path, b"not a package\0").unwrap();
        assert_eq!(package_name_from_cmdline(&path), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn falls_back_to_default_package_on_desktop_hosts() {
        // Desktop test hosts have no Android package cmdline; resolve must
        // still return a usable default so phone/TV path construction works.
        assert_eq!(android_package_name(), DEFAULT_ANDROID_PACKAGE_NAME);
    }
}
