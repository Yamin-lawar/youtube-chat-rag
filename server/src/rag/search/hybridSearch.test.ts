import { describe, expect, it } from 'vitest';
import type { Embedder } from '../embeddings/embedder.js';
import type { QdrantChunkStore, ScoredChunk } from '../vectorstore/qdrantChunkStore.js';
import type { SparseVector } from './bm25.js';
import { HybridSearch } from './hybridSearch.js';

function chunk(chunkIndex: number): ScoredChunk {
  return {
    youtubeId: 'abc123DEF45',
    chunkIndex,
    text: `chunk ${chunkIndex}`,
    startMs: 0,
    endMs: 1000,
    score: 0,
  };
}

/** Fake store and embedder that return fixed lists and remember how they were called. */
function setup(dense: number[], sparse: number[]) {
  const calls = { dense: [] as unknown[][], sparse: [] as unknown[][], embedded: [] as string[] };
  const embedder = {
    embedQuery: (text: string) => {
      calls.embedded.push(text);
      return Promise.resolve([1, 0, 0]);
    },
  } as unknown as Embedder;
  const store = {
    search: (...args: unknown[]) => {
      calls.dense.push(args);
      return Promise.resolve(dense.map(chunk));
    },
    searchSparse: (...args: unknown[]) => {
      calls.sparse.push(args);
      return Promise.resolve(sparse.map(chunk));
    },
  } as unknown as QdrantChunkStore;
  return { search: new HybridSearch(embedder, store), calls };
}

const indexes = (chunks: ScoredChunk[]) => chunks.map((c) => c.chunkIndex);

describe('HybridSearch', () => {
  it('merges the meaning list and the word list, with chunks found by both on top', async () => {
    const { search } = setup([1, 2, 3], [4, 2]);
    expect(indexes(await search.search('rpo', ['abc123DEF45'], 10))).toEqual([2, 1, 4, 3]);
  });

  it('still returns chunks that only the word search found', async () => {
    const { search } = setup([1], [9]);
    expect(indexes(await search.search('gartner', ['abc123DEF45'], 10))).toContain(9);
  });

  it('works when the question has no usable words and the word search is empty', async () => {
    const { search } = setup([1, 2], []);
    expect(indexes(await search.search('what is the', ['abc123DEF45'], 10))).toEqual([1, 2]);
  });

  it('cuts the merged list to the limit', async () => {
    const { search } = setup([1, 2, 3], [4, 5, 6]);
    expect(await search.search('q', ['abc123DEF45'], 2)).toHaveLength(2);
  });

  it('asks each search for more chunks than the limit, so the fusion has room', async () => {
    const { search, calls } = setup([1], [1]);
    await search.search('q', ['abc123DEF45'], 5);
    expect(calls.dense[0]?.[2]).toBe(20);
    expect(calls.sparse[0]?.[2]).toBe(20);

    await search.search('q', ['abc123DEF45'], 50);
    expect(calls.dense[1]?.[2]).toBe(50);
  });

  it('sends the question words, the chosen videos and the embedding to the right search', async () => {
    const { search, calls } = setup([1], [1]);
    await search.search('Gartner forecast', ['abc123DEF45'], 5);

    expect(calls.embedded).toEqual(['Gartner forecast']);
    expect(calls.dense[0]?.[0]).toEqual([1, 0, 0]);
    expect(calls.dense[0]?.[1]).toEqual(['abc123DEF45']);
    expect((calls.sparse[0]?.[0] as SparseVector).indices).toHaveLength(2);
    expect(calls.sparse[0]?.[1]).toEqual(['abc123DEF45']);
  });

  it('keeps every chunk it returns, because its scores are not cosine scores', () => {
    const { search } = setup([], []);
    expect(search.maxScoreDrop).toBe(Number.POSITIVE_INFINITY);
  });
});
