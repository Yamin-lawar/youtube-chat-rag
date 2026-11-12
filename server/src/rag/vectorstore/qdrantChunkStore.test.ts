import type { QdrantClient } from '@qdrant/js-client-rest';
import { describe, expect, it } from 'vitest';
import { AVERAGE_CHUNK_WORDS, documentVector, queryVector } from '../search/bm25.js';
import { QdrantChunkStore, chunkPointId } from './qdrantChunkStore.js';

describe('chunkPointId', () => {
  it('is the same every time for the same video and chunk', () => {
    expect(chunkPointId('abc123DEF45', 3)).toBe(chunkPointId('abc123DEF45', 3));
  });

  it('differs between chunks of a video and between videos', () => {
    expect(chunkPointId('abc123DEF45', 3)).not.toBe(chunkPointId('abc123DEF45', 4));
    expect(chunkPointId('abc123DEF45', 3)).not.toBe(chunkPointId('zzz123DEF45', 3));
  });

  it('is a valid UUID, which is what Qdrant requires', () => {
    expect(chunkPointId('abc123DEF45', 0)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

/** A stand-in for the Qdrant client that records calls, so the store can be tested without Qdrant. */
function fakeClient(options: { exists: boolean; sparseVectors?: Record<string, unknown> }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const record =
    (method: string, result: unknown = {}) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return Promise.resolve(result);
    };
  const client = {
    collectionExists: record('collectionExists', { exists: options.exists }),
    getCollection: record('getCollection', {
      config: { params: { sparse_vectors: options.sparseVectors } },
    }),
    createCollection: record('createCollection'),
    createPayloadIndex: record('createPayloadIndex'),
    query: record('query', { points: [] }),
    upsert: record('upsert'),
    delete: record('delete'),
  };
  return { client: client as unknown as QdrantClient, calls };
}

const names = (calls: { method: string }[]) => calls.map((call) => call.method);

describe('QdrantChunkStore sparse vectors', () => {
  it('creates a new collection with a dense vector and an idf sparse vector', async () => {
    const { client, calls } = fakeClient({ exists: false });
    await new QdrantChunkStore(client, 'test', 768).ensureCollection();

    const create = calls.find((call) => call.method === 'createCollection');
    expect(create?.args[1]).toMatchObject({
      vectors: { dense: { size: 768, distance: 'Cosine' } },
      sparse_vectors: { bm25: { modifier: 'idf' } },
    });
  });

  it('accepts an existing collection that already has the sparse vector', async () => {
    const { client, calls } = fakeClient({ exists: true, sparseVectors: { bm25: {} } });
    await new QdrantChunkStore(client, 'test', 768).ensureCollection();
    expect(names(calls)).not.toContain('createCollection');
  });

  it('refuses an old collection without it and says how to fix it', async () => {
    const { client } = fakeClient({ exists: true, sparseVectors: undefined });
    await expect(new QdrantChunkStore(client, 'test', 768).ensureCollection()).rejects.toThrow(
      /add-sparse-vectors/,
    );
  });

  it('stores a dense and a sparse vector on every point', async () => {
    const { client, calls } = fakeClient({ exists: true, sparseVectors: { bm25: {} } });
    const chunk = { index: 0, text: 'CoreWeave owes debt', startMs: 0, endMs: 1000 };
    await new QdrantChunkStore(client, 'test', 3).replaceVideoChunks(
      'abc123DEF45',
      [chunk],
      [[1, 0, 0]],
    );

    const upsert = calls.find((call) => call.method === 'upsert');
    const [point] = (upsert?.args[1] as { points: { vector: Record<string, unknown> }[] }).points;
    expect(point?.vector.dense).toEqual([1, 0, 0]);
    expect(point?.vector.bm25).toEqual(documentVector(chunk.text, AVERAGE_CHUNK_WORDS));
  });

  it('does not call Qdrant for a question with no usable words', async () => {
    const { client, calls } = fakeClient({ exists: true, sparseVectors: { bm25: {} } });
    const found = await new QdrantChunkStore(client, 'test', 3).searchSparse(
      queryVector('what is the'),
      ['abc123DEF45'],
      5,
    );
    expect(found).toEqual([]);
    expect(names(calls)).not.toContain('query');
  });

  it('searches the sparse vector, limited to the chosen videos', async () => {
    const { client, calls } = fakeClient({ exists: true, sparseVectors: { bm25: {} } });
    const vector = queryVector('coreweave debt');
    await new QdrantChunkStore(client, 'test', 3).searchSparse(vector, ['abc123DEF45'], 5);

    expect(calls.find((call) => call.method === 'query')?.args[1]).toMatchObject({
      query: vector,
      using: 'bm25',
      limit: 5,
      filter: { must: [{ key: 'youtubeId', match: { any: ['abc123DEF45'] } }] },
    });
  });
});
