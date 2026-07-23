const PROVIDER_ROUTES = new Map([
  ["api.openai.com", "openai"],
  ["integrate.api.nvidia.com", "nvidia"],
  ["api.deepseek.com", "deepseek"],
  ["api.groq.com", "groq"],
  ["openrouter.ai", "openrouter"],
  ["api.mistral.ai", "mistral"],
  ["api.x.ai", "xai"],
  ["api.together.xyz", "together"],
  ["api.fireworks.ai", "fireworks"],
  ["api.perplexity.ai", "perplexity"],
  ["api.siliconflow.cn", "siliconflow"],
  ["dashscope.aliyuncs.com", "dashscope"],
  ["generativelanguage.googleapis.com", "gemini"],
]);

export function proxyBaseUrl(baseUrl) {
  const raw = String(baseUrl || "").trim().replace(/\/$/, "");
  if (!raw) throw new Error("LLM base URL is empty");
  if (raw.startsWith("/llm/")) return raw;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid LLM base URL");
  }
  if (parsed.protocol !== "https:") throw new Error("Only HTTPS LLM providers are supported");
  const alias = PROVIDER_ROUTES.get(parsed.hostname.toLowerCase());
  if (!alias) throw new Error(`LLM provider is not available through the Web proxy: ${parsed.hostname}`);
  return `/llm/${alias}${parsed.pathname.replace(/\/$/, "")}`;
}

function cleanJsonText(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export function parseJsonReply(text) {
  const cleaned = cleanJsonText(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const objectStart = cleaned.indexOf("{");
    const objectEnd = cleaned.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(cleaned.slice(objectStart, objectEnd + 1));
    }
    const arrayStart = cleaned.indexOf("[");
    const arrayEnd = cleaned.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
    }
    throw new Error("Model response is not valid JSON");
  }
}

function activeConfig(llmConfig) {
  const mode = llmConfig?.mode || "builtin";
  const config = mode === "custom" ? llmConfig?.primary : llmConfig?.builtin;
  if (!config?.base_url || !config?.model) throw new Error("LLM is not configured");
  return config;
}

function supportsResponseFormat(config) {
  return config?.provider === "openai" || String(config?.base_url || "").includes("api.openai.com");
}

function applyThinkingPreference(body, config) {
  if (config?.thinking_enabled && config?.provider === "nvidia_nim") {
    body.chat_template_kwargs = { enable_thinking: false };
  }
  return body;
}

export function createWebLlmClient({
  fetchImpl = globalThis.fetch,
  requestTimeoutMs = 90_000,
  testTimeoutMs = 45_000,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Web LLM client requires fetch");

  async function request(path, config, init = {}) {
    const base = proxyBaseUrl(config.base_url);
    const { timeoutMs = requestTimeoutMs, signal, ...fetchInit } = init;
    const headers = new Headers(fetchInit.headers || {});
    headers.set("Content-Type", "application/json");
    if (config.api_key) headers.set("Authorization", `Bearer ${config.api_key}`);
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    if (signal?.aborted) abortFromCaller();
    else signal?.addEventListener?.("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetchImpl(`${base}${path}`, {
        ...fetchInit,
        headers,
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || `LLM proxy returned HTTP ${response.status}`);
      }
      return response;
    } catch (error) {
      if (timedOut) throw new Error(`LLM proxy timed out after ${timeoutMs} ms`);
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener?.("abort", abortFromCaller);
    }
  }

  async function chat(llmConfig, messages, options = {}) {
    const config = activeConfig(llmConfig);
    const response = await request("/chat/completions", config, {
      method: "POST",
      body: JSON.stringify(applyThinkingPreference({
        model: config.model,
        messages,
        stream: false,
        temperature: options.temperature ?? 0.35,
        max_tokens: options.maxTokens ?? 800,
        ...(options.responseFormat && supportsResponseFormat(config)
          ? { response_format: options.responseFormat }
          : {}),
      }, config)),
      signal: options.signal,
    });
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("LLM response has no message content");
    return content.trim();
  }

  async function listModels(baseUrl, apiKey) {
    const config = { base_url: baseUrl, api_key: apiKey, model: "unused" };
    const response = await request("/models", config, { method: "GET" });
    const payload = await response.json();
    return (payload?.data || []).map((model) => model?.id).filter(Boolean);
  }

  async function testConnection(config) {
    const started = performance.now();
    const response = await request("/chat/completions", config, {
      method: "POST",
      body: JSON.stringify(applyThinkingPreference({
        model: config.model,
        messages: [{ role: "user", content: "Reply with exactly five common English words, separated by spaces." }],
        stream: true,
        temperature: 0,
        max_tokens: 256,
      }, config)),
      timeoutMs: testTimeoutMs,
    });

    let firstTokenAt = null;
    let firstContentAt = null;
    let reasoningText = "";
    let contentText = "";
    let usageCompletionTokens = null;
    let usageReasoningTokens = null;

    const consumePayload = (payload) => {
      const delta = payload?.choices?.[0]?.delta || payload?.choices?.[0]?.message || {};
      const reasoning = delta.reasoning_content ?? delta.reasoning ?? "";
      const content = delta.content ?? "";
      const now = performance.now();
      if ((reasoning || content) && firstTokenAt == null) firstTokenAt = now;
      if (content && firstContentAt == null) firstContentAt = now;
      if (typeof reasoning === "string") reasoningText += reasoning;
      if (typeof content === "string") contentText += content;

      const usage = payload?.usage;
      if (Number.isFinite(usage?.completion_tokens)) usageCompletionTokens = usage.completion_tokens;
      const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens ?? usage?.reasoning_tokens;
      if (Number.isFinite(reasoningTokens)) usageReasoningTokens = reasoningTokens;
    };

    const deadline = started + testTimeoutMs;
    const beforeDeadline = async (promise) => {
      const remaining = Math.max(0, deadline - performance.now());
      if (!remaining) throw new Error(`LLM proxy timed out after ${testTimeoutMs} ms`);
      let timeout;
      try {
        return await Promise.race([
          promise,
          new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error(`LLM proxy timed out after ${testTimeoutMs} ms`)), remaining);
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    };

    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await beforeDeadline(reader.read());
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try { consumePayload(JSON.parse(data)); } catch { /* ignore keepalive/non-JSON lines */ }
          }
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
      }
      const tail = buffer.trim();
      if (tail.startsWith("data:")) {
        const data = tail.slice(5).trim();
        if (data && data !== "[DONE]") {
          try { consumePayload(JSON.parse(data)); } catch { /* ignore incomplete tail */ }
        }
      }
    } else {
      consumePayload(await beforeDeadline(response.json()));
    }

    contentText = contentText.trim();
    if (!contentText) throw new Error("LLM connection test produced no final message content");

    const completedAt = performance.now();
    const estimateTokens = (text) => text ? Math.max(1, Math.ceil(Array.from(text).length / 3)) : 0;
    const thinkingTokens = usageReasoningTokens ?? estimateTokens(reasoningText);
    const estimatedOutputTokens = estimateTokens(contentText);
    const completionTokens = usageCompletionTokens != null && usageReasoningTokens != null
      ? Math.max(1, usageCompletionTokens - usageReasoningTokens)
      : estimatedOutputTokens;
    const firstAt = firstTokenAt ?? completedAt;
    const thinkingEndAt = firstContentAt ?? completedAt;
    const thinkingSeconds = Math.max(1, thinkingEndAt - firstAt) / 1000;
    const decodeSeconds = Math.max(1, completedAt - thinkingEndAt) / 1000;

    return {
      success: true,
      time_to_first_token_ms: Math.max(1, Math.round(firstAt - started)),
      thinking_speed: thinkingTokens / thinkingSeconds,
      decode_speed: completionTokens / decodeSeconds,
      thinking_tokens: thinkingTokens,
      completion_tokens: completionTokens,
    };
  }

  return { chat, listModels, testConnection };
}
