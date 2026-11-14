import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CachingQueryExpander } from './cachingQueryExpander.js';
import type { QueryExpander } from './types.js';

function countingExpander(id = 'x') {
  const calls: string[] = [];
  const expander: QueryExpander = {
    id,
    expand: (question) => {
      calls.push(question);
      return question === 'bad'
        ? Promise.reject(new Error('down'))
        : Promise.resolve([`about ${question}`]);
    },
  };
  return { expander, calls };
}

const tempPath = async () => join(await mkdtemp(join(tmpdir(), 'expansions-')), 'sub', 'e.json');

describe('CachingQueryExpander', () => {
  it('asks the model once per question, also across new cache objects', async () => {
    const path = await tempPath();
    const first = countingExpander();
    expect(await new CachingQueryExpander(first.expander, path).expand('a')).toEqual(['about a']);

    const second = countingExpander();
    const again = new CachingQueryExpander(second.expander, path);
    expect(await again.expand('a')).toEqual(['about a']);
    expect(second.calls).toEqual([]);
  });

  it('does not reuse text written by another prompt or model', async () => {
    const path = await tempPath();
    await new CachingQueryExpander(countingExpander('one').expander, path).expand('a');
    const other = countingExpander('two');
    await new CachingQueryExpander(other.expander, path).expand('a');
    expect(other.calls).toEqual(['a']);
  });

  it('does not save a failure, so it is tried again', async () => {
    const { expander, calls } = countingExpander();
    const cache = new CachingQueryExpander(expander, await tempPath());
    await expect(cache.expand('bad')).rejects.toThrow('down');
    await expect(cache.expand('bad')).rejects.toThrow('down');
    expect(calls).toEqual(['bad', 'bad']);
  });

  it('counts the questions that are not cached yet', async () => {
    const cache = new CachingQueryExpander(countingExpander().expander, await tempPath());
    await cache.expand('a');
    expect(await cache.countMissing(['a', 'b', 'b', 'c'])).toBe(2);
  });
});
