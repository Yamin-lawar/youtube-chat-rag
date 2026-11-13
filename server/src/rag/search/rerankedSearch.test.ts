import { describe, expect, it } from 'vitest';
import type { Reranker } from '../rerank/types.js';
import type { ScoredChunk } from '../vectorstore/qdrantChunkStore.js';
import { RERANK_CANDIDATES, RerankedSearch } from './rerankedSearch.js';
import type { SearchStrategy } from './types.js';

function chunk(chunkIndex: number): ScoredChunk {
  return {
    youtubeId: 'abc123DEF45',
    chunkIndex,
    text: `chunk ${chunkIndex}`,
    startMs: 0,
    endMs: 1000,
    score: 1,
  };
}

const indexes = (chunks: ScoredChunk[]) => chunks.map((c) => c.chunkIndex);

/** A search that returns chunks 1, 2, 3... and remembers the limit it was asked for. */
function fakeSearch(name: 'dense' | 'hybrid' = 'dense') {
  const limits: number[] = [];
  const search: SearchStrategy = {
    name,
    maxScoreDrop: 0.12,
    search: (_question, _ids, limit) => {
      limits.push(limit);
      return Promise.resolve(Array.from({ length: limit }, (_, i) => chunk(i + 1)));
    },
  };
  return { search, limits };
}

/** A reranker that puts the chunks in reverse order. */
const reverse: Reranker = {
  name: 'reverse',
  rerank: (_question, chunks) => Promise.resolve([...chunks].reverse()),
};

describe('RerankedSearch', () => {
  it('asks the search for more chunks than the limit, so the reranker has room to promote', async () => {
    const { search, limits } = fakeSearch();
    await new RerankedSearch(search, reverse).search('q', ['abc123DEF45'], 5);
    expect(limits).toEqual([RERANK_CANDIDATES]);
  });

  it('asks for the limit itself when that is larger than the candidates', async () => {
    const { search, limits } = fakeSearch();
    await new RerankedSearch(search, reverse).search('q', ['abc123DEF45'], 50);
    expect(limits).toEqual([50]);
  });

  it('returns the reranked order, cut to the limit', async () => {
    const { search } = fakeSearch();
    const result = await new RerankedSearch(search, reverse, 6).search('q', ['abc123DEF45'], 3);
    expect(indexes(result)).toEqual([6, 5, 4]);
  });

  it('can bring up a chunk that the search ranked low', async () => {
    const { search } = fakeSearch();
    const promoteLast: Reranker = {
      name: 'promote-last',
      rerank: (_q, chunks) => Promise.resolve([chunks.at(-1)!, ...chunks.slice(0, -1)]),
    };
    const result = await new RerankedSearch(search, promoteLast, 10).search('q', ['x'], 2);
    expect(indexes(result)).toEqual([10, 1]);
  });

  it('reports the name of the search it wraps and keeps every chunk (no margin)', () => {
    const { search } = fakeSearch('hybrid');
    const reranked = new RerankedSearch(search, reverse);
    expect(reranked.name).toBe('hybrid');
    expect(reranked.maxScoreDrop).toBe(Number.POSITIVE_INFINITY);
  });
});
