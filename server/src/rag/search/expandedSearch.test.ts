import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QueryExpander } from '../expansion/types.js';
import type { ScoredChunk } from '../vectorstore/qdrantChunkStore.js';
import { ExpandedSearch } from './expandedSearch.js';
import type { SearchStrategy } from './types.js';

const chunk = (chunkIndex: number): ScoredChunk => ({
  youtubeId: 'abc123DEF45',
  chunkIndex,
  text: `chunk ${chunkIndex}`,
  startMs: 0,
  endMs: 1000,
  score: 1,
});
const indexes = (chunks: ScoredChunk[]) => chunks.map((c) => c.chunkIndex);

/** A search whose result depends on the text searched, and which records what it was asked. */
function fakeSearch(results: Record<string, number[]>) {
  const asked: Array<{ query: string; limit: number }> = [];
  const search: SearchStrategy = {
    name: 'dense',
    maxScoreDrop: 0.12,
    search: (query, _ids, limit) => {
      asked.push({ query, limit });
      return Promise.resolve((results[query] ?? []).map(chunk));
    },
  };
  return { search, asked };
}

const writes = (...texts: string[]): QueryExpander => ({
  id: 'fake',
  expand: () => Promise.resolve(texts),
});
const broken: QueryExpander = {
  id: 'broken',
  expand: () => Promise.reject(new Error('down\nmore')),
};

afterEach(() => vi.restoreAllMocks());

describe('ExpandedSearch', () => {
  it('searches with the question and the written text, and merges the two lists', async () => {
    const { search, asked } = fakeSearch({ q: [1, 2, 3], 'a passage': [3, 4] });
    const expanded = new ExpandedSearch(search, {
      expander: writes('a passage'),
      keepOriginal: true,
    });

    const result = await expanded.search('q', ['v'], 4);

    expect(asked.map((a) => a.query)).toEqual(['q', 'a passage']);
    // 3 is in both lists (rank 3 and rank 1), so it is the best. Chunks 2 and 4 tie on points
    // (each is 2nd in one list), and the one seen first comes first.
    expect(indexes(result)).toEqual([3, 1, 2, 4]);
  });

  it('searches only with the written text when the original is not kept', async () => {
    const { search, asked } = fakeSearch({ q: [1, 2], 'a passage': [9, 8] });
    const expanded = new ExpandedSearch(search, {
      expander: writes('a passage'),
      keepOriginal: false,
    });

    expect(indexes(await expanded.search('q', ['v'], 5))).toEqual([9, 8]);
    expect(asked.map((a) => a.query)).toEqual(['a passage']);
  });

  it('asks each search for at least 20 chunks, or more when more are wanted', async () => {
    const { search, asked } = fakeSearch({});
    const expanded = new ExpandedSearch(search, { expander: writes('x'), keepOriginal: true });
    await expanded.search('q', ['v'], 12);
    await expanded.search('q', ['v'], 30);
    expect(asked.map((a) => a.limit)).toEqual([20, 20, 30, 30]);
  });

  it('falls back to the question alone, with a warning, when expansion fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { search, asked } = fakeSearch({ q: [1, 2] });
    const expanded = new ExpandedSearch(search, { expander: broken, keepOriginal: false });

    expect(indexes(await expanded.search('q', ['v'], 5))).toEqual([1, 2]);
    expect(asked.map((a) => a.query)).toEqual(['q']);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('searching with the question only: down'),
    );
  });

  it('does not search the same text twice', async () => {
    const { search, asked } = fakeSearch({ q: [1] });
    const expanded = new ExpandedSearch(search, { expander: writes('q'), keepOriginal: true });
    await expanded.search('q', ['v'], 5);
    expect(asked).toHaveLength(1);
  });

  it('reports the name of the search underneath and keeps every result (no margin)', () => {
    const expanded = new ExpandedSearch(fakeSearch({}).search, {
      expander: writes('x'),
      keepOriginal: true,
    });
    expect(expanded.name).toBe('dense');
    expect(expanded.maxScoreDrop).toBe(Number.POSITIVE_INFINITY);
  });
});
