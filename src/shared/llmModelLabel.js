/**
 * 当前生效的大模型名称 -> 标题栏短标签。
 *
 * 学习中心标题栏中间只放一个很短的名字，所以这里同时负责：
 *   1. 从 get_llm_config_cmd 的返回里挑出「当前生效」的那一档（内置 / 自定义）；
 *   2. 压成单行、截断到 MAX_MODEL_LABEL_CHARS 个可见字符（含省略号）。
 */

/** 可见字符上限，含截断时补的省略号。 */
export const MAX_MODEL_LABEL_CHARS = 20;

const ELLIPSIS = "…";

/** 折叠换行/连续空格，去掉首尾空白。 */
export function normalizeModelName(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

/**
 * 取当前生效的模型名。
 * config 形如 { mode: "builtin" | "custom", builtin: { model }, primary: { model } }，
 * mode 为 builtin 时走内置通道，其余（含缺省）走自定义通道。
 */
export function resolveActiveModelName(config) {
  if (!config || typeof config !== "object") return "";
  const active = config.mode === "builtin" ? config.builtin : config.primary;
  return normalizeModelName(active && active.model);
}

/** 超过 max 个字符时截断，总可见长度（含 "…"）不超过 max。 */
export function truncateModelLabel(name, max = MAX_MODEL_LABEL_CHARS) {
  const value = normalizeModelName(name);
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : MAX_MODEL_LABEL_CHARS;
  if (!value) return "";
  // 按码点切分，避免把 emoji / 代理对劈成两半。
  const chars = Array.from(value);
  if (chars.length <= limit) return value;
  return `${chars.slice(0, Math.max(1, limit - 1)).join("")}${ELLIPSIS}`;
}
