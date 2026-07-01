import { buildShareText } from "./utils.js";

export async function copyToClipboard(
  text,
  {
    navigatorRef = typeof navigator === "undefined" ? null : navigator,
    documentRef = typeof document === "undefined" ? null : document,
  } = {},
) {
  if (navigatorRef?.clipboard && typeof navigatorRef.clipboard.writeText === "function") {
    try {
      await navigatorRef.clipboard.writeText(text);
      return true;
    } catch (_) {
      // Fall through to legacy path.
    }
  }

  try {
    if (!documentRef?.body) return false;
    const textarea = documentRef.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    documentRef.body.appendChild(textarea);
    textarea.select();
    const ok = documentRef.execCommand && documentRef.execCommand("copy");
    documentRef.body.removeChild(textarea);
    return !!ok;
  } catch (_) {
    return false;
  }
}

export async function shareArticle({
  article,
  targetLabel,
  t,
  nativeShareText,
  showShareStatus,
  navigatorRef = typeof navigator === "undefined" ? null : navigator,
  windowRef = typeof window === "undefined" ? null : window,
  documentRef = typeof document === "undefined" ? null : document,
  copy = copyToClipboard,
  buildShare = buildShareText,
}) {
  if (!article) return false;

  try {
    const title = article.original_title || "";
    const body = article.rewritten_body || article.original_body || "";
    const source = article.source || "";
    const text = buildShare({
      title,
      body,
      source,
      prompt: t("news.sharePrompt", { target: targetLabel }),
      sourceLabel: t("news.shareSource"),
    });

    try {
      await nativeShareText(text);
      return true;
    } catch (_) {
      // Fall through to compatibility/web fallbacks.
    }

    if (windowRef?.__amigaShare && typeof windowRef.__amigaShare.shareText === "function") {
      windowRef.__amigaShare.shareText(text);
      return true;
    }

    if (typeof navigatorRef?.share === "function") {
      try {
        await navigatorRef.share({
          title: title || t("news.shareTitle"),
          text,
          url: source || undefined,
        });
        return true;
      } catch (error) {
        if (error && error.name === "AbortError") return true;
      }
    }

    if (await copy(text, { navigatorRef, documentRef })) {
      showShareStatus(t("news.shareCopied"));
    } else {
      showShareStatus(t("news.shareFail"));
    }
  } catch (error) {
    console.error("Share failed:", error);
    showShareStatus(t("news.shareFail"));
  }
  return true;
}
