export type Provider = "anthropic" | "openai" | "google" | "deepseek" | "grok";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LLMCallOptions {
  provider: Provider;
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  apiKeys: Record<string, string>;
  onChunk?: (text: string) => void;
}

export interface LLMResponse {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

const TAG = "[InferIQ:LLM]";

function logLLM(level: "log" | "warn" | "error", ...args: unknown[]) {
  console[level](TAG, ...args);
}

function getAnthropicMessages(messages: ChatMessage[]) {
  const system = messages.find((m) => m.role === "system")?.content;
  const filtered = messages.filter((m) => m.role !== "system");
  return { system, messages: filtered };
}

function parseErrorMessage(raw: string): string {
  try {
    const obj = JSON.parse(raw);
    // Anthropic: { error: { message } }
    if (obj?.error?.message) return obj.error.message;
    // OpenAI / Grok / DeepSeek: { error: { message } } or { error: string }
    if (typeof obj?.error === "string") return obj.error;
    // Google: { error: { message } }
    if (obj?.error?.status && obj?.error?.message) return obj.error.message;
    // xAI Grok: { code, error }
    if (obj?.error && obj?.code) return obj.error;
  } catch {
    // not JSON — return as-is
  }
  return raw.slice(0, 200);
}

interface SSEResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

async function parseSSE(
  response: Response,
  provider: Provider,
  onChunk: (text: string) => void
): Promise<SSEResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    logLLM("warn", `No response body to stream: provider=${provider}`);
    return { content: "", promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }

  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";
  let chunkCount = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  logLLM("log", `SSE stream started: provider=${provider}`);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
      try {
        const json = JSON.parse(line.slice(6));
        let delta = "";

        if (provider === "anthropic") {
          // delta text
          delta = json?.delta?.text ?? "";
          // message_start carries input_tokens
          if (json?.type === "message_start" && json?.message?.usage) {
            promptTokens = json.message.usage.input_tokens ?? 0;
          }
          // message_delta carries output_tokens
          if (json?.type === "message_delta" && json?.usage) {
            completionTokens = json.usage.output_tokens ?? 0;
            totalTokens = promptTokens + completionTokens;
          }
        } else if (provider === "google") {
          delta = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
          // usageMetadata appears on the final chunk
          if (json?.usageMetadata) {
            promptTokens = json.usageMetadata.promptTokenCount ?? 0;
            completionTokens = json.usageMetadata.candidatesTokenCount ?? 0;
            totalTokens = json.usageMetadata.totalTokenCount ?? 0;
          }
        } else {
          // OpenAI-compatible (openai, deepseek, grok)
          delta = json?.choices?.[0]?.delta?.content ?? "";
          // Final chunk with stream_options: { include_usage: true }
          if (json?.usage) {
            promptTokens = json.usage.prompt_tokens ?? 0;
            completionTokens = json.usage.completion_tokens ?? 0;
            totalTokens = json.usage.total_tokens ?? promptTokens + completionTokens;
          }
        }

        if (delta) {
          full += delta;
          chunkCount++;
          onChunk(delta);
        }
      } catch (err) {
        logLLM("warn", `Failed to parse SSE line: provider=${provider} line="${line.slice(0, 60)}" error=${err}`);
      }
    }
  }

  logLLM(
    "log",
    `SSE complete: provider=${provider} chunks=${chunkCount} chars=${full.length} tokens=${totalTokens} (p=${promptTokens} c=${completionTokens})`
  );
  return { content: full, promptTokens, completionTokens, totalTokens };
}

export async function callLLM(options: LLMCallOptions): Promise<LLMResponse> {
  const { provider, model, messages, stream = false, apiKeys, onChunk } = options;
  logLLM("log", `callLLM → provider=${provider} model=${model} messages=${messages.length} stream=${stream}`);

  if (provider === "anthropic") {
    const key = apiKeys.anthropic;
    if (!key) throw new Error("Anthropic API key not set");

    const { system, messages: msgs } = getAnthropicMessages(messages);
    const body: Record<string, unknown> = { model, max_tokens: 2048, messages: msgs, stream };
    if (system) body.system = system;

    logLLM("log", `Calling Anthropic API: model=${model} stream=${stream}`);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const raw = await res.text();
      throw new Error(`Anthropic: ${parseErrorMessage(raw)}`);
    }

    if (stream && onChunk) {
      const result = await parseSSE(res, "anthropic", onChunk);
      return result;
    }

    const data = await res.json();
    const content = (data.content as Array<{ type: string; text?: string }>)
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
    return {
      content,
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
      totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
    };
  }

  if (provider === "google") {
    const key = apiKeys.google;
    if (!key) throw new Error("Google API key not set");

    const parts = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const action = stream ? "streamGenerateContent" : "generateContent";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}?key=${key}${stream ? "&alt=sse" : ""}`;

    logLLM("log", `Calling Google API: model=${model} stream=${stream}`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: parts }),
    });

    if (!res.ok) {
      const raw = await res.text();
      throw new Error(`Google: ${parseErrorMessage(raw)}`);
    }

    if (stream && onChunk) {
      const result = await parseSSE(res, "google", onChunk);
      return result;
    }

    const data = await res.json();
    const content = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? "")
      .join("");
    return {
      content,
      promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
    };
  }

  // OpenAI-compatible: openai, deepseek, grok
  const endpointMap: Record<string, string> = {
    openai: "https://api.openai.com/v1/chat/completions",
    deepseek: "https://api.deepseek.com/chat/completions",
    grok: "https://api.x.ai/v1/chat/completions",
  };
  const keyMap: Record<string, string | undefined> = {
    openai: apiKeys.openai,
    deepseek: apiKeys.deepseek,
    grok: apiKeys.grok,
  };

  const key = keyMap[provider];
  if (!key) throw new Error(`${provider} API key not set`);

  const requestBody: Record<string, unknown> = { model, messages, stream };
  // Request token usage in the final SSE chunk (OpenAI-compatible spec)
  if (stream) requestBody.stream_options = { include_usage: true };

  logLLM("log", `Calling ${provider} API: model=${model} stream=${stream}`);
  const res = await fetch(endpointMap[provider], {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`${provider}: ${parseErrorMessage(raw)}`);
  }

  if (stream && onChunk) {
    const result = await parseSSE(res, provider, onChunk);
    return result;
  }

  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
    totalTokens: data.usage?.total_tokens ?? 0,
  };
}
