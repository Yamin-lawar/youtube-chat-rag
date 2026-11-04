import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Source } from '../api/types';
import { citationNumber, linkCitations } from '../lib/citations';
import { CitationBadge } from './CitationBadge';

interface MarkdownProps {
  text: string;
  sources: Source[];
  videoTitles: Map<string, string>;
}

/** Renders an answer: markdown, with [1] turned into badges that open the video at that moment. */
export function Markdown({ text, sources, videoTitles }: MarkdownProps) {
  return (
    <div className="answer prose prose-invert prose-p:leading-7 prose-pre:bg-surface-2 prose-pre:border prose-pre:border-line max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const number = citationNumber(href);
            if (number === null) {
              return (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              );
            }
            const source = sources.find((s) => s.number === number);
            return (
              <CitationBadge
                number={number}
                source={source}
                videoTitle={source ? videoTitles.get(source.youtubeId) : undefined}
              />
            );
          },
        }}
      >
        {linkCitations(text)}
      </ReactMarkdown>
    </div>
  );
}
