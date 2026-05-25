import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store";
import { useState } from "react";

const PROVIDERS = [
  { key: "anthropic", label: "Anthropic", color: "#FF6B35" },
  { key: "openai", label: "OpenAI", color: "#00A67E" },
  { key: "google", label: "Google", color: "#4285F4" },
  { key: "deepseek", label: "DeepSeek", color: "#9D00FF" },
  { key: "grok", label: "Grok (xAI)", color: "#00E5FF" },
] as const;

export function SettingsModal() {
  const { settingsOpen, setSettingsOpen, apiKeys, setApiKeys } = useStore();
  const [keys, setKeys] = useState({ ...apiKeys });
  const [show, setShow] = useState<Record<string, boolean>>({});

  const handleSave = () => {
    setApiKeys(keys);
    setSettingsOpen(false);
  };

  return (
    <AnimatePresence>
      {settingsOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
          onClick={(e) => e.target === e.currentTarget && setSettingsOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            className="card w-full max-w-md p-6 flex flex-col gap-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-bold text-lg tracking-wide" style={{ color: "var(--cyan)" }}>
                API KEYS
              </h2>
              <button
                onClick={() => setSettingsOpen(false)}
                className="transition-colors text-lg"
                style={{ color: "var(--text-muted)" }}
                onMouseOver={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                onMouseOut={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
              >
                ✕
              </button>
            </div>

            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Keys are stored locally in your browser. Never sent to any server except the respective LLM provider.
            </p>

            <div className="flex flex-col gap-3">
              {PROVIDERS.map(({ key, label, color }) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                    {label}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type={show[key] ? "text" : "password"}
                      value={keys[key as keyof typeof keys]}
                      onChange={(e) => setKeys((k) => ({ ...k, [key]: e.target.value }))}
                      placeholder={`sk-...`}
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-mono"
                      style={{
                        background: "var(--input-bg)",
                        border: "1px solid var(--input-border)",
                        color: "var(--text-primary)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShow((s) => ({ ...s, [key]: !s[key] }))}
                      className="px-3 py-2 rounded-lg text-xs transition-colors"
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {show[key] ? "◉" : "◎"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setSettingsOpen(false)}
                className="flex-1 py-2.5 rounded-lg text-sm transition-colors"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: "rgba(0,229,255,0.12)",
                  border: "1px solid rgba(0,229,255,0.3)",
                  color: "var(--cyan)",
                }}
              >
                Save Keys
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
