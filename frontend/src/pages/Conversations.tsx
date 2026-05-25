import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { api, Conversation } from "../services/api";
import { StatusBadge } from "../components/StatusBadge";
import { SkeletonRow } from "../components/Skeleton";
import { useStore } from "../store";

const PROVIDER_COLOR: Record<string, string> = {
  anthropic: "#FF6B35",
  openai: "#00A67E",
  google: "#4285F4",
  deepseek: "#9D00FF",
  grok: "#00E5FF",
};

// ── Confirm Delete Modal ────────────────────────────────────────────────────
function ConfirmDeleteModal({
  conv,
  onConfirm,
  onCancel,
}: {
  conv: Conversation;
  onConfirm: () => void;
  onCancel: () => void;
}) {
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
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                {conv.title ?? `Session ${conv.session_id.slice(0, 8)}`}
              </span>{" "}
              and all its messages will be permanently deleted. This cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg text-sm transition-colors"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: "rgba(255,51,102,0.12)", border: "1px solid rgba(255,51,102,0.3)", color: "var(--danger)" }}
          >
            Delete
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Conversation Row ────────────────────────────────────────────────────────
function ConversationRow({
  conv,
  onCancel,
  onDelete,
  onRename,
}: {
  conv: Conversation;
  onCancel: (id: string) => void;
  onDelete: (conv: Conversation) => void;
  onRename: (id: string, title: string) => void;
}) {
  const navigate = useNavigate();
  const providerColor = PROVIDER_COLOR[conv.provider.toLowerCase()] ?? "#00E5FF";
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(conv.title ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraftTitle(conv.title ?? "");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commitEdit = () => {
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== conv.title) {
      onRename(conv.id, trimmed);
    }
    setEditing(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="card card-glow flex items-center gap-4 p-4"
      style={{ borderColor: "var(--border)", cursor: editing ? "default" : "pointer" }}
      onClick={() => !editing && navigate(`/conversations/${conv.id}`)}
    >
      {/* Title / inline edit */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {editing ? (
            <input
              ref={inputRef}
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") setEditing(false);
              }}
              onBlur={commitEdit}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 px-2 py-0.5 rounded text-sm font-medium min-w-0"
              style={{
                background: "var(--input-bg)",
                border: "1px solid var(--cyan)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          ) : (
            <span className="font-medium text-sm truncate" style={{ color: "var(--text-primary)" }}>
              {conv.title ?? `Session ${conv.session_id.slice(0, 8)}`}
            </span>
          )}
          <StatusBadge status={conv.status} />
        </div>
        <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
          {conv.session_id.slice(0, 16)}...
        </span>
      </div>

      {/* Provider + model */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          className="text-xs px-2 py-0.5 rounded font-mono"
          style={{ background: `${providerColor}18`, color: providerColor, border: `1px solid ${providerColor}30` }}
        >
          {conv.provider}
        </span>
        <span
          className="text-xs px-2 py-0.5 rounded font-mono hidden md:block"
          style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
        >
          {conv.model}
        </span>
      </div>

      {/* Message count */}
      <div className="flex-shrink-0 text-center hidden md:block">
        <div className="text-sm font-heading font-bold" style={{ color: "var(--cyan)" }}>
          {conv.message_count}
        </div>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>msgs</div>
      </div>

      {/* Time */}
      <div className="flex-shrink-0 text-right hidden lg:block">
        <div className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
          {new Date(conv.updated_at).toLocaleDateString()}
        </div>
        <div className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
          {new Date(conv.updated_at).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        {/* Rename */}
        <button
          onClick={startEdit}
          title="Rename"
          className="px-2 py-1.5 rounded-lg text-xs transition-all"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
          onMouseOver={(e) => (e.currentTarget.style.color = "var(--cyan)")}
          onMouseOut={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
        >
          ✎
        </button>

        {/* Cancel (only if active) */}
        {conv.status === "active" && (
          <button
            onClick={() => onCancel(conv.id)}
            className="px-2 py-1.5 rounded-lg text-xs transition-all"
            style={{ background: "rgba(255,51,102,0.06)", border: "1px solid rgba(255,51,102,0.15)", color: "var(--danger)" }}
          >
            ✕
          </button>
        )}

        {/* Delete */}
        <button
          onClick={() => onDelete(conv)}
          title="Delete"
          className="px-2 py-1.5 rounded-lg text-xs transition-all"
          style={{ background: "rgba(255,51,102,0.06)", border: "1px solid rgba(255,51,102,0.15)", color: "var(--danger)" }}
          onMouseOver={(e) => (e.currentTarget.style.background = "rgba(255,51,102,0.14)")}
          onMouseOut={(e) => (e.currentTarget.style.background = "rgba(255,51,102,0.06)")}
        >
          🗑
        </button>
      </div>
    </motion.div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export function Conversations() {
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Conversation | null>(null);
  const queryClient = useQueryClient();
  const { addToast } = useStore();

  const { data: conversations, isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: api.conversations.list,
  });

  const cancelMutation = useMutation({
    mutationFn: api.conversations.cancel,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["conversations"] });
      const prev = queryClient.getQueryData<Conversation[]>(["conversations"]);
      queryClient.setQueryData<Conversation[]>(
        ["conversations"],
        (old) => old?.map((c) => (c.id === id ? { ...c, status: "cancelled" as const } : c))
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["conversations"], ctx.prev);
      addToast({ type: "error", message: "Failed to cancel conversation" });
    },
    onSuccess: () => addToast({ type: "success", message: "Conversation cancelled" }),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.conversations.update(id, { title }),
    onMutate: async ({ id, title }) => {
      await queryClient.cancelQueries({ queryKey: ["conversations"] });
      const prev = queryClient.getQueryData<Conversation[]>(["conversations"]);
      queryClient.setQueryData<Conversation[]>(
        ["conversations"],
        (old) => old?.map((c) => (c.id === id ? { ...c, title } : c))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["conversations"], ctx.prev);
      addToast({ type: "error", message: "Failed to rename conversation" });
    },
    onSuccess: () => addToast({ type: "success", message: "Conversation renamed" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.conversations.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["conversations"] });
      const prev = queryClient.getQueryData<Conversation[]>(["conversations"]);
      queryClient.setQueryData<Conversation[]>(
        ["conversations"],
        (old) => old?.filter((c) => c.id !== id)
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["conversations"], ctx.prev);
      addToast({ type: "error", message: "Failed to delete conversation" });
    },
    onSuccess: () => addToast({ type: "success", message: "Conversation deleted" }),
  });

  const handleDelete = (conv: Conversation) => setConfirmDelete(conv);
  const confirmAndDelete = () => {
    if (!confirmDelete) return;
    deleteMutation.mutate(confirmDelete.id);
    setConfirmDelete(null);
  };

  const filtered = (conversations ?? []).filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.title?.toLowerCase().includes(q) ||
      c.provider.toLowerCase().includes(q) ||
      c.model.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-5 p-6 h-full overflow-y-auto">
      {/* Confirm delete modal */}
      <AnimatePresence>
        {confirmDelete && (
          <ConfirmDeleteModal
            conv={confirmDelete}
            onConfirm={confirmAndDelete}
            onCancel={() => setConfirmDelete(null)}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl tracking-wide" style={{ color: "var(--text-primary)" }}>
            Conversations
          </h1>
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {conversations?.length ?? 0} total
          </span>
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations..."
          className="px-4 py-2 rounded-lg text-sm w-64"
          style={{
            background: "var(--input-bg)",
            border: "1px solid var(--input-border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* List */}
      <div className="flex flex-col gap-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
        ) : filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 gap-4"
          >
            <div className="text-6xl" style={{ filter: "var(--empty-icon-filter)" }}>◎</div>
            <div className="text-center">
              <div className="font-heading text-lg mb-1" style={{ color: "var(--text-secondary)" }}>
                {search ? "No matching conversations" : "No conversations yet"}
              </div>
              <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                {search ? "Try a different search term" : "Start a chat to see conversations here"}
              </div>
            </div>
          </motion.div>
        ) : (
          <AnimatePresence>
            {filtered.map((conv) => (
              <ConversationRow
                key={conv.id}
                conv={conv}
                onCancel={cancelMutation.mutate}
                onDelete={handleDelete}
                onRename={(id, title) => renameMutation.mutate({ id, title })}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
