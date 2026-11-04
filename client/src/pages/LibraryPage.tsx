import { AnimatePresence, motion } from 'framer-motion';
import { Film, MessageSquarePlus, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateConversation } from '../api/conversations';
import { useAddVideo, useDeleteVideo, useVideos } from '../api/videos';
import { AddVideoForm } from '../components/AddVideoForm';
import { VideoCard } from '../components/VideoCard';
import { watchUrl } from '../lib/format';

const MAX_SELECTED = 5;

export function LibraryPage() {
  const { data: videos, isLoading, isError } = useVideos();
  const deleteVideo = useDeleteVideo();
  const retryVideo = useAddVideo();
  const createConversation = useCreateConversation();
  const navigate = useNavigate();
  const [selection, setSelection] = useState<string[]>([]);

  // Videos can disappear (deleted here or elsewhere), so drop selected ids that no longer exist.
  const selected = selection.filter((id) =>
    videos?.some((v) => v.id === id && v.status === 'ready'),
  );

  function toggle(id: string) {
    setSelection(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  function startChat() {
    createConversation.mutate(selected, {
      onSuccess: (conversation) => navigate(`/c/${conversation.id}`),
    });
  }

  return (
    <div className="relative h-full overflow-y-auto">
      {/* Soft glow behind the header. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(139,92,246,0.18),transparent)]" />

      <div className="relative mx-auto max-w-5xl px-5 pb-40 pt-10 md:px-8 md:pt-16">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
            Chat with <span className="gradient-text">any YouTube video</span>
          </h1>
          <p className="mt-3 max-w-xl text-muted md:text-lg">
            Add videos to your library, pick up to {MAX_SELECTED}, and ask questions. Answers come
            with links to the exact moment in the video.
          </p>
        </motion.div>

        <div className="mt-8">
          <AddVideoForm />
        </div>

        {isLoading && (
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="aspect-4/3 animate-pulse rounded-2xl bg-surface" />
            ))}
          </div>
        )}

        {isError && (
          <p className="mt-10 text-red-300">Could not load your library. Is the server running?</p>
        )}

        {videos?.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-16 flex flex-col items-center text-center"
          >
            <div className="flex h-20 w-20 animate-float items-center justify-center rounded-3xl bg-linear-to-br from-accent/30 to-accent-2/30">
              <Film size={34} className="text-violet-200" />
            </div>
            <h2 className="mt-5 text-lg font-semibold">Your library is empty</h2>
            <p className="mt-1 max-w-sm text-sm text-muted">
              Paste a link above. It takes a minute or two to read the transcript.
            </p>
          </motion.div>
        )}

        {videos && videos.length > 0 && (
          <>
            <p className="mb-4 mt-10 text-sm text-muted">
              {videos.length} {videos.length === 1 ? 'video' : 'videos'} · tap a ready video to
              select it
            </p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence>
                {videos.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    selected={selected.includes(video.id)}
                    canSelect={selected.length < MAX_SELECTED}
                    onToggle={() => toggle(video.id)}
                    onDelete={() => deleteVideo.mutate(video.id)}
                    onRetry={() => retryVideo.mutate(watchUrl(video.youtubeId))}
                  />
                ))}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {selected.length > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className="fixed inset-x-0 bottom-6 z-10 flex justify-center px-4 md:left-72"
          >
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2/90 p-2 pl-5 shadow-2xl shadow-black/60 backdrop-blur-xl">
              <span className="text-sm">
                <strong>{selected.length}</strong> of {MAX_SELECTED} selected
              </span>
              <button
                onClick={() => setSelection([])}
                aria-label="Clear selection"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-ink"
              >
                <X size={16} />
              </button>
              <button
                onClick={startChat}
                disabled={createConversation.isPending}
                className="flex items-center gap-2 rounded-xl bg-linear-to-br from-accent to-accent-2 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition-all hover:brightness-110 disabled:opacity-60"
              >
                <MessageSquarePlus size={16} />
                {createConversation.isPending ? 'Starting…' : 'Start chat'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
