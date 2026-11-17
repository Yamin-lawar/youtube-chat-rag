import type { ChunkPayload } from '../vectorstore/qdrantChunkStore.js';

type TimeRange = Pick<ChunkPayload, 'youtubeId' | 'startMs' | 'endMs'>;

/** Finds the bigger chunk that a small chunk belongs to. */
export type ParentResolver = (child: TimeRange) => ChunkPayload | undefined;

/**
 * Links each small chunk to a parent chunk from another, bigger chunking of the same video.
 *
 * The two chunkings are cut independently, so a child does not sit neatly inside one parent.
 * Instead the match is made on time: the parent that shares the most of the child's time range.
 * Parents overlap each other, so two can share the same amount. Then the parent whose middle is
 * closest to the child's middle wins, because that one has the most context on both sides.
 */
export function createParentResolver(parents: ChunkPayload[]): ParentResolver {
  const byVideo = new Map<string, ChunkPayload[]>();
  for (const parent of parents) {
    byVideo.set(parent.youtubeId, [...(byVideo.get(parent.youtubeId) ?? []), parent]);
  }

  const middle = (range: TimeRange) => (range.startMs + range.endMs) / 2;
  const sharedMs = (a: TimeRange, b: TimeRange) =>
    Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs);

  return (child) => {
    let best: ChunkPayload | undefined;
    let bestShared = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const parent of byVideo.get(child.youtubeId) ?? []) {
      const shared = sharedMs(child, parent);
      if (shared <= 0) continue;
      const distance = Math.abs(middle(child) - middle(parent));
      if (shared > bestShared || (shared === bestShared && distance < bestDistance)) {
        best = parent;
        bestShared = shared;
        bestDistance = distance;
      }
    }
    return best;
  };
}
