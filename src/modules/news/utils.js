import { open } from "@tauri-apps/plugin-shell";

export function openSourceUrl(url) {
  if (!url) return;
  let target = url;
  if (!/^https?:\/\//i.test(target)) target = "https://" + target;
  open(target).catch(() => window.open(target, "_blank"));
}
