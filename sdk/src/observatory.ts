import type {
  LLMObservatoryConfig,
  ChatMessage,
  WrapFetchOptions,
  WrapStreamOptions,
  LogPayload,
  TokenUsage,
} from "./types";
import { preview, redact } from "./pii";

const RETRY_DELAYS = [200, 600, 1400];
const TAG = "[InferIQ:SDK]";

function log(level: "log" | "warn" | "error", ...args: unknown[]) {
  console[level](TAG, ...args);
}

function extractTokenUsage(body: unknown, provider?: string): TokenUsage {
  if (!body || typeof body !== "object") {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }
  const b = body as Record<string, unknown>;

  // Anthropic: { usage: { input_tokens, output_tokens } }
  if (provider === "anthropic" && b.usage && typeof b.usage === "object") {
    const u = b.usage as Record<string, number>;
    if ("input_tokens" in u) {
      return {
        promptTokens: u.input_tokens ?? 0,
        completionTokens: u.output_tokens ?? 0,
        totalTokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
      };
    }
  }

  // Google Gemini: { usageMetadata: { promptTokenCount, candidatesTokenCount, totalTokenCount } }
  if (b.usageMetadata && typeof b.usageMetadata === "object") {
    const u = b.usageMetadata as Record<string, number>;
    return {
      promptTokens: u.promptTokenCount ?? 0,
      completionTokens: u.candidatesTokenCount ?? 0,
      totalTokens: u.totalTokenCount ?? 0,
    };
  }

  // OpenAI / DeepSeek / Grok: { usage: { prompt_tokens, completion_tokens, total_tokens } }
  if (b.usage && typeof b.usage === "object") {
    const u = b.usage as Record<string, number>;
    return {
      promptTokens: u.prompt_tokens ?? 0,
      completionTokens: u.completion_tokens ?? 0,
      totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
    };
  }

  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function extractContent(body: unknown, provider: string): string {
  if (!body || typeof body !== "object") return "";
  const b = body as Record<string, unknown>;

  if (provider === "anthropic") {
    const content = b.content;
    if (Array.isArray(content)) {
      return content
        .filter((c): c is { type: string; text?: string } => c?.type === "text")
        .map((c) => c.text ?? "")
        .join("");
    }
  }

  if (provider === "google") {
    const candidates = b.candidates;
    if (Array.isArray(candidates) && candidates[0]?.content?.parts) {
      return (candidates[0].content.parts as Array<{ text?: string }>)
        .map((p) => p.text ?? "")
        .join("");
    }
  }

  // OpenAI-compatible
  const choices = b.choices;
  if (Array.isArray(choices) && choices[0]) {
    return (
      (choices[0] as Record<string, Record<string, string>>).message?.content ??
      (choices[0] as Record<string, Record<string, string>>).delta?.content ??
      ""
    );
  }

  return "";
}

function getLastUserMessage(messages: ChatMessage[]): string {
  const userMsgs = messages.filter((m) => m.role === "user");
  return userMsgs[userMsgs.length - 1]?.content ?? "";
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Parse a single SSE data line and extract token delta + usage if present */
function parseSSELine(line: string, provider: string): { delta: string; usage?: TokenUsage } {
  if (!line.startsWith("data: ") || line.includes("[DONE]")) return { delta: "" };
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

    const usage = extractTokenUsage(json, provider);
    const hasUsage = usage.promptTokens > 0 || usage.completionTokens > 0 || usage.totalTokens > 0;

    return { delta, usage: hasUsage ? usage : undefined };
  } catch {
    return { delta: "" };
  }
}

export class LLMObservatory {
  private config: Required<LLMObservatoryConfig>;

  constructor(config: LLMObservatoryConfig) {
    this.config = {
      ingestionEndpoint: config.ingestionEndpoint,
      defaultProvider: config.defaultProvider ?? "unknown",
      defaultModel: config.defaultModel ?? "unknown",
      enablePIIRedaction: config.enablePIIRedaction ?? true,
      onError: config.onError ?? ((err) => log("warn", err.message)),
    };
    log("log", `Initialized — endpoint="${this.config.ingestionEndpoint}" pii=${this.config.enablePIIRedaction}`);
  }

  private maybeRedact(text: string): string {
    return this.config.enablePIIRedaction ? redact(text) : text;
  }

  private async sendLog(payload: LogPayload): Promise<void> {
    const url = `${this.config.ingestionEndpoint}/api/ingest/log`;
    log("log", `Sending log → provider=${payload.provider} model=${payload.model} tokens=${payload.total_tokens} latency=${payload.latency_ms?.toFixed(0)}ms status=${payload.status}`);

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          if (attempt > 0) log("log", `Log sent after ${attempt} retries`);
          return;
        }
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${body}`);
      } catch (err) {
        if (attempt < RETRY_DELAYS.length) {
          log("warn", `Send attempt ${attempt + 1} failed — retrying in ${RETRY_DELAYS[attempt]}ms: ${err}`);
          await sleep(RETRY_DELAYS[attempt]);
        } else {
          log("error", `All ${RETRY_DELAYS.length + 1} send attempts failed: ${err}`);
          this.config.onError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }
  }

  async wrapFetch(options: WrapFetchOptions): Promise<Response> {
    const requestTimestamp = new Date().toISOString();
    const userMsg = getLastUserMessage(options.messages);
    log("log", `wrapFetch → provider=${options.provider} model=${options.model} conv=${options.conversationId.slice(0, 8)}`);

    let response: Response;
    let errorMessage: string | undefined;
    let status: "success" | "error" = "success";

    try {
      response = await options.fetchFn();
    } catch (err) {
      status = "error";
      errorMessage = err instanceof Error ? err.message : String(err);
      log("error", `fetchFn threw: provider=${options.provider} model=${options.model} error=${errorMessage}`);

      const responseTimestamp = new Date().toISOString();
      const latency = new Date(responseTimestamp).getTime() - new Date(requestTimestamp).getTime();

      void this.sendLog({
        conversation_id: options.conversationId,
        session_id: options.sessionId,
        provider: options.provider,
        model: options.model,
        latency_ms: latency,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        status,
        error_message: errorMessage,
        request_timestamp: requestTimestamp,
        response_timestamp: responseTimestamp,
        input_preview: preview(this.maybeRedact(userMsg)),
        output_preview: "",
        stream: options.stream ?? false,
        role_user_message: this.maybeRedact(userMsg),
        role_assistant_message: "",
      });
      throw err;
    }

    const responseTimestamp = new Date().toISOString();
    const latency = new Date(responseTimestamp).getTime() - new Date(requestTimestamp).getTime();

    const cloned = response.clone();
    const body = await cloned.json().catch(() => null);
    const tokens = extractTokenUsage(body, options.provider);
    const assistantContent = extractContent(body, options.provider);

    log("log", `wrapFetch complete → latency=${latency}ms tokens=${tokens.totalTokens} (prompt=${tokens.promptTokens} completion=${tokens.completionTokens})`);

    void this.sendLog({
      conversation_id: options.conversationId,
      session_id: options.sessionId,
      provider: options.provider,
      model: options.model,
      latency_ms: latency,
      prompt_tokens: tokens.promptTokens,
      completion_tokens: tokens.completionTokens,
      total_tokens: tokens.totalTokens,
      status,
      error_message: errorMessage,
      request_timestamp: requestTimestamp,
      response_timestamp: responseTimestamp,
      input_preview: preview(this.maybeRedact(userMsg)),
      output_preview: preview(this.maybeRedact(assistantContent)),
      stream: options.stream ?? false,
      role_user_message: this.maybeRedact(userMsg),
      role_assistant_message: this.maybeRedact(assistantContent),
    });

    return response;
  }

  async wrapStream(options: WrapStreamOptions): Promise<Response> {
    const requestTimestamp = new Date().toISOString();
    const userMsg = getLastUserMessage(options.messages);
    log("log", `wrapStream → provider=${options.provider} model=${options.model} conv=${options.conversationId.slice(0, 8)}`);

    let response: Response;

    try {
      response = await options.fetchFn();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log("error", `fetchFn threw during stream: provider=${options.provider} error=${errorMessage}`);

      const responseTimestamp = new Date().toISOString();
      const latency = new Date(responseTimestamp).getTime() - new Date(requestTimestamp).getTime();
      void this.sendLog({
        conversation_id: options.conversationId,
        session_id: options.sessionId,
        provider: options.provider,
        model: options.model,
        latency_ms: latency,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        status: "error",
        error_message: errorMessage,
        request_timestamp: requestTimestamp,
        response_timestamp: responseTimestamp,
        input_preview: preview(this.maybeRedact(userMsg)),
        output_preview: "",
        stream: true,
        role_user_message: this.maybeRedact(userMsg),
        role_assistant_message: "",
      });
      throw err;
    }

    const chunks: string[] = [];
    let streamTokens: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const provider = options.provider;
    const decoder = new TextDecoder();
    const originalBody = response.body;
    if (!originalBody) return response;

    let buffer = "";
    let chunkCount = 0;
    const transformStream = new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        controller.enqueue(chunk);
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const { delta, usage } = parseSSELine(line.trim(), provider);
          if (delta) {
            chunks.push(delta);
            chunkCount++;
            options.onChunk?.(delta);
          }
          if (usage) {
            streamTokens = usage;
            log("log", `Token usage captured from SSE: prompt=${usage.promptTokens} completion=${usage.completionTokens} total=${usage.totalTokens}`);
          }
        }
      },
      flush: (controller) => {
        if (buffer) {
          const { delta, usage } = parseSSELine(buffer.trim(), provider);
          if (delta) chunks.push(delta);
          if (usage) streamTokens = usage;
        }
        controller.terminate();

        const responseTimestamp = new Date().toISOString();
        const latency = new Date(responseTimestamp).getTime() - new Date(requestTimestamp).getTime();
        const assistantContent = chunks.join("");

        log("log", `wrapStream complete → latency=${latency}ms chunks=${chunkCount} chars=${assistantContent.length} tokens=${streamTokens.totalTokens}`);

        void this.sendLog({
          conversation_id: options.conversationId,
          session_id: options.sessionId,
          provider: options.provider,
          model: options.model,
          latency_ms: latency,
          prompt_tokens: streamTokens.promptTokens,
          completion_tokens: streamTokens.completionTokens,
          total_tokens: streamTokens.totalTokens,
          status: "success",
          request_timestamp: requestTimestamp,
          response_timestamp: responseTimestamp,
          input_preview: preview(this.maybeRedact(userMsg)),
          output_preview: preview(this.maybeRedact(assistantContent)),
          stream: true,
          role_user_message: this.maybeRedact(userMsg),
          role_assistant_message: this.maybeRedact(assistantContent),
        });
      },
    });

    const newBody = originalBody.pipeThrough(transformStream);
    return new Response(newBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }
}
