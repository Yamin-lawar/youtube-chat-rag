import type { Chunker } from './chunking/types.js';
import type { Embedder } from './embeddings/embedder.js';
import type { TranscriptProvider } from './transcript/types.js';
import type { QdrantChunkStore } from './vectorstore/qdrantChunkStore.js';

export interface IngestDependencies {
  transcriptProvider: TranscriptProvider;
  chunker: Chunker;
  embedder: Embedder;
  store: QdrantChunkStore;
}

export interface IngestResult {
  youtubeId: string;
  segmentCount: number;
  chunkCount: number;
}

/**
 * The ingestion pipeline: video id -> transcript -> chunks -> embeddings -> Qdrant.
 * Each step is passed in, so any of them can be swapped for an experiment.
 */
export async function ingestVideo(
  youtubeId: string,
  { transcriptProvider, chunker, embedder, store }: IngestDependencies,
): Promise<IngestResult> {
  const transcript = await transcriptProvider.getTranscript(youtubeId);
  const chunks = await chunker.chunk(transcript);
  const vectors = await embedder.embedDocuments(chunks.map((chunk) => chunk.text));

  await store.ensureCollection();
  await store.replaceVideoChunks(youtubeId, chunks, vectors);

  return {
    youtubeId,
    segmentCount: transcript.segments.length,
    chunkCount: chunks.length,
  };
}
