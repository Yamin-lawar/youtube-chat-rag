import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import type { Source } from '../api/types';
import { formatTimestamp, youtubeLink } from '../lib/format';

interface SourceListProps {
  sources: Source[];
  videoTitles: Map<string, string>;
}

/** One chip per passage the answer used, each linking to that moment in the video. */
export function SourceList({ sources, videoTitles }: SourceListProps) {
  if (sources.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {sources.map((source, i) => (
        <motion.a
          key={source.number}
          href={youtubeLink(source.youtubeId, source.startMs)}
          target="_blank"
          rel="noreferrer"
          title={`${source.snippet}…`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          className="group flex max-w-64 items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-accent/60 hover:text-ink"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-semibold text-violet-200">
            {source.number}
          </span>
          <span className="truncate">{videoTitles.get(source.youtubeId) ?? 'Video'}</span>
          <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-violet-300">
            <Play size={10} className="fill-current" />
            {formatTimestamp(source.startMs)}
          </span>
        </motion.a>
      ))}
    </div>
  );
}
