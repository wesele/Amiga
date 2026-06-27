import { openExternalUrl } from "@/shared/external.js";

const ANDROID_RE = /Android/i;
const WINDOWS_RE = /Windows/i;
const APK_RE = /\.apk(?:$|[?#])/i;
const WINDOWS_INSTALLER_RE = /\.(?:msi|exe)(?:$|[?#])/i;

function getUserAgent() {
  return typeof navigator === "undefined" ? "" : navigator.userAgent || "";
}

export function isAndroidPlatform() {
  return ANDROID_RE.test(getUserAgent());
}

export function pickPreferredUpdateAsset(updateInfo) {
  const assets = Array.isArray(updateInfo?.download_urls) ? updateInfo.download_urls : [];
  if (assets.length === 0) return null;

  if (isAndroidPlatform()) {
    return assets.find((asset) => APK_RE.test(asset?.name || asset?.url || "")) || assets[0];
  }

  if (WINDOWS_RE.test(getUserAgent())) {
    return (
      assets.find((asset) => WINDOWS_INSTALLER_RE.test(asset?.name || asset?.url || "")) ||
      assets[0]
    );
  }

  return assets[0];
}

export function canAutoInstallUpdate(updateInfo) {
  const asset = pickPreferredUpdateAsset(updateInfo);
  return Boolean(
    isAndroidPlatform() &&
    asset &&
    APK_RE.test(asset.name || asset.url || "") &&
    window.__amigaUpdater &&
    typeof window.__amigaUpdater.installApk === "function",
  );
}

export async function startAppUpdate(updateInfo) {
  const asset = pickPreferredUpdateAsset(updateInfo);
  const targetUrl = asset?.url || updateInfo?.release_url || "";
  if (!targetUrl) return;

  if (canAutoInstallUpdate(updateInfo)) {
    window.__amigaUpdater.installApk(targetUrl, asset?.name || "amiga-update.apk");
    return;
  }

  await openExternalUrl(targetUrl);
}
