import { describe, expect, it } from 'vitest';
import type { ScoredChunk } from '../vectorstore/qdrantChunkStore.js';
import { keepNearBest } from './retriever.js';

function chunk(chunkIndex: number, score: number): ScoredChunk {
  return { youtubeId: 'abc123DEF45', chunkIndex, text: '', startMs: 0, endMs: 0, score };
}

describe('keepNearBest', () => {
  it('drops chunks that score far below the best one', () => {
    const kept = keepNearBest([chunk(1, 0.83), chunk(2, 0.8), chunk(3, 0.6)], 0.08);
    expect(kept.map((c) => c.chunkIndex)).toEqual([1, 2]);
  });

  it('keeps a chunk exactly at the margin', () => {
    expect(keepNearBest([chunk(1, 0.9), chunk(2, 0.5)], 0.4)).toHaveLength(2);
  });

  it('returns nothing when there are no results', () => {
    expect(keepNearBest([], 0.08)).toEqual([]);
  });
});
