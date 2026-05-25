import { NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store";

const NAV = [
  { to: "/",              label: "Dashboard",     icon: "⬡" },
  { to: "/conversations", label: "Conversations", icon: "◈" },
  { to: "/chat",          label: "New Chat",      icon: "◎" },
];

export function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed, setSettingsOpen } = useStore();

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 64 : 220 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      className="flex-shrink-0 h-screen flex flex-col border-r overflow-hidden"
      style={{
        borderColor: "var(--border)",
        background: "var(--sidebar-bg)",
        backdropFilter: "blur(16px)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-4 py-5 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
          style={{
            background: "rgba(0,229,255,0.12)",
            color: "var(--cyan)",
            border: "1px solid rgba(0,229,255,0.25)",
          }}
        >
          ⬡
        </div>
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              className="font-heading font-bold text-sm whitespace-nowrap tracking-widest"
              style={{ color: "var(--cyan)", letterSpacing: "0.15em" }}
            >
              INFERIQ
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 flex flex-col gap-1">
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200"
            style={({ isActive }) => ({
              color: isActive ? "var(--cyan)" : "var(--text-secondary)",
              background: isActive ? "rgba(0,229,255,0.08)" : "transparent",
              boxShadow: isActive ? "inset 2px 0 0 var(--cyan)" : "none",
            })}
          >
            {({ isActive }) => (
              <>
                <span
                  className="flex-shrink-0 text-base"
                  style={
                    isActive
                      ? { filter: "drop-shadow(0 0 6px var(--cyan))" }
                      : {}
                  }
                >
                  {icon}
                </span>
                <AnimatePresence>
                  {!sidebarCollapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-sm font-medium whitespace-nowrap"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div
        className="px-2 pb-4 flex flex-col gap-1 border-t pt-3"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 w-full text-left"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--surface-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          <span className="flex-shrink-0 text-base">⚙</span>
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm font-medium"
              >
                Settings
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 w-full text-left"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--surface-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          <span className="flex-shrink-0 text-base">
            {sidebarCollapsed ? "▶" : "◀"}
          </span>
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm"
              >
                Collapse
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
}
