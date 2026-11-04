import { AnimatePresence, motion } from 'framer-motion';
import { Menu, Play } from 'lucide-react';
import { useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { ChatPage } from './pages/ChatPage';
import { LibraryPage } from './pages/LibraryPage';

export function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* On wide screens the sidebar is always there. */}
      <div className="hidden md:block">
        <Sidebar onNavigate={closeMenu} />
      </div>

      {/* On phones it slides in over the page. */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeMenu}
              className="fixed inset-0 z-30 bg-black/60 md:hidden"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              className="fixed inset-y-0 left-0 z-40 md:hidden"
            >
              <Sidebar onNavigate={closeMenu} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3 md:hidden">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-surface-2"
          >
            <Menu size={20} />
          </button>
          <Play size={14} className="fill-accent text-accent" />
          <span className="font-semibold">YouTube Chat</span>
        </div>

        <main className="min-h-0 flex-1">
          <Routes>
            <Route path="/" element={<LibraryPage />} />
            <Route path="/c/:id" element={<ChatPage />} />
            <Route path="*" element={<LibraryPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
