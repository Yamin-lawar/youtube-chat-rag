import { QdrantClient } from '@qdrant/js-client-rest';
import { v5 as uuidv5 } from 'uuid';
import type { Chunk } from '../chunking/types.js';
import { AVERAGE_CHUNK_WORDS, documentVector, type SparseVector } from '../search/bm25.js';

// Each point holds two named vectors: the embedding (search by meaning) and a BM25 sparse
// vector (search by exact words). Hybrid search uses both.
const DENSE_VECTOR_NAME = 'dense';
const SPARSE_VECTOR_NAME = 'bm25';
const UPSERT_BATCH_SIZE = 100;

// Any fixed UUID works. It only needs to stay the same so ids are stable between runs.
const ID_NAMESPACE = '3f2c9a52-6d1e-4b7a-9c58-0e4d7b1a8f26';

/** What we keep next to each vector. Qdrant returns this with every search result. */
export interface ChunkPayload {
  youtubeId: string;
  chunkIndex: number;
  text: string;
  startMs: number;
  endMs: number;
}

/** A stored chunk returned by a search, with its cosine similarity to the question. */
export interface ScoredChunk extends ChunkPayload {
  score: number;
}

/**
 * Qdrant point ids must be UUIDs or integers. Deriving the UUID from the video and chunk
 * number means ingesting the same video twice overwrites its points instead of duplicating them.
 */
export function chunkPointId(youtubeId: string, chunkIndex: number): string {
  return uuidv5(`${youtubeId}:${chunkIndex}`, ID_NAMESPACE);
}

/**
 * Stores transcript chunks and their embeddings in one Qdrant collection.
 * Use a different collection per experiment (for example per chunking strategy) so
 * strategies can be compared without overwriting each other.
 */
export class QdrantChunkStore {
  constructor(
    private readonly client: QdrantClient,
    private readonly collectionName: string,
    private readonly dimensions: number,
  ) {}

  /**
   * Creates the collection the first time it is needed. Safe to call repeatedly.
   * A collection made before hybrid search has no sparse vector, and Qdrant cannot add one
   * to an existing collection, so that case is reported instead of failing on the first upsert.
   */
  async ensureCollection(): Promise<void> {
    const { exists } = await this.client.collectionExists(this.collectionName);
    if (exists) {
      await this.assertHasSparseVector();
      return;
    }

    await this.client.createCollection(this.collectionName, {
      vectors: {
        // The vector size must match the embedding model, and the distance metric
        // is how Qdrant compares vectors at search time.
        [DENSE_VECTOR_NAME]: { size: this.dimensions, distance: 'Cosine' },
      },
      sparse_vectors: {
        // `idf` makes Qdrant weigh each word by how rare it is across all chunks, so the
        // client only sends the within-chunk part of BM25 (see bm25.ts).
        [SPARSE_VECTOR_NAME]: { modifier: 'idf' },
      },
    });

    // An index on youtubeId makes "only search these videos" fast. Without it,
    // Qdrant would check the payload of every point to apply the filter.
    await this.client.createPayloadIndex(this.collectionName, {
      field_name: 'youtubeId',
      field_schema: 'keyword',
      wait: true,
    });
  }

  private async assertHasSparseVector(): Promise<void> {
    const { config } = await this.client.getCollection(this.collectionName);
    if (!config.params.sparse_vectors?.[SPARSE_VECTOR_NAME]) {
      throw new Error(
        `Collection "${this.collectionName}" has no "${SPARSE_VECTOR_NAME}" sparse vector. ` +
          'Run `npx tsx --env-file=../.env scripts/add-sparse-vectors.ts` from server/ to rebuild it.',
      );
    }
  }

  /** Replaces all stored chunks of a video, so a re-ingest never leaves stale points behind. */
  async replaceVideoChunks(youtubeId: string, chunks: Chunk[], vectors: number[][]): Promise<void> {
    if (chunks.length !== vectors.length) {
      throw new Error(`Got ${chunks.length} chunks but ${vectors.length} vectors`);
    }

    await this.deleteVideo(youtubeId);

    const points = chunks.map((chunk, i) => ({
      id: chunkPointId(youtubeId, chunk.index),
      vector: {
        [DENSE_VECTOR_NAME]: vectors[i]!,
        [SPARSE_VECTOR_NAME]: documentVector(chunk.text, AVERAGE_CHUNK_WORDS),
      },
      payload: {
        youtubeId,
        chunkIndex: chunk.index,
        text: chunk.text,
        startMs: chunk.startMs,
        endMs: chunk.endMs,
      } satisfies ChunkPayload,
    }));

    for (let start = 0; start < points.length; start += UPSERT_BATCH_SIZE) {
      await this.client.upsert(this.collectionName, {
        wait: true,
        points: points.slice(start, start + UPSERT_BATCH_SIZE),
      });
    }
  }

  /**
   * Finds the chunks closest to a question vector, best first. Only the given videos
   * are searched, which is how a chat limits its answers to the videos picked for it.
   */
  async search(vector: number[], youtubeIds: string[], limit: number): Promise<ScoredChunk[]> {
    const { points } = await this.client.query(this.collectionName, {
      query: vector,
      using: DENSE_VECTOR_NAME,
      limit,
      with_payload: true,
      filter: { must: [{ key: 'youtubeId', match: { any: youtubeIds } }] },
    });
    return points.map((point) => ({
      ...(point.payload as unknown as ChunkPayload),
      score: point.score,
    }));
  }

  /**
   * Finds the chunks that share the most (rare) words with the question, best first.
   * The score is a BM25-style keyword score: only its order matters, not its size.
   * Returns nothing when the question has no words left after stop words are removed.
   */
  async searchSparse(
    vector: SparseVector,
    youtubeIds: string[],
    limit: number,
  ): Promise<ScoredChunk[]> {
    if (vector.indices.length === 0) return [];

    const { points } = await this.client.query(this.collectionName, {
      query: vector,
      using: SPARSE_VECTOR_NAME,
      limit,
      with_payload: true,
      filter: { must: [{ key: 'youtubeId', match: { any: youtubeIds } }] },
    });
    return points.map((point) => ({
      ...(point.payload as unknown as ChunkPayload),
      score: point.score,
    }));
  }

  async deleteVideo(youtubeId: string): Promise<void> {
    await this.client.delete(this.collectionName, {
      wait: true,
      filter: { must: [{ key: 'youtubeId', match: { value: youtubeId } }] },
    });
  }

  async countChunks(youtubeId: string): Promise<number> {
    const { count } = await this.client.count(this.collectionName, {
      exact: true,
      filter: { must: [{ key: 'youtubeId', match: { value: youtubeId } }] },
    });
    return count;
  }

  /** Reads a few stored chunks back, for checking what actually ended up in Qdrant. */
  async sampleChunks(youtubeId: string, limit: number): Promise<ChunkPayload[]> {
    const { points } = await this.client.scroll(this.collectionName, {
      limit,
      with_payload: true,
      with_vector: false,
      filter: { must: [{ key: 'youtubeId', match: { value: youtubeId } }] },
    });
    return points.map((point) => point.payload as unknown as ChunkPayload);
  }
}
