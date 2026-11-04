import { AnimatePresence, motion } from 'framer-motion';
import { Library, MessageSquare, Play, Plus, Trash2 } from 'lucide-react';
import { NavLink, useMatch, useNavigate } from 'react-router-dom';
import { useConversations, useDeleteConversation } from '../api/conversations';
import { cn } from '../lib/cn';

interface SidebarProps {
  onNavigate: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const { data: conversations } = useConversations();
  const deleteConversation = useDeleteConversation();
  const navigate = useNavigate();
  const activeChat = useMatch('/c/:id');

  function remove(id: string) {
    deleteConversation.mutate(id);
    // Leave the chat that was just deleted instead of showing a "not found" page.
    if (activeChat?.params.id === id) navigate('/');
  }

  return (
    <div className="flex h-full w-72 flex-col border-r border-line bg-surface/60 backdrop-blur-xl">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-linear-to-br from-accent to-accent-2 shadow-lg shadow-accent/30">
          <Play size={14} className="ml-0.5 fill-white text-white" />
        </div>
        <span className="text-[17px] font-semibold tracking-tight">YouTube Chat</span>
      </div>

      <div className="space-y-1 px-3">
        <NavLink
          to="/"
          end
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-xl bg-linear-to-br from-accent/90 to-violet-700 px-3.5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition-all hover:brightness-110"
        >
          <Plus size={16} /> New chat
        </NavLink>
        <NavLink
          to="/"
          end
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition-colors',
              isActive ? 'bg-surface-2 text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink',
            )
          }
        >
          <Library size={16} /> Video library
        </NavLink>
      </div>

      <p className="px-6 pb-2 pt-6 text-[11px] font-semibold uppercase tracking-wider text-muted">
        Chats
      </p>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        <AnimatePresence initial={false}>
          {conversations?.map((conversation) => (
            <motion.div
              key={conversation.id}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="group relative"
            >
              <NavLink
                to={`/c/${conversation.id}`}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-xl py-2 pl-3 pr-9 text-sm transition-colors',
                    isActive
                      ? 'bg-surface-3 text-ink'
                      : 'text-muted hover:bg-surface-2 hover:text-ink',
                  )
                }
              >
                <MessageSquare size={14} className="shrink-0" />
                <span className="truncate">{conversation.title}</span>
              </NavLink>
              <button
                aria-label={`Delete ${conversation.title}`}
                onClick={() => remove(conversation.id)}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted opacity-0 transition-all hover:bg-red-500/20 hover:text-red-300 group-hover:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {conversations?.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted">
            Your chats will show up here. Pick some videos to start one.
          </p>
        )}
      </nav>
    </div>
  );
}
