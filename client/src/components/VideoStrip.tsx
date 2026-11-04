import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { ConversationVideo } from '../api/types';
import { cn } from '../lib/cn';

interface VideoStripProps {
  videos: ConversationVideo[];
  error: string | null;
  onToggle: (video: ConversationVideo) => void;
}

/**
 * The videos of this chat, shown large. Click one to switch it off (it stops being searched)
 * or back on. At least one must stay on, so the last one cannot be switched off.
 */
export function VideoStrip({ videos, error, onToggle }: VideoStripProps) {
  const [open, setOpen] = useState(true);
  const activeCount = videos.filter((video) => video.active).length;

  return (
    <section className="border-b border-line bg-surface/40">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-5 py-2.5 text-left text-xs text-muted transition-colors hover:text-ink md:px-8"
      >
        <span className="font-semibold uppercase tracking-wider">Videos in this chat</span>
        <span>
          · {activeCount} of {videos.length} on
        </span>
        <ChevronDown
          size={14}
          className={cn('ml-auto transition-transform', !open && '-rotate-90')}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex gap-4 overflow-x-auto px-5 pb-4 md:px-8">
              {videos.map((video) => {
                const isLastOn = video.active && activeCount === 1;
                return (
                  <button
                    key={video.id}
                    onClick={() => onToggle(video)}
                    disabled={isLastOn}
                    title={
                      isLastOn
                        ? 'Keep at least one video on'
                        : video.active
                          ? 'Click to stop searching this video'
                          : 'Click to search this video again'
                    }
                    className={cn(
                      'group w-56 shrink-0 text-left transition-opacity',
                      !video.active && 'opacity-60 hover:opacity-100',
                      isLastOn && 'cursor-default',
                    )}
                  >
                    <div
                      className={cn(
                        'relative aspect-video overflow-hidden rounded-xl border-2 transition-all',
                        video.active
                          ? 'border-accent shadow-lg shadow-accent/20'
                          : 'border-line group-hover:border-surface-3',
                      )}
                    >
                      <img
                        src={video.thumbnailUrl}
                        alt=""
                        className={cn(
                          'h-full w-full object-cover transition duration-300',
                          !video.active && 'brightness-50 grayscale',
                        )}
                      />
                      <span
                        className={cn(
                          'absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors',
                          video.active
                            ? 'border-accent bg-accent text-white'
                            : 'border-white/70 bg-black/40',
                        )}
                      >
                        {video.active && <Check size={12} strokeWidth={3} />}
                      </span>
                      {!video.active && (
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold uppercase tracking-wider text-white/90">
                          Off
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-4 text-muted group-hover:text-ink">
                      {video.title}
                    </p>
                  </button>
                );
              })}
            </div>
            {error && <p className="px-5 pb-3 text-xs text-red-300 md:px-8">{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
