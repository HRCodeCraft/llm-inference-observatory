import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { v4 as uuidv4 } from "uuid";
import { api, Message } from "../services/api";
import { StatusBadge } from "../components/StatusBadge";
import { LatencyBadge } from "../components/LatencyBadge";
import { CopyButton } from "../components/CopyButton";
import { useStore } from "../store";
import { callLLM, Provider } from "../services/llm";
import { LLMObservatory } from "@observatory/sdk";

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 max-w-lg">
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

type LocalMessage = { role: string; content: string; id: string };

function ChatMessageBubble({
  msg,
  onEdit,
  isTyping,
}: {
  msg: LocalMessage;
  onEdit?: (id: string, currentContent: string) => void;
  isTyping: boolean;
}) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex group ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div className="flex flex-col gap-1 max-w-xl">
        <div className={`px-4 py-3 text-sm leading-relaxed ${isUser ? "chat-bubble-user" : "chat-bubble-assistant"}`}>
          <span style={{ color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
            {msg.content}
          </span>
        </div>
        {msg.content && (
          <div className={`flex ${isUser ? "justify-end" : "justify-start"} gap-2 px-1`}>
            <CopyButton text={msg.content} />
            {isUser && onEdit && !isTyping && (
              <button
                onClick={() => onEdit(msg.id, msg.content)}
                className="copy-btn text-xs px-2 py-0.5 rounded transition-all font-mono"
                style={{
                  color: "var(--cyan)",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              >
                ✎ Edit & Retry
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Edit message modal ──────────────────────────────────────────────────────
function EditMessageModal({
  initialContent,
  onSubmit,
  onCancel,
}: {
  initialContent: string;
  onSubmit: (newContent: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initialContent);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        className="card w-full max-w-lg p-6 flex flex-col gap-4"
      >
        <h2 className="font-heading font-bold text-base" style={{ color: "var(--cyan)" }}>
          Edit Message & Retry
        </h2>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          The conversation will be replayed from this message onwards with your edited version.
        </p>
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (draft.trim()) onSubmit(draft.trim());
            }
            if (e.key === "Escape") onCancel();
          }}
          rows={5}
          className="w-full px-4 py-3 rounded-xl text-sm resize-none"
          style={{
            background: "var(--input-bg)",
            border: "1px solid var(--input-border)",
            color: "var(--text-primary)",
          }}
        />
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg text-sm transition-colors"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={() => draft.trim() && onSubmit(draft.trim())}
            disabled={!draft.trim()}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
            style={{ background: "rgba(0,229,255,0.12)", border: "1px solid rgba(0,229,255,0.3)", color: "var(--cyan)" }}
          >
            Retry with Edit  <span className="opacity-50 text-xs ml-1">Ctrl+Enter</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Confirm delete modal ────────────────────────────────────────────────────
function ConfirmDeleteModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        className="card w-full max-w-sm p-6 flex flex-col gap-4"
      >
        <div className="flex items-start gap-3">
          <span className="text-2xl">⚠</span>
          <div>
            <h2 className="font-heading font-bold text-base mb-1" style={{ color: "var(--text-primary)" }}>
              Delete Conversation?
            </h2>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              All messages and inference logs will be permanently removed. This cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg text-sm"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 rounded-lg text-sm font-medium"
            style={{ background: "rgba(255,51,102,0.12)", border: "1px solid rgba(255,51,102,0.3)", color: "var(--danger)" }}
          >
            Delete
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export function ConversationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { apiKeys, addToast } = useStore();
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [editTarget, setEditTarget] = useState<{ id: string; content: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: conv, isLoading } = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => api.conversations.get(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (conv?.messages) {
      setLocalMessages(conv.messages.map((m) => ({ role: m.role, content: m.content, id: m.id })));
    }
  }, [conv?.id, conv?.messages?.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages, isTyping]);

  const sdk = useMemo(
    () => new LLMObservatory({ ingestionEndpoint: import.meta.env.VITE_INGESTION_URL || "", enablePIIRedaction: true }),
    []
  );

  const renameMutation = useMutation({
    mutationFn: (title: string) => api.conversations.update(id!, { title }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["conversation", id], (old: typeof conv) =>
        old ? { ...old, title: updated.title } : old
      );
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      addToast({ type: "success", message: "Renamed" });
    },
    onError: () => addToast({ type: "error", message: "Failed to rename" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.conversations.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      addToast({ type: "success", message: "Conversation deleted" });
      navigate("/conversations");
    },
    onError: () => addToast({ type: "error", message: "Failed to delete" }),
  });

  const runInference = async (context: Array<{ role: "user" | "assistant" | "system"; content: string }>) => {
    if (!conv) return;
    setIsTyping(true);
    const assistantMsgId = uuidv4();
    let fullText = "";
    setLocalMessages((prev) => [...prev, { role: "assistant", content: "", id: assistantMsgId }]);
    try {
      await sdk.wrapStream({
        conversationId: conv.id,
        sessionId: conv.session_id,
        provider: conv.provider,
        model: conv.model,
        messages: context,
        fetchFn: () =>
          callLLM({
            provider: conv.provider as Provider,
            model: conv.model,
            messages: context,
            stream: true,
            apiKeys,
            onChunk: (chunk) => {
              fullText += chunk;
              setLocalMessages((prev) =>
                prev.map((m) => (m.id === assistantMsgId ? { ...m, content: fullText } : m))
              );
            },
          }).then(() => new Response()),
        onChunk: () => {},
      });
    } catch (err) {
      addToast({ type: "error", message: err instanceof Error ? err.message : "LLM error" });
      setLocalMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
    } finally {
      setIsTyping(false);
      queryClient.invalidateQueries({ queryKey: ["conversation", id] });
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !conv || conv.status === "cancelled") return;
    const userText = input.trim();
    setInput("");
    const userMsgId = uuidv4();
    setLocalMessages((prev) => [...prev, { role: "user", content: userText, id: userMsgId }]);
    const context = [...localMessages, { role: "user" as const, content: userText }]
      .slice(-10)
      .map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content }));
    await runInference(context);
  };

  // Edit a user message and replay the conversation from that point
  const handleEditRetry = async (newContent: string) => {
    if (!conv || !editTarget) return;
    setEditTarget(null);

    const idx = localMessages.findIndex((m) => m.id === editTarget.id);
    // Keep history up to (not including) the edited message, then add the edited version
    const historyBefore = localMessages.slice(0, idx);
    const editedMsg: LocalMessage = { id: uuidv4(), role: "user", content: newContent };
    setLocalMessages([...historyBefore, editedMsg]);

    const context = [...historyBefore, editedMsg]
      .slice(-10)
      .map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content }));
    await runInference(context);
  };

  const startTitleEdit = () => {
    setDraftTitle(conv?.title ?? "");
    setEditingTitle(true);
  };

  const commitTitleEdit = () => {
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== conv?.title) renameMutation.mutate(trimmed);
    setEditingTitle(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="font-mono text-sm" style={{ color: "var(--text-muted)" }}>Loading conversation...</span>
      </div>
    );
  }

  if (!conv) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <span className="text-4xl">◎</span>
        <span style={{ color: "var(--text-secondary)" }}>Conversation not found</span>
        <button
          onClick={() => navigate("/conversations")}
          className="text-sm px-4 py-2 rounded-lg"
          style={{ background: "rgba(0,229,255,0.1)", color: "var(--cyan)", border: "1px solid rgba(0,229,255,0.2)" }}
        >
          Back to conversations
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Modals */}
      <AnimatePresence>
        {editTarget && (
          <EditMessageModal
            initialContent={editTarget.content}
            onSubmit={handleEditRetry}
            onCancel={() => setEditTarget(null)}
          />
        )}
        {showDeleteConfirm && (
          <ConfirmDeleteModal
            onConfirm={() => { setShowDeleteConfirm(false); deleteMutation.mutate(); }}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <div
        className="w-64 flex-shrink-0 border-r flex flex-col gap-4 p-4 overflow-y-auto"
        style={{ borderColor: "var(--border)" }}
      >
        <div>
          <div className="text-xs font-mono uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
            Conversation
          </div>
          <StatusBadge status={conv.status} size="md" />
        </div>

        {[
          { label: "Provider", value: conv.provider },
          { label: "Model", value: conv.model },
          { label: "Messages", value: conv.message_count.toString() },
          { label: "Session", value: conv.session_id.slice(0, 12) + "..." },
          { label: "Created", value: new Date(conv.created_at).toLocaleDateString() },
        ].map(({ label, value }) => (
          <div key={label} className="py-2 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>{label}</div>
            <div className="text-sm font-mono truncate" style={{ color: "var(--text-secondary)" }}>{value}</div>
          </div>
        ))}

        {/* Rename */}
        {editingTitle ? (
          <div className="flex gap-1">
            <input
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitTitleEdit(); if (e.key === "Escape") setEditingTitle(false); }}
              onBlur={commitTitleEdit}
              className="flex-1 px-2 py-1 rounded text-xs"
              style={{ background: "var(--input-bg)", border: "1px solid var(--cyan)", color: "var(--text-primary)", outline: "none" }}
            />
          </div>
        ) : (
          <button
            onClick={startTitleEdit}
            className="py-2 rounded-lg text-xs transition-colors text-left"
            style={{ background: "var(--surface)", color: "var(--cyan)", border: "1px solid var(--border)" }}
          >
            ✎ Rename
          </button>
        )}

        {/* Export */}
        <button
          onClick={() => {
            const exportData = {
              conversation: { id: conv.id, session_id: conv.session_id, title: conv.title, provider: conv.provider, model: conv.model, status: conv.status, message_count: conv.message_count, created_at: conv.created_at },
              messages: localMessages.map((m) => ({ role: m.role, content: m.content })),
              exported_at: new Date().toISOString(),
            };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `conversation-${conv.id.slice(0, 8)}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="py-2 rounded-lg text-xs transition-colors"
          style={{ background: "var(--surface)", color: "var(--cyan)", border: "1px solid var(--border)" }}
        >
          ↓ Export JSON
        </button>

        {/* Delete */}
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="py-2 rounded-lg text-xs transition-colors"
          style={{ background: "rgba(255,51,102,0.06)", color: "var(--danger)", border: "1px solid rgba(255,51,102,0.2)" }}
        >
          🗑 Delete
        </button>

        <button
          onClick={() => navigate("/conversations")}
          className="py-2 rounded-lg text-xs transition-colors"
          style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
        >
          ← Back
        </button>
      </div>

      {/* Chat panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <div
          className="flex items-center gap-3 px-5 py-3 border-b flex-shrink-0"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="font-heading font-semibold text-base truncate" style={{ color: "var(--text-primary)" }}>
            {conv.title ?? "Untitled"}
          </span>
          {isTyping && (
            <span className="text-xs font-mono" style={{ color: "var(--cyan)" }}>
              generating…
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {localMessages.map((msg) => (
              <ChatMessageBubble
                key={msg.id}
                msg={msg}
                isTyping={isTyping}
                onEdit={msg.role === "user" ? (msgId, content) => setEditTarget({ id: msgId, content }) : undefined}
              />
            ))}
          </AnimatePresence>
          {isTyping && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {conv.status !== "cancelled" && (
          <div
            className="flex-shrink-0 px-5 py-4 border-t flex gap-3"
            style={{ borderColor: "var(--border)" }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder="Continue the conversation… (Enter ↵ send · Ctrl+Enter newline)"
              rows={2}
              className="flex-1 px-4 py-3 rounded-xl text-sm resize-none"
              style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text-primary)" }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              className="px-5 py-3 rounded-xl font-medium text-sm transition-all flex-shrink-0 disabled:opacity-40"
              style={{
                background: input.trim() && !isTyping ? "rgba(0,229,255,0.15)" : "var(--surface)",
                border: "1px solid rgba(0,229,255,0.3)",
                color: "var(--cyan)",
              }}
            >
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
