import { RecursiveChunker } from './recursiveChunker.js';

/**
 * Builds the chunker for a `--chunking` flag such as "500/100" (size 500 characters, overlap 100).
 * No flag gives the default (1000/200), the one the app uses.
 */
export function createChunker(spec: string | undefined): RecursiveChunker {
  if (spec === undefined) return new RecursiveChunker();

  const match = /^(\d+)\/(\d+)$/.exec(spec);
  if (!match) {
    throw new Error(
      `--chunking must look like 500/100 (size/overlap in characters), got "${spec}"`,
    );
  }
  const chunkSize = Number(match[1]);
  const chunkOverlap = Number(match[2]);
  if (chunkSize < 1 || chunkOverlap >= chunkSize) {
    throw new Error(`--chunking "${spec}": the size must be above 0 and bigger than the overlap`);
  }
  return new RecursiveChunker({ chunkSize, chunkOverlap });
}
