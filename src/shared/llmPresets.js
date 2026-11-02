/**
 * 大模型配置的「已记住参数」列表。
 *
 * 一次连接测试成功后，把当前这套参数（Base URL / API Key / 模型 / 厂商）存进
 * app_settings 的 llm_presets，并用 Base URL 作为唯一键：同一 URL 再存一次就
 * 覆盖旧的（以新的为准），这样切换供应商 / 换 key 不会堆出一串重复项。
 *
 * 该 key 在 Rust 侧已列入 SENSITIVE_SETTING_KEYS，不会随云同步上传。
 */

export const LLM_PRESETS_SETTING_KEY = "llm_presets";

/** 上限，避免设置项无限膨胀（超出时丢弃最旧的）。 */
export const MAX_LLM_PRESETS = 20;

/** 比较用的归一化键：去首尾空白、去尾部斜杠、忽略大小写。 */
export function normalizePresetUrl(url) {
  return String(url ?? "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
}

function cleanUrl(url) {
  return String(url ?? "").trim().replace(/\/+$/, "");
}

/** 把 currentConfig() 形状的对象转成一条预设。 */
export function presetFromConfig(config) {
  if (!config || typeof config !== "object") return null;
  const baseUrl = cleanUrl(config.base_url);
  if (!baseUrl) return null;
  return {
    base_url: baseUrl,
    api_key: String(config.api_key ?? "").trim(),
    model: String(config.model ?? "").trim(),
    provider: String(config.provider ?? "").trim(),
    thinking_enabled: Boolean(config.thinking_enabled),
  };
}

/** 解析 app_settings 里的原始字符串；坏数据一律当成空列表。 */
export function parsePresets(raw) {
  if (!raw) return [];
  let data;
  try {
    data = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      base_url: cleanUrl(item.base_url),
      api_key: String(item.api_key ?? "").trim(),
      model: String(item.model ?? "").trim(),
      provider: String(item.provider ?? "").trim(),
      thinking_enabled: Boolean(item.thinking_enabled),
    }))
    .filter((item) => item.base_url);
}

export function serializePresets(list) {
  return JSON.stringify(Array.isArray(list) ? list : []);
}

/** 按 Base URL 覆盖写入，最新的一条排在前面。 */
export function upsertPreset(list, preset) {
  const current = Array.isArray(list) ? list : [];
  if (!preset || !preset.base_url) return current.slice();
  const key = normalizePresetUrl(preset.base_url);
  const rest = current.filter((item) => normalizePresetUrl(item.base_url) !== key);
  return [preset, ...rest].slice(0, MAX_LLM_PRESETS);
}

export function findPreset(list, baseUrl) {
  const key = normalizePresetUrl(baseUrl);
  if (!key) return null;
  return (Array.isArray(list) ? list : []).find(
    (item) => normalizePresetUrl(item.base_url) === key,
  ) || null;
}

export function removePreset(list, baseUrl) {
  const current = Array.isArray(list) ? list : [];
  const key = normalizePresetUrl(baseUrl);
  if (!key) return current.slice();
  return current.filter((item) => normalizePresetUrl(item.base_url) !== key);
}
