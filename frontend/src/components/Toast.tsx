import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "../store";

export function ToastContainer() {
  const { toasts, removeToast } = useStore();

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer"
            style={{
              background:
                toast.type === "success"
                  ? "rgba(0,255,136,0.12)"
                  : toast.type === "error"
                  ? "rgba(255,51,102,0.12)"
                  : "rgba(0,229,255,0.12)",
              border: `1px solid ${
                toast.type === "success"
                  ? "rgba(0,255,136,0.25)"
                  : toast.type === "error"
                  ? "rgba(255,51,102,0.25)"
                  : "rgba(0,229,255,0.25)"
              }`,
              backdropFilter: "blur(12px)",
              color:
                toast.type === "success"
                  ? "#00FF88"
                  : toast.type === "error"
                  ? "#FF3366"
                  : "#00E5FF",
              minWidth: 280,
              maxWidth: 400,
            }}
            onClick={() => removeToast(toast.id)}
          >
            <span className="text-base">
              {toast.type === "success" ? "✓" : toast.type === "error" ? "✕" : "ℹ"}
            </span>
            <span className="text-sm flex-1">{toast.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
