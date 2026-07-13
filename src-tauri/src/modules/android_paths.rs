use std::path::PathBuf;

const ANDROID_PACKAGE_NAME: &str = "com.idioma.app";
const ANDROID_UIDS_PER_USER: u32 = 100_000;

pub(crate) fn app_files_dir_for_uid(uid: u32) -> PathBuf {
    let user_id = uid / ANDROID_UIDS_PER_USER;
    PathBuf::from(format!("/data/user/{user_id}/{ANDROID_PACKAGE_NAME}/files"))
}

#[cfg(target_os = "android")]
pub(crate) fn app_files_dir() -> PathBuf {
    // Android assigns app UIDs as userId * 100000 + appId. Deriving the
    // current user from the process UID supports owner, secondary/work, and
    // OEM clone profiles instead of assuming the owner-only /data/data path.
    let uid = unsafe { libc::geteuid() } as u32;
    app_files_dir_for_uid(uid)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_owner_user_files_dir() {
        assert_eq!(
            app_files_dir_for_uid(10_152),
            PathBuf::from("/data/user/0/com.idioma.app/files")
        );
    }

    #[test]
    fn resolves_secondary_profile_files_dir() {
        assert_eq!(
            app_files_dir_for_uid(1_010_152),
            PathBuf::from("/data/user/10/com.idioma.app/files")
        );
    }
}
