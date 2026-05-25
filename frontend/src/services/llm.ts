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

async function parseSSE(
  response: Response,
  provider: Provider,
  onChunk: (text: string) => void
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    logLLM("warn", `No response body to stream: provider=${provider}`);
    return "";
  }
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";
  let chunkCount = 0;

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
          delta = json?.delta?.text ?? "";
        } else if (provider === "google") {
          delta = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        } else {
          delta = json?.choices?.[0]?.delta?.content ?? "";
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

  logLLM("log", `SSE stream complete: provider=${provider} chunks=${chunkCount} chars=${full.length}`);
  return full;
}

export async function callLLM(options: LLMCallOptions): Promise<LLMResponse> {
  const { provider, model, messages, stream = false, apiKeys, onChunk } = options;
  logLLM("log", `callLLM → provider=${provider} model=${model} messages=${messages.length} stream=${stream}`);

  if (provider === "anthropic") {
    const key = apiKeys.anthropic;
    if (!key) {
      logLLM("error", "Anthropic API key not set");
      throw new Error("Anthropic API key not set");
    }
    const { system, messages: msgs } = getAnthropicMessages(messages);
    const body: Record<string, unknown> = {
      model,
      max_tokens: 2048,
      messages: msgs,
      stream,
    };
    if (system) body.system = system;

    logLLM("log", `Calling Anthropic API: model=${model} stream=${stream} system=${!!system}`);
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
      const err = await res.text();
      logLLM("error", `Anthropic API error: status=${res.status} body=${err}`);
      throw new Error(`Anthropic error: ${err}`);
    }

    if (stream && onChunk) {
      const content = await parseSSE(res, "anthropic", onChunk);
      return { content, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    }

    const data = await res.json();
    const contentBlocks: Array<{ type: string; text?: string }> = Array.isArray(data.content)
      ? data.content
      : [];
    const content = contentBlocks
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
    const tokens = {
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
      totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
    };
    logLLM("log", `Anthropic response: chars=${content.length} tokens=${tokens.totalTokens}`);
    return { content, ...tokens };
  }

  if (provider === "google") {
    const key = apiKeys.google;
    if (!key) {
      logLLM("error", "Google API key not set");
      throw new Error("Google API key not set");
    }
    const parts = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${stream ? "streamGenerateContent" : "generateContent"}?key=${key}${stream ? "&alt=sse" : ""}`;
    logLLM("log", `Calling Google API: model=${model} stream=${stream} turns=${parts.length}`);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: parts }),
    });

    if (!res.ok) {
      const err = await res.text();
      logLLM("error", `Google API error: status=${res.status} body=${err}`);
      throw new Error(`Google error: ${err}`);
    }

    if (stream && onChunk) {
      const content = await parseSSE(res, "google", onChunk);
      return { content, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    }

    const data = await res.json();
    const content = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? "")
      .join("");
    const tokens = {
      promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
    };
    logLLM("log", `Google response: chars=${content.length} tokens=${tokens.totalTokens}`);
    return { content, ...tokens };
  }

  // OpenAI-compatible: openai, deepseek, grok
  const endpointMap: Record<string, string> = {
    openai: "https://api.openai.com/v1/chat/completions",
    deepseek: "https://api.deepseek.com/chat/completions",
    grok: "https://api.x.ai/v1/chat/completions",
  };
  const keyMap: Record<string, string> = {
    openai: apiKeys.openai,
    deepseek: apiKeys.deepseek,
    grok: apiKeys.grok,
  };

  const key = keyMap[provider];
  if (!key) {
    logLLM("error", `${provider} API key not set`);
    throw new Error(`${provider} API key not set`);
  }

  logLLM("log", `Calling ${provider} API: endpoint=${endpointMap[provider]} model=${model} stream=${stream}`);
  const res = await fetch(endpointMap[provider], {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, messages, stream }),
  });

  if (!res.ok) {
    const err = await res.text();
    logLLM("error", `${provider} API error: status=${res.status} body=${err}`);
    throw new Error(`${provider} error: ${err}`);
  }

  if (stream && onChunk) {
    const content = await parseSSE(res, provider, onChunk);
    return { content, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  const tokens = {
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
    totalTokens: data.usage?.total_tokens ?? 0,
  };
  logLLM("log", `${provider} response: chars=${content.length} tokens=${tokens.totalTokens}`);
  return { content, ...tokens };
}
