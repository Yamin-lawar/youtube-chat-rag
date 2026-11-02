// RAG block 4: run the whole ingestion pipeline and store the result in Qdrant.
//   npx tsx --env-file=../.env scripts/ingest-video.ts [youtube-id]
import { QdrantClient } from '@qdrant/js-client-rest';
import { RecursiveChunker } from '../src/rag/chunking/recursiveChunker.js';
import { config } from '../src/config.js';
import { EMBEDDING_DIMENSIONS, GeminiEmbedder } from '../src/rag/embeddings/embedder.js';
import { ingestVideo } from '../src/rag/ingest.js';
import { YoutubeTranscriptProvider } from '../src/rag/transcript/youtubeProvider.js';
import { QdrantChunkStore } from '../src/rag/vectorstore/qdrantChunkStore.js';

const youtubeId = process.argv[2] ?? 'JljlsOJmlCA';

const chunker = new RecursiveChunker();
const client = new QdrantClient({ url: config.QDRANT_URL });
// One collection per chunking strategy, so strategies can be compared later.
const collectionName = `chunks_${chunker.name}`;
const store = new QdrantChunkStore(client, collectionName, EMBEDDING_DIMENSIONS);

console.log(`Ingesting ${youtubeId} into collection "${collectionName}"...`);
const result = await ingestVideo(youtubeId, {
  transcriptProvider: new YoutubeTranscriptProvider(),
  chunker,
  embedder: new GeminiEmbedder(config.GOOGLE_API_KEY),
  store,
});

console.log('\nsegments read:   ', result.segmentCount);
console.log('chunks created:  ', result.chunkCount);
console.log('chunks in Qdrant:', await store.countChunks(youtubeId));

console.log('\nFirst 2 stored chunks (read back from Qdrant):');
for (const chunk of await store.sampleChunks(youtubeId, 2)) {
  console.log(
    `  #${chunk.chunkIndex}  ${chunk.startMs}ms - ${chunk.endMs}ms  ${chunk.text.slice(0, 80)}...`,
  );
}

console.log(
  `\nLook at it in the dashboard: http://localhost:6333/dashboard#/collections/${collectionName}`,
);
