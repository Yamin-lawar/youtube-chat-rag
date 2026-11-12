import { describe, expect, it } from 'vitest';
import type { ScoredChunk } from '../vectorstore/qdrantChunkStore.js';
import { RRF_K, reciprocalRankFusion } from './rrf.js';

function chunk(chunkIndex: number, score = 0, youtubeId = 'abc123DEF45'): ScoredChunk {
  return { youtubeId, chunkIndex, text: `chunk ${chunkIndex}`, startMs: 0, endMs: 1000, score };
}

const indexes = (chunks: ScoredChunk[]) => chunks.map((c) => c.chunkIndex);

describe('reciprocalRankFusion', () => {
  it('gives a chunk 1 / (k + rank) points from each list it appears in', () => {
    const fused = reciprocalRankFusion([[chunk(1), chunk(2)], [chunk(2)]], 10);
    const score = (index: number) => fused.find((c) => c.chunkIndex === index)?.score;

    expect(score(1)).toBeCloseTo(1 / (RRF_K + 1)); // rank 1 in one list
    expect(score(2)).toBeCloseTo(1 / (RRF_K + 2) + 1 / (RRF_K + 1)); // rank 2, then rank 1
  });

  it('uses the k it is given', () => {
    const [only] = reciprocalRankFusion([[chunk(1)]], 10, 10);
    expect(only?.score).toBeCloseTo(1 / 11);
  });

  it('puts a chunk that is high in both lists above a chunk that is first in only one', () => {
    const dense = [chunk(1), chunk(2)];
    const sparse = [chunk(3), chunk(2)];
    expect(indexes(reciprocalRankFusion([dense, sparse], 10))).toEqual([2, 1, 3]);
  });

  it('treats chunks with the same youtubeId and chunkIndex as the same chunk', () => {
    const merged = reciprocalRankFusion([[chunk(1)], [chunk(1)]], 10);
    expect(merged).toHaveLength(1);

    // The same chunk number in another video is a different chunk.
    const apart = reciprocalRankFusion(
      [[chunk(1, 0, 'video-one-1')], [chunk(1, 0, 'video-two-2')]],
      10,
    );
    expect(apart).toHaveLength(2);
  });

  it('keeps the text and times of the chunk, with the summed points as the score', () => {
    const [top] = reciprocalRankFusion([[chunk(7, 0.9)], [chunk(7, 4)]], 10);
    expect(top).toMatchObject({ chunkIndex: 7, text: 'chunk 7', startMs: 0, endMs: 1000 });
    expect(top?.score).toBeCloseTo(2 / (RRF_K + 1));
  });

  it('ignores the original scores and uses only the ranks', () => {
    const withScores = reciprocalRankFusion([[chunk(1, 0.99), chunk(2, 0.1)], [chunk(3, 50)]], 10);
    const withoutScores = reciprocalRankFusion([[chunk(1), chunk(2)], [chunk(3)]], 10);
    expect(indexes(withScores)).toEqual(indexes(withoutScores));
  });

  it('returns the best `limit` chunks, best first', () => {
    const fused = reciprocalRankFusion(
      [
        [chunk(1), chunk(2), chunk(3)],
        [chunk(3), chunk(2)],
      ],
      2,
    );
    // Chunk 3 (rank 3 and rank 1) narrowly beats chunk 2 (rank 2 and rank 2); chunk 1 is cut.
    expect(indexes(fused)).toEqual([3, 2]);
    expect(fused[0]!.score).toBeGreaterThan(fused[1]!.score);
  });

  it('puts the chunk seen first ahead when two chunks have the same points', () => {
    expect(indexes(reciprocalRankFusion([[chunk(1)], [chunk(2)]], 10))).toEqual([1, 2]);
  });

  it('returns an empty list when every input list is empty', () => {
    expect(reciprocalRankFusion([], 10)).toEqual([]);
    expect(reciprocalRankFusion([[], []], 10)).toEqual([]);
  });

  it('does not change the lists it is given', () => {
    const list = [chunk(1, 0.5), chunk(2, 0.4)];
    reciprocalRankFusion([list], 10);
    expect(list.map((c) => c.score)).toEqual([0.5, 0.4]);
  });
});
