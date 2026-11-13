import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CachingEmbedder } from './cachingEmbedder.js';
import type { Embedder } from './embedder.js';

/** An embedder that counts its calls and turns a text into a small predictable vector. */
function fakeEmbedder(dimensions = 3) {
  const queries: string[] = [];
  const embedder: Embedder = {
    dimensions,
    embedDocuments: (texts) => Promise.resolve(texts.map((t) => [t.length, 0, 0])),
    embedQuery: (text) => {
      queries.push(text);
      return Promise.resolve([text.length, 1, 0]);
    },
  };
  return { embedder, queries };
}

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'embed-cache-'));
  path = join(dir, 'nested', 'queries.json');
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('CachingEmbedder', () => {
  it('asks the real embedder once and answers a repeat from memory', async () => {
    const { embedder, queries } = fakeEmbedder();
    const cached = new CachingEmbedder(embedder, path, 'model-a');

    const first = await cached.embedQuery('what is RPO?');
    const second = await cached.embedQuery('what is RPO?');

    expect(second).toEqual(first);
    expect(queries).toEqual(['what is RPO?']);
  });

  it('keeps the answers in a file, so a new run does not ask again', async () => {
    const run1 = fakeEmbedder();
    await new CachingEmbedder(run1.embedder, path, 'model-a').embedQuery('what is RPO?');

    const run2 = fakeEmbedder();
    const vector = await new CachingEmbedder(run2.embedder, path, 'model-a').embedQuery(
      'what is RPO?',
    );

    expect(run2.queries).toEqual([]);
    expect(vector).toEqual([12, 1, 0]);
  });

  it('saves after every new question, so a run that stops halfway keeps what it did', async () => {
    const { embedder } = fakeEmbedder();
    const cached = new CachingEmbedder(embedder, path, 'model-a');
    await cached.embedQuery('first');
    expect(Object.keys(JSON.parse(await readFile(path, 'utf8')))).toHaveLength(1);
    await cached.embedQuery('second');
    expect(Object.keys(JSON.parse(await readFile(path, 'utf8')))).toHaveLength(2);
  });

  it('does not reuse vectors from another model or another vector size', async () => {
    await new CachingEmbedder(fakeEmbedder(3).embedder, path, 'model-a').embedQuery('same text');

    const otherModel = fakeEmbedder(3);
    await new CachingEmbedder(otherModel.embedder, path, 'model-b').embedQuery('same text');
    expect(otherModel.queries).toEqual(['same text']);

    const otherSize = fakeEmbedder(5);
    await new CachingEmbedder(otherSize.embedder, path, 'model-a').embedQuery('same text');
    expect(otherSize.queries).toEqual(['same text']);
  });

  it('does not cache failures: a question that failed is asked again next time', async () => {
    let calls = 0;
    const flaky: Embedder = {
      dimensions: 3,
      embedDocuments: () => Promise.resolve([]),
      embedQuery: () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('429')) : Promise.resolve([1, 2, 3]);
      },
    };
    const cached = new CachingEmbedder(flaky, path, 'model-a');

    await expect(cached.embedQuery('q')).rejects.toThrow('429');
    expect(await cached.embedQuery('q')).toEqual([1, 2, 3]);
  });

  it('passes documents straight through without caching them', async () => {
    const { embedder } = fakeEmbedder();
    const cached = new CachingEmbedder(embedder, path, 'model-a');
    expect(await cached.embedDocuments(['abc'])).toEqual([[3, 0, 0]]);
    await expect(readFile(path, 'utf8')).rejects.toThrow(); // nothing was written
  });

  it('reports the dimensions of the embedder it wraps', () => {
    expect(new CachingEmbedder(fakeEmbedder(768).embedder, path).dimensions).toBe(768);
  });

  it('counts how many questions are not cached yet, without asking the embedder', async () => {
    const { embedder, queries } = fakeEmbedder();
    const cached = new CachingEmbedder(embedder, path, 'model-a');
    await cached.embedQuery('known');
    queries.length = 0;

    expect(await cached.countMissing(['known', 'new one', 'new one', 'another'])).toBe(2);
    expect(queries).toEqual([]);
  });
});
