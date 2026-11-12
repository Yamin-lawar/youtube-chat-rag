// One-off migration for hybrid search: rebuild a collection that was made before sparse vectors
// existed. Qdrant cannot add a sparse vector to an existing collection, so this reads every stored
// chunk (text, times and its dense vector), drops the collection, creates it again with the
// sparse vector, and writes the chunks back. Nothing is embedded again, so no API key is used.
//   npx tsx --env-file=../.env scripts/add-sparse-vectors.ts
import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../src/config.js';
import { RecursiveChunker } from '../src/rag/chunking/recursiveChunker.js';
import { EMBEDDING_DIMENSIONS } from '../src/rag/embeddings/embedder.js';
import { QdrantChunkStore, type ChunkPayload } from '../src/rag/vectorstore/qdrantChunkStore.js';

const client = new QdrantClient({ url: config.QDRANT_URL });
const collectionName = `chunks_${new RecursiveChunker().name}`;
const store = new QdrantChunkStore(client, collectionName, EMBEDDING_DIMENSIONS);

interface StoredChunk {
  payload: ChunkPayload;
  dense: number[];
}

async function readAll(): Promise<StoredChunk[]> {
  const stored: StoredChunk[] = [];
  let offset: string | number | undefined;
  do {
    const page = await client.scroll(collectionName, {
      limit: 100,
      offset,
      with_payload: true,
      with_vector: ['dense'],
    });
    for (const point of page.points) {
      const dense = (point.vector as Record<string, unknown> | null | undefined)?.dense;
      if (!Array.isArray(dense)) throw new Error(`Point ${String(point.id)} has no dense vector`);
      stored.push({ payload: point.payload as unknown as ChunkPayload, dense: dense as number[] });
    }
    offset = (page.next_page_offset as string | number | null | undefined) ?? undefined;
  } while (offset !== undefined);
  return stored;
}

const { exists } = await client.collectionExists(collectionName);
if (!exists) {
  console.log(`Collection "${collectionName}" does not exist. Nothing to migrate.`);
  process.exit(0);
}

const stored = await readAll();
console.log(`Read ${stored.length} chunks from "${collectionName}".`);

const byVideo = new Map<string, StoredChunk[]>();
for (const item of stored) {
  const list = byVideo.get(item.payload.youtubeId) ?? [];
  list.push(item);
  byVideo.set(item.payload.youtubeId, list);
}

// Everything is in memory now. From here the collection is rebuilt.
await client.deleteCollection(collectionName);
await store.ensureCollection();

for (const [youtubeId, items] of byVideo) {
  const chunks = items.map(({ payload }) => ({
    index: payload.chunkIndex,
    text: payload.text,
    startMs: payload.startMs,
    endMs: payload.endMs,
  }));
  await store.replaceVideoChunks(
    youtubeId,
    chunks,
    items.map((item) => item.dense),
  );
  console.log(`  ${youtubeId}: ${chunks.length} chunks`);
}

const { points_count: after } = await client.getCollection(collectionName);
console.log(`\nDone. "${collectionName}" now has ${after} chunks (was ${stored.length}).`);
