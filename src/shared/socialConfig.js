const DEFAULT_SOCIAL_API_BASE_URL = "https://amiga-chat-social.wh1018.workers.dev";

export function trimSlash(value) {
  return (value || "").trim().replace(/\/+$/, "");
}

export function toWebSocketBase(value) {
  const base = trimSlash(value);
  if (!base) return "";
  if (base.startsWith("ws://") || base.startsWith("wss://")) return base;
  if (base.startsWith("https://")) return `wss://${base.slice("https://".length)}`;
  if (base.startsWith("http://")) return `ws://${base.slice("http://".length)}`;
  return base;
}

export function getSocialApiBaseUrl() {
  return trimSlash(import.meta.env?.VITE_IDIOMA_SOCIAL_API_BASE_URL || DEFAULT_SOCIAL_API_BASE_URL);
}

export function getSocialConfigDefaults() {
  const apiBaseUrl = getSocialApiBaseUrl();
  return {
    apiBaseUrl,
    wsBaseUrl: toWebSocketBase(apiBaseUrl),
  };
}
