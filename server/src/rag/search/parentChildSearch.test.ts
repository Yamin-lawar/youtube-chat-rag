import { describe, expect, it, vi } from 'vitest';
import type { ScoredChunk } from '../vectorstore/qdrantChunkStore.js';
import { ParentChildSearch } from './parentChildSearch.js';
import type { SearchStrategy } from './types.js';

const child = (chunkIndex: number, score: number): ScoredChunk => ({
  youtubeId: 'v',
  chunkIndex,
  text: `child ${chunkIndex}`,
  startMs: chunkIndex * 1000,
  endMs: chunkIndex * 1000 + 1000,
  score,
});

function innerReturning(children: ScoredChunk[]) {
  const search = vi.fn(async () => children);
  const inner: SearchStrategy = { name: 'dense', maxScoreDrop: 0.12, search };
  return { inner, search };
}

// Children 0-2 belong to parent 0, children 3-5 to parent 1.
const parentOf = (c: { startMs: number }) => {
  const index = c.startMs < 3000 ? 0 : 1;
  return {
    youtubeId: 'v',
    chunkIndex: index,
    text: `parent ${index}`,
    startMs: index * 3000,
    endMs: index * 3000 + 3000,
  };
};

describe('ParentChildSearch', () => {
  it('returns the parent text, best parent first, with the best child score', async () => {
    const { inner } = innerReturning([child(4, 0.9), child(1, 0.8), child(5, 0.7)]);
    const result = await new ParentChildSearch(inner, parentOf).search('q', ['v'], 5);

    expect(result.map((c) => c.text)).toEqual(['parent 1', 'parent 0']);
    expect(result.map((c) => c.score)).toEqual([0.9, 0.8]);
  });

  it('lists a parent once even when several of its children match', async () => {
    const { inner } = innerReturning([child(0, 0.9), child(1, 0.85), child(2, 0.8)]);
    const result = await new ParentChildSearch(inner, parentOf).search('q', ['v'], 5);
    expect(result).toHaveLength(1);
  });

  it('stops at the number of parents asked for', async () => {
    const { inner } = innerReturning([child(0, 0.9), child(4, 0.8)]);
    expect(await new ParentChildSearch(inner, parentOf).search('q', ['v'], 1)).toHaveLength(1);
  });

  it('asks the search underneath for more small chunks than parents', async () => {
    const { inner, search } = innerReturning([]);
    await new ParentChildSearch(inner, parentOf).search('q', ['v'], 12);
    expect(search).toHaveBeenCalledWith('q', ['v'], 48);
  });

  it('keeps the name and margin of the search underneath', () => {
    const { inner } = innerReturning([]);
    const search = new ParentChildSearch(inner, parentOf);
    expect(search.name).toBe('dense');
    expect(search.maxScoreDrop).toBe(0.12);
  });

  it('fails loudly when a chunk has no parent', async () => {
    const { inner } = innerReturning([child(0, 0.9)]);
    await expect(
      new ParentChildSearch(inner, () => undefined).search('q', ['v'], 5),
    ).rejects.toThrow('Ingest the parent chunking');
  });
});
