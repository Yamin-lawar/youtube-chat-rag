import type { Source } from '../api/types';
import { formatTimestamp, youtubeLink } from '../lib/format';

interface CitationBadgeProps {
  number: number;
  source: Source | undefined;
  videoTitle: string | undefined;
}

/** The small numbered pill after a sentence. Hover shows the passage, click opens the video there. */
export function CitationBadge({ number, source, videoTitle }: CitationBadgeProps) {
  const pill =
    'mx-0.5 inline-flex h-5 min-w-5 -translate-y-px items-center justify-center rounded-md bg-accent/20 px-1 align-middle text-[11px] font-semibold text-violet-200 no-underline transition-colors';

  // The model can cite a number that has no source (it should not). Show it as plain text.
  if (!source) return <span className={pill}>{number}</span>;

  return (
    <span className="group/cite relative inline-block">
      <a
        href={youtubeLink(source.youtubeId, source.startMs)}
        target="_blank"
        rel="noreferrer"
        className={`${pill} hover:bg-accent hover:text-white`}
      >
        {number}
      </a>
      <span className="pointer-events-none invisible absolute bottom-full left-1/2 z-20 mb-2 w-72 -translate-x-1/2 rounded-xl border border-line bg-surface-2 p-3 text-left text-xs leading-5 text-muted opacity-0 shadow-2xl transition-opacity group-hover/cite:visible group-hover/cite:opacity-100">
        <span className="mb-1 block font-medium text-ink">
          {videoTitle ?? 'Video'} · {formatTimestamp(source.startMs)}
        </span>
        {source.snippet}…
      </span>
    </span>
  );
}
