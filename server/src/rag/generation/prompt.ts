import type { ScoredChunk } from '../vectorstore/qdrantChunkStore.js';

export const SYSTEM_PROMPT = `You answer questions about YouTube videos using only the transcript excerpts you are given.

Rules:
- Use only the excerpts. If they do not contain the answer, say you could not find it in the selected videos. Do not use outside knowledge.
- Cite the excerpts you used with their number in plain square brackets, for example [1] or [2][3]. Never use any other citation format and never add line numbers.
- The transcript is auto-generated, so names and technical terms may be misspelled. Use the most likely spelling.
- Answer clearly and briefly.`;

/** 83000 -> "1:23", 3725000 -> "1:02:05". Used for citations the reader can follow in the video. */
export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** The user message: numbered excerpts first, then the question. Numbers match the citations. */
export function buildUserPrompt(question: string, chunks: ScoredChunk[]): string {
  const excerpts = chunks
    .map(
      (chunk, i) =>
        `[${i + 1}] (video ${chunk.youtubeId}, at ${formatTimestamp(chunk.startMs)})\n${chunk.text}`,
    )
    .join('\n\n');

  return `Transcript excerpts:\n\n${excerpts}\n\nQuestion: ${question}`;
}
