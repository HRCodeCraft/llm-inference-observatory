import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { v4 as uuidv4 } from "uuid";
import { useStore } from "../store";
import { callLLM, ChatMessage, Provider } from "../services/llm";
import { LLMObservatory } from "@observatory/sdk";
import { LatencyBadge } from "../components/LatencyBadge";
import { CopyButton } from "../components/CopyButton";

const MODELS: { provider: Provider; model: string; label: string; color: string }[] = [
  { provider: "openai", model: "gpt-4.1", label: "GPT-4.1", color: "#00A67E" },
  { provider: "anthropic", model: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", color: "#FF6B35" },
  { provider: "google", model: "gemini-2.0-flash", label: "Gemini 2.0 Flash", color: "#4285F4" },
  { provider: "deepseek", model: "deepseek-chat", label: "DeepSeek Chat", color: "#9D00FF" },
  { provider: "grok", model: "grok-2-latest", label: "Grok 2", color: "#00E5FF" },
];

interface LocalMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface InferenceMeta {
  latency_ms: number;
  total_tokens: number;
  model: string;
  provider: string;
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="chat-bubble-assistant px-4 py-3">
        <div className="flex gap-1.5 items-center">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </div>
      </div>
    </div>
  );
}

export function Chat() {
  const { apiKeys, addToast, theme } = useStore();
  const [selectedModel, setSelectedModel] = useState(MODELS[4]);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showMetaPanel, setShowMetaPanel] = useState(false);
  const [lastMeta, setLastMeta] = useState<InferenceMeta | null>(null);
  const sessionId = useRef(uuidv4());
  const conversationId = useRef(uuidv4());
  const bottomRef = useRef<HTMLDivElement>(null);

  const sdk = useMemo(
    () => new LLMObservatory({ ingestionEndpoint: import.meta.env.VITE_INGESTION_URL || "", enablePIIRedaction: true }),
    []
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const userText = input.trim();
    setInput("");

    const userMsg: LocalMessage = { id: uuidv4(), role: "user", content: userText };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    const context: ChatMessage[] = messages.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    context.push({ role: "user", content: userText });

    const assistantId = uuidv4();
    let fullContent = "";
    const startTime = Date.now();

    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const result = await callLLM({
        provider: selectedModel.provider,
        model: selectedModel.model,
        messages: context,
        stream: true,
        apiKeys,
        onChunk: (chunk) => {
          fullContent += chunk;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: fullContent } : m))
          );
        },
      });

      const latency = Date.now() - startTime;
      const meta: InferenceMeta = {
        latency_ms: latency,
        total_tokens: result.totalTokens,
        model: selectedModel.model,
        provider: selectedModel.provider,
      };
      setLastMeta(meta);
      setShowMetaPanel(true);

      await sdk.wrapFetch({
        conversationId: conversationId.current,
        sessionId: sessionId.current,
        provider: selectedModel.provider,
        model: selectedModel.model,
        messages: context,
        fetchFn: async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: fullContent } }],
              usage: {
                prompt_tokens: result.promptTokens,
                completion_tokens: result.completionTokens,
                total_tokens: result.totalTokens,
              },
            })
          ),
        stream: true,
      });
    } catch (err) {
      addToast({ type: "error", message: err instanceof Error ? err.message : "LLM call failed" });
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setIsStreaming(false);
    }
  };

  const handleNewConversation = () => {
    setMessages([]);
    conversationId.current = uuidv4();
    sessionId.current = uuidv4();
    setLastMeta(null);
    setShowMetaPanel(false);
  };

  const selectBg = theme === "dark" ? "#020408" : "#ffffff";

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header bar */}
        <div
          className="flex items-center gap-4 px-5 py-3 border-b flex-shrink-0"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="font-heading font-bold text-base tracking-wide" style={{ color: "var(--text-primary)" }}>
            New Chat
          </span>

          {/* Model selector */}
          <div className="flex items-center gap-2 ml-2">
            <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
              Model:
            </span>
            <div className="relative">
              <select
                value={`${selectedModel.provider}/${selectedModel.model}`}
                onChange={(e) => {
                  const found = MODELS.find((m) => `${m.provider}/${m.model}` === e.target.value);
                  if (found) setSelectedModel(found);
                }}
                className="appearance-none pl-6 pr-8 py-1.5 rounded-lg text-xs font-mono cursor-pointer"
                style={{
                  background: "var(--input-bg)",
                  border: "1px solid var(--input-border)",
                  color: "var(--text-secondary)",
                }}
              >
                {MODELS.map((m) => (
                  <option key={`${m.provider}/${m.model}`} value={`${m.provider}/${m.model}`}
                    style={{ background: selectBg }}
                  >
                    {m.label}
                  </option>
                ))}
              </select>
              <span
                className="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none"
                style={{ background: selectedModel.color }}
              />
            </div>
          </div>

          <button
            onClick={handleNewConversation}
            className="ml-auto text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
            }}
          >
            New Session
          </button>

          <button
            onClick={() => setShowMetaPanel((p) => !p)}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: showMetaPanel ? "rgba(0,229,255,0.1)" : "var(--surface)",
              border: `1px solid ${showMetaPanel ? "rgba(0,229,255,0.25)" : "var(--border)"}`,
              color: showMetaPanel ? "var(--cyan)" : "var(--text-muted)",
            }}
          >
            ⬡ Meta
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full gap-6"
            >
              <div
                className="text-7xl"
                style={{ filter: "drop-shadow(0 0 32px rgba(0,229,255,0.4))" }}
              >
                ◎
              </div>
              <div className="text-center">
                <div className="font-heading text-2xl font-bold mb-2" style={{ color: "var(--text-secondary)" }}>
                  Start a Conversation
                </div>
                <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                  All inference metadata is automatically logged to InferIQ
                </div>
              </div>
            </motion.div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex group ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className="flex flex-col gap-1 max-w-2xl">
                  <div
                    className={`px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user" ? "chat-bubble-user" : "chat-bubble-assistant"
                    }`}
                  >
                    {msg.content ? (
                      <span style={{ color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                        {msg.content}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }} className="italic">
                        thinking...
                      </span>
                    )}
                  </div>
                  {msg.content && (
                    <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} px-1`}>
                      <CopyButton text={msg.content} />
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isStreaming && messages[messages.length - 1]?.role === "user" && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div
          className="flex-shrink-0 px-5 py-4 border-t flex gap-3 items-end"
          style={{ borderColor: "var(--border)" }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={`Message ${selectedModel.label}… (Enter ↵ send · Ctrl+Enter newline)`}
            rows={3}
            className="flex-1 px-4 py-3 rounded-xl text-sm resize-none"
            style={{
              background: "var(--input-bg)",
              border: "1px solid var(--input-border)",
              color: "var(--text-primary)",
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="px-5 py-3 rounded-xl font-medium text-sm transition-all flex-shrink-0 h-fit disabled:opacity-40"
            style={{
              background: input.trim() && !isStreaming ? "rgba(0,229,255,0.15)" : "var(--surface)",
              border: "1px solid rgba(0,229,255,0.3)",
              color: "var(--cyan)",
            }}
          >
            {isStreaming ? "..." : "Send"}
          </button>
        </div>
      </div>

      {/* Meta panel */}
      <AnimatePresence>
        {showMetaPanel && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 256, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex-shrink-0 border-l overflow-hidden"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="w-64 flex flex-col gap-4 p-4 h-full overflow-y-auto">
              <span className="text-xs font-mono uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                Inference Metadata
              </span>

              {lastMeta ? (
                <div className="flex flex-col gap-3">
                  {[
                    { label: "Provider", value: lastMeta.provider },
                    { label: "Model", value: lastMeta.model },
                    { label: "Tokens", value: lastMeta.total_tokens > 0 ? lastMeta.total_tokens.toLocaleString() : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex flex-col gap-1">
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
                      <span className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>{value}</span>
                    </div>
                  ))}
                  <div className="flex flex-col gap-1">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>Latency</span>
                    <LatencyBadge ms={lastMeta.latency_ms} />
                  </div>
                </div>
              ) : (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Metadata appears after first response
                </span>
              )}

              <div
                className="mt-4 p-3 rounded-lg"
                style={{ background: "rgba(0,229,255,0.04)", border: "1px solid rgba(0,229,255,0.1)" }}
              >
                <div className="text-xs font-mono mb-2" style={{ color: "var(--text-muted)" }}>
                  Session
                </div>
                <div className="text-xs font-mono break-all" style={{ color: "var(--cyan)" }}>
                  {sessionId.current.slice(0, 16)}...
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
