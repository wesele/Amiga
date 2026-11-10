// Stateless, fixed Google upstream. Never expose the server's long-lived key.
export async function mintClassroomToken({
  apiKey = process.env.GEMINI_API_KEY,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey)
    throw new Error("请在服务端配置 GEMINI_API_KEY，或在应用中配置自己的 Gemini Live 密钥");
  const now = Date.now();
  const response = await fetchImpl(
    "https://generativelanguage.googleapis.com/v1alpha/auth_tokens",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
        bidiGenerateContentSetup: { model: "models/gemini-3.8-live" },
        fieldMask: "model",
      }),
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!response.ok) throw new Error(`Gemini 临时连接授权失败 (${response.status})`);
  const result = await response.json();
  if (!String(result.name).startsWith("auth_tokens/")) throw new Error("Gemini 临时授权返回无效");
  return { token: result.name };
}

export function classroomTokenAllowed(req) {
  if (req.method !== "POST" || req.headers["x-amiga-classroom"] !== "1") return false;
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}
