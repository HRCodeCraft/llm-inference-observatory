import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ApiKeys {
  anthropic: string;
  openai: string;
  google: string;
  deepseek: string;
  grok: string;
  [key: string]: string;
}

export interface LiveEvent {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  latency_ms: number | null;
  total_tokens: number;
  status: string;
  conversation_id: string;
}

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

export type Theme = "dark" | "light";

interface AppState {
  theme: Theme;
  toggleTheme: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  apiKeys: ApiKeys;
  setApiKeys: (keys: Partial<ApiKeys>) => void;
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
  liveEvents: LiveEvent[];
  addLiveEvent: (e: LiveEvent) => void;
  toasts: Toast[];
  addToast: (t: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      sidebarCollapsed: false,
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      apiKeys: { anthropic: "", openai: "", google: "", deepseek: "", grok: "" },
      setApiKeys: (keys) => set({ apiKeys: { ...get().apiKeys, ...keys } as ApiKeys }),
      settingsOpen: false,
      setSettingsOpen: (v) => set({ settingsOpen: v }),
      liveEvents: [],
      addLiveEvent: (e) =>
        set((s) => ({ liveEvents: [e, ...s.liveEvents].slice(0, 20) })),
      toasts: [],
      addToast: (t) => {
        const id = Math.random().toString(36).slice(2);
        set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
        setTimeout(() => get().removeToast(id), 4000);
      },
      removeToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: "inferiq-store",
      partialize: (s) => ({
        apiKeys: s.apiKeys,
        sidebarCollapsed: s.sidebarCollapsed,
        theme: s.theme,
      }),
    }
  )
);
