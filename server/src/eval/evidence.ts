import type { ChunkPayload } from '../rag/vectorstore/qdrantChunkStore.js';
import type { EvidenceItem, TimeSpan } from './types.js';

// The quote's position inside a chunk is estimated, not measured, so the span is widened a bit.
const SPAN_PADDING_MS = 8000;

/** Lower case and single spaces, so line breaks and capitals do not stop a quote from matching. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Finds where a quote is said in a video and returns that as a time span.
 *
 * Chunks only store a start and end time, not the time of each word. So we assume the words
 * are spoken at an even pace and place the quote by its position in the chunk's text. This is
 * accurate to a few seconds, which is enough to tell which chunks cover it.
 *
 * Because the span is in time and not tied to a chunk number, the same labels keep working
 * when chunking changes. Returns an empty list when the quote is not found.
 */
export function findEvidenceSpans(chunks: ChunkPayload[], evidence: EvidenceItem): TimeSpan[] {
  const quote = normalize(evidence.quote);
  const spans: TimeSpan[] = [];

  for (const chunk of chunks) {
    if (chunk.youtubeId !== evidence.youtubeId) continue;

    const text = normalize(chunk.text);
    const at = text.indexOf(quote);
    if (at === -1) continue;

    const duration = chunk.endMs - chunk.startMs;
    spans.push({
      youtubeId: chunk.youtubeId,
      startMs: Math.max(0, chunk.startMs + (at / text.length) * duration - SPAN_PADDING_MS),
      endMs: chunk.startMs + ((at + quote.length) / text.length) * duration + SPAN_PADDING_MS,
    });
  }

  return mergeOverlapping(spans);
}

/**
 * Chunks overlap, so one quote usually appears in two neighbouring chunks and gives two nearly
 * identical spans. Merging them leaves one span per place in the video. More than one span left
 * means the quote is said in several places, which the review script reports.
 */
function mergeOverlapping(spans: TimeSpan[]): TimeSpan[] {
  const sorted = [...spans].sort((a, b) => a.startMs - b.startMs);
  const merged: TimeSpan[] = [];

  for (const span of sorted) {
    const last = merged.at(-1);
    if (last && span.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, span.endMs);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

/** True when the chunk's time range overlaps the span, so the chunk covers (part of) the evidence. */
export function chunkCoversSpan(
  chunk: { youtubeId: string; startMs: number; endMs: number },
  span: TimeSpan,
): boolean {
  return (
    chunk.youtubeId === span.youtubeId && chunk.startMs < span.endMs && chunk.endMs > span.startMs
  );
}
