import { motion } from 'framer-motion';
import { AlertCircle, Check, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import type { Video } from '../api/types';
import { cn } from '../lib/cn';

interface VideoCardProps {
  video: Video;
  selected: boolean;
  /** False when 5 videos are already picked and this one is not among them. */
  canSelect: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onRetry: () => void;
}

export function VideoCard({
  video,
  selected,
  canSelect,
  onToggle,
  onDelete,
  onRetry,
}: VideoCardProps) {
  const ready = video.status === 'ready';
  const clickable = ready && (selected || canSelect);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={clickable ? { y: -3 } : undefined}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className={cn(
        'group relative overflow-hidden rounded-2xl border bg-surface transition-colors',
        selected
          ? 'border-accent shadow-lg shadow-accent/20'
          : 'border-line hover:border-surface-3',
        clickable ? 'cursor-pointer' : ready && 'opacity-50',
      )}
      onClick={clickable ? onToggle : undefined}
    >
      <div className="relative aspect-video overflow-hidden bg-surface-2">
        <img
          src={video.thumbnailUrl}
          alt=""
          loading="lazy"
          className={cn(
            'h-full w-full object-cover transition duration-500 group-hover:scale-105',
            !ready && 'scale-105 blur-[2px] brightness-50',
          )}
        />

        {video.status === 'processing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm font-medium">
            <Loader2 className="animate-spin text-violet-300" size={22} />
            Reading the transcript…
            <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-white/10">
              <div className="h-full w-full animate-shimmer bg-linear-to-r from-transparent via-accent to-transparent" />
            </div>
          </div>
        )}

        {video.status === 'failed' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
            <AlertCircle className="text-red-300" size={22} />
            <p className="line-clamp-2 text-xs text-red-100">
              {video.errorMessage ?? 'Could not process this video'}
            </p>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onRetry();
              }}
              className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur transition-colors hover:bg-white/25"
            >
              <RotateCcw size={12} /> Retry
            </button>
          </div>
        )}

        {ready && (
          <div
            className={cn(
              'absolute left-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all',
              selected
                ? 'scale-100 border-accent bg-accent text-white'
                : 'scale-90 border-white/60 bg-black/30 opacity-0 group-hover:opacity-100',
            )}
          >
            {selected && <Check size={14} strokeWidth={3} />}
          </div>
        )}

        <button
          aria-label={`Remove ${video.title}`}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-lg bg-black/50 text-white/80 opacity-0 backdrop-blur transition-all hover:bg-red-500 hover:text-white group-hover:opacity-100"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="p-3.5">
        <h3 className="line-clamp-2 text-sm font-medium leading-5 text-ink">{video.title}</h3>
        <p className="mt-1 truncate text-xs text-muted">{video.channel ?? 'Unknown channel'}</p>
      </div>
    </motion.div>
  );
}
