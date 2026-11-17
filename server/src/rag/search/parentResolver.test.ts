import { describe, expect, it } from 'vitest';
import type { ChunkPayload } from '../vectorstore/qdrantChunkStore.js';
import { createParentResolver } from './parentResolver.js';

const parent = (youtubeId: string, chunkIndex: number, startMs: number, endMs: number) =>
  ({ youtubeId, chunkIndex, text: `p${chunkIndex}`, startMs, endMs }) satisfies ChunkPayload;

describe('createParentResolver', () => {
  const resolve = createParentResolver([
    parent('a', 0, 0, 60_000),
    parent('a', 1, 40_000, 100_000),
    parent('b', 0, 0, 60_000),
  ]);

  it('picks the parent that shares the most time with the child', () => {
    expect(resolve({ youtubeId: 'a', startMs: 70_000, endMs: 90_000 })?.chunkIndex).toBe(1);
    expect(resolve({ youtubeId: 'a', startMs: 5_000, endMs: 25_000 })?.chunkIndex).toBe(0);
  });

  it('takes the parent with the child nearest its middle when two share the same time', () => {
    // 52 s to 58 s is inside both parents, so both share all 6 s. Its middle (55 s) is 25 s from
    // the middle of parent 0 (30 s) and 15 s from the middle of parent 1 (70 s).
    expect(resolve({ youtubeId: 'a', startMs: 52_000, endMs: 58_000 })?.chunkIndex).toBe(1);
  });

  it('only looks at parents of the same video', () => {
    expect(resolve({ youtubeId: 'b', startMs: 10_000, endMs: 20_000 })?.youtubeId).toBe('b');
    expect(resolve({ youtubeId: 'c', startMs: 10_000, endMs: 20_000 })).toBeUndefined();
  });

  it('returns nothing when no parent shares any time', () => {
    expect(resolve({ youtubeId: 'a', startMs: 200_000, endMs: 210_000 })).toBeUndefined();
  });
});
