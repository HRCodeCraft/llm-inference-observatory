export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LLMObservatoryConfig {
  ingestionEndpoint: string;
  defaultProvider?: string;
  defaultModel?: string;
  enablePIIRedaction?: boolean;
  onError?: (err: Error) => void;
}

export interface WrapFetchOptions {
  conversationId: string;
  sessionId: string;
  provider: string;
  model: string;
  messages: ChatMessage[];
  fetchFn: () => Promise<Response>;
  stream?: boolean;
}

export interface WrapStreamOptions {
  conversationId: string;
  sessionId: string;
  provider: string;
  model: string;
  messages: ChatMessage[];
  fetchFn: () => Promise<Response>;
  onChunk?: (chunk: string) => void;
}

export interface LogPayload {
  conversation_id: string;
  session_id: string;
  provider: string;
  model: string;
  latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  status: "success" | "error";
  error_message?: string;
  request_timestamp: string;
  response_timestamp: string;
  input_preview: string;
  output_preview: string;
  stream: boolean;
  role_user_message: string;
  role_assistant_message: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}
