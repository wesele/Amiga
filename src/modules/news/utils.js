import { openExternalUrl } from "@/shared/external.js";

export function openSourceUrl(url) {
  return openExternalUrl(url);
}

/**
 * Build the text payload sent to the Web Share API (or copied to the
 * clipboard) when the user taps "分享" in the news reader. The
 * structure is:
 *
 *   {prompt}
 *
 *   {title}
 *
 *   {body}
 *
 *   {sourceLabel}{source}     (only when source is non-empty)
 *
 * `prompt` is a multi-line block (in the user's UI language) that
 * tells the receiving AI — typically Gemini — what the user wants:
 * summarise, explain vocabulary, and ask follow-up questions.
 *
 * Pure function so it can be unit-tested without DOM/Tauri.
 */
export function buildShareText({ title, body, source, prompt, sourceLabel }) {
  const parts = [];
  if (prompt) {
    parts.push(String(prompt).replace(/\s+$/u, ""));
  }
  if (title) {
    parts.push("");
    parts.push(String(title));
  }
  if (body) {
    parts.push("");
    parts.push(String(body));
  }
  if (source) {
    parts.push("");
    parts.push(`${sourceLabel || ""}${source}`.trimEnd());
  }
  return parts.join("\n");
}
