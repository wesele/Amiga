import { open } from "@tauri-apps/plugin-shell";
import { showAlert } from "@/shared/alert.js";
import { t } from "@/shared/i18n/index.js";

const EXTERNAL_URL_RE = /^https?:\/\//i;
const ANDROID_RE = /Android/i;

/**
 * 规范化外部链接 URL。
 * - 空白 / null / undefined 返回 null
 * - 已带 http(s):// 的原样返回
 * - 含其他 scheme（javascript: / file: / data: 等）→ 返回 null（拒绝）
 * - 完全无 scheme（裸主机名）→ 补上 https://
 */
export function normalizeExternalUrl(url) {
  if (url == null) return null;
  const target = String(url).trim();
  if (!target) return null;
  if (EXTERNAL_URL_RE.test(target)) return target;
  // 任何带 ":" 的输入都视作有 scheme（绝对 URL），非 http(s) 一律拒绝
  if (target.includes(":")) return null;
  return "https://" + target;
}

/**
 * 是否是允许的外部协议（仅 http / https）。
 * 拦截 javascript: / data: / file: / blob: / vbscript: 等危险 scheme。
 */
export function isSafeExternalUrl(url) {
  return typeof url === "string" && EXTERNAL_URL_RE.test(url.trim());
}

function isAndroidPlatform() {
  return typeof navigator !== "undefined" && ANDROID_RE.test(navigator.userAgent || "");
}

function formatOpenError(error) {
  if (error == null || error === "") return t("external.openFailedUnknown");
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    const msg = error.message?.trim();
    return msg || error.name || t("external.openFailedUnknown");
  }
  return String(error);
}

function isNativeOpenSuccess(result) {
  return result === true || result === "ok";
}

function hasAndroidExternalBridge() {
  return Boolean(
    window.__amigaExternal && typeof window.__amigaExternal.openUrl === "function",
  );
}

function tryAndroidExternalOpen(target) {
  if (!hasAndroidExternalBridge()) {
    return { ok: false, error: t("external.openFailedBridgeMissing") };
  }
  try {
    const result = window.__amigaExternal.openUrl(target);
    if (isNativeOpenSuccess(result)) return { ok: true };
    const error =
      result === false || result == null
        ? t("external.openFailedUnknown")
        : result;
    return { ok: false, error };
  } catch (e) {
    return { ok: false, error: formatOpenError(e) };
  }
}

function showExternalOpenError(url, error) {
  showAlert({
    title: t("external.openFailedTitle"),
    message: t("external.openFailedMessage", {
      error: formatOpenError(error),
      url,
    }),
    confirmText: t("app.ok"),
  });
}

/**
 * 用系统默认浏览器打开外部链接。
 *
 * 行为：
 * 1. 空 / null / undefined → 不做任何事
 * 2. 含非 http(s) scheme（javascript: / file: / data: 等）→ 拒绝并 warn
 * 3. 裸主机名（无 scheme）→ 补 https://
 * 4. Android 只走 __amigaExternal.openUrl（系统浏览器 Intent），绝不调 shell open
 * 5. 桌面优先 tauri-plugin-shell 的 open()；失败时回退 window.open(_blank, noopener)
 *
 * 注意：此函数**不**在 app 内 WebView 中加载链接。
 */
export async function openExternalUrl(url) {
  const raw = url == null ? "" : String(url).trim();
  if (!raw) return;
  if (!EXTERNAL_URL_RE.test(raw) && raw.includes(":")) {
    console.warn("openExternalUrl: refused non-http(s) URL", raw);
    return;
  }
  const target = normalizeExternalUrl(raw);
  if (!target) return;

  if (isAndroidPlatform()) {
    const { ok, error } = tryAndroidExternalOpen(target);
    if (!ok) {
      console.warn("openExternalUrl: native Android open failed", target, error);
      showExternalOpenError(target, error);
    }
    return;
  }

  try {
    await open(target);
  } catch (e) {
    try {
      const win = window.open(target, "_blank", "noopener,noreferrer");
      if (!win) {
        console.warn("openExternalUrl: window.open returned null", target, e);
        showExternalOpenError(target, e || t("external.windowOpenBlocked"));
      }
    } catch (inner) {
      console.warn("openExternalUrl: failed to open", target, inner || e);
      showExternalOpenError(target, inner || e);
    }
  }
}
