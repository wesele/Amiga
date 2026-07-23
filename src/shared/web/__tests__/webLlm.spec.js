import { describe, expect, it } from "vitest";
import { createWebLlmClient, parseJsonReply, proxyBaseUrl } from "../webLlm.js";

describe("Web LLM proxy routing", () => {
  it("maps approved providers to fixed same-origin routes", () => {
    expect(proxyBaseUrl("https://api.openai.com/v1")).toBe("/llm/openai/v1");
    expect(proxyBaseUrl("https://integrate.api.nvidia.com/v1/")).toBe("/llm/nvidia/v1");
    expect(proxyBaseUrl("/llm/deepseek/v1")).toBe("/llm/deepseek/v1");
  });

  it("rejects unapproved hosts and non-HTTPS URLs", () => {
    expect(() => proxyBaseUrl("https://api.openai.com.example.org/v1")).toThrow("not available");
    expect(() => proxyBaseUrl("http://api.openai.com/v1")).toThrow("HTTPS");
  });

  it("parses plain and fenced JSON model replies", () => {
    expect(parseJsonReply('{"correct":true}')).toEqual({ correct: true });
    expect(parseJsonReply('```json\n["a","b"]\n```')).toEqual(["a", "b"]);
  });

  it("omits OpenAI response_format for NVIDIA-compatible endpoints", async () => {
    let requestBody;
    const client = createWebLlmClient({
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(init.body);
        return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }));
      },
    });

    await client.chat({
      mode: "builtin",
      builtin: {
        base_url: "/llm/nvidia/v1",
        api_key: "test",
        model: "test-model",
        provider: "nvidia_nim",
        thinking_enabled: true,
      },
    }, [{ role: "user", content: "Return JSON" }], {
      responseFormat: { type: "json_object" },
    });

    expect(requestBody.response_format).toBeUndefined();
    expect(requestBody.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("tests a connection with a real streamed completion and reports visible output", async () => {
    let capturedUrl;
    let capturedInit;
    const client = createWebLlmClient({
      fetchImpl: async (url, init) => {
        capturedUrl = url;
        capturedInit = init;
        const sse = [
          'data: {"choices":[{"delta":{"reasoning_content":"brief plan"}}]}',
          'data: {"choices":[{"delta":{"content":"one two three four five"}}]}',
          'data: {"choices":[],"usage":{"completion_tokens":9,"completion_tokens_details":{"reasoning_tokens":4}}}',
          "data: [DONE]",
          "",
        ].join("\n");
        return new Response(sse, { headers: { "Content-Type": "text/event-stream" } });
      },
    });

    const result = await client.testConnection({
      base_url: "/llm/nvidia/v1",
      api_key: "test",
      model: "test-model",
      provider: "nvidia_nim",
    });

    expect(result.success).toBe(true);
    expect(result.thinking_tokens).toBe(4);
    expect(result.completion_tokens).toBe(5);
    expect(capturedUrl).toBe("/llm/nvidia/v1/chat/completions");
    expect(capturedInit.method).toBe("POST");
    expect(JSON.parse(capturedInit.body).stream).toBe(true);
  });

  it("times out a stalled connection test", async () => {
    const client = createWebLlmClient({
      testTimeoutMs: 5,
      fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
    });

    await expect(client.testConnection({
      base_url: "/llm/nvidia/v1",
      api_key: "test",
      model: "test-model",
    })).rejects.toThrow("timed out after 5 ms");
  });
});
