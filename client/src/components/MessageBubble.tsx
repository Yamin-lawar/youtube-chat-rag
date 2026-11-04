import { motion } from 'framer-motion';
import { AlertTriangle, RotateCcw, Sparkles } from 'lucide-react';
import type { MessageStatus, Source } from '../api/types';
import { Markdown } from './Markdown';
import { SourceList } from './SourceList';

const enter = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

export function UserMessage({ content }: { content: string }) {
  return (
    <motion.div {...enter} className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-linear-to-br from-accent to-violet-700 px-4 py-2.5 text-[15px] leading-6 text-white shadow-lg shadow-accent/10">
        {content}
      </div>
    </motion.div>
  );
}

interface AssistantMessageProps {
  content: string;
  sources: Source[];
  status: MessageStatus;
  videoTitles: Map<string, string>;
  /** True while words are still being revealed, so the cursor is shown. */
  typing?: boolean;
  /** True before the first word: the server is still searching the videos. */
  thinking?: boolean;
  onRetry?: (() => void) | undefined;
}

export function AssistantMessage({
  content,
  sources,
  status,
  videoTitles,
  typing = false,
  thinking = false,
  onRetry,
}: AssistantMessageProps) {
  return (
    <motion.div {...enter} className="flex gap-3.5">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-accent to-accent-2 shadow-lg shadow-accent/20">
        <Sparkles size={15} className="text-white" />
      </div>

      <div className="min-w-0 flex-1">
        {thinking ? (
          <Thinking />
        ) : (
          <div className="relative">
            <Markdown text={content} sources={sources} videoTitles={videoTitles} />
            {typing && (
              <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-blink bg-violet-300" />
            )}
          </div>
        )}

        {!thinking && <SourceList sources={sources} videoTitles={videoTitles} />}

        {status === 'failed' && !typing && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-200">
            <AlertTriangle size={16} className="shrink-0" />
            <span className="flex-1">
              {content ? 'The answer was cut off.' : 'Could not generate an answer.'}
            </span>
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1.5 rounded-lg bg-red-500/20 px-2.5 py-1 font-medium transition-colors hover:bg-red-500/30"
              >
                <RotateCcw size={13} /> Try again
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-2.5 py-1.5 text-sm text-muted">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-dot rounded-full bg-violet-300"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </span>
      Searching the videos…
    </div>
  );
}
