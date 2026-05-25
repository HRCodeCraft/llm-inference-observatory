import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { SettingsModal } from "./components/SettingsModal";
import { ToastContainer } from "./components/Toast";
import { Dashboard } from "./pages/Dashboard";
import { Conversations } from "./pages/Conversations";
import { ConversationDetail } from "./pages/ConversationDetail";
import { Chat } from "./pages/Chat";
import { useStore } from "./store";

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  enter:   { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
};

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="enter"
        exit="exit"
        transition={{ duration: 0.2 }}
        className="flex-1 overflow-hidden"
      >
        <Routes location={location}>
          <Route path="/"                   element={<Dashboard />} />
          <Route path="/conversations"      element={<Conversations />} />
          <Route path="/conversations/:id"  element={<ConversationDetail />} />
          <Route path="/chat"               element={<Chat />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  const { theme } = useStore();

  // Sync theme to <html data-theme="..."> so CSS vars pick it up
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar />
        <AnimatedRoutes />
      </div>
      <SettingsModal />
      <ToastContainer />
    </div>
  );
}
