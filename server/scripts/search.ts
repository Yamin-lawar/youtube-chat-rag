// RAG block 5: ask a question and see which chunks retrieval returns.
//   npx tsx --env-file=../.env scripts/search.ts "your question" <youtube-id>[,<youtube-id>...]
import { QdrantClient } from '@qdrant/js-client-rest';
import { RecursiveChunker } from '../src/rag/chunking/recursiveChunker.js';
import { config } from '../src/config.js';
import { EMBEDDING_DIMENSIONS, GeminiEmbedder } from '../src/rag/embeddings/embedder.js';
import { retrieveChunks } from '../src/rag/retrieval/retriever.js';
import { QdrantChunkStore } from '../src/rag/vectorstore/qdrantChunkStore.js';

const question = process.argv[2];
const youtubeIds = (process.argv[3] ?? '').split(',').filter(Boolean);

if (!question || youtubeIds.length === 0) {
  console.error('Usage: scripts/search.ts "question" <youtube-id>[,<youtube-id>...]');
  process.exit(1);
}

const store = new QdrantChunkStore(
  new QdrantClient({ url: config.QDRANT_URL }),
  `chunks_${new RecursiveChunker().name}`,
  EMBEDDING_DIMENSIONS,
);
const embedder = new GeminiEmbedder(config.GOOGLE_API_KEY);

// Ask for more than the default so you can see what the cutoff removes.
const TOP_K = 8;
const everything = await store.search(await embedder.embedQuery(question), youtubeIds, TOP_K);
const kept = await retrieveChunks(question, { embedder, store }, { youtubeIds, topK: TOP_K });

console.log(`Question: ${question}`);
console.log(`Videos:   ${youtubeIds.join(', ')}\n`);

for (const chunk of everything) {
  const isKept = kept.some(
    (k) => k.youtubeId === chunk.youtubeId && k.chunkIndex === chunk.chunkIndex,
  );
  const seconds = Math.round(chunk.startMs / 1000);
  console.log(
    `${isKept ? 'KEPT   ' : 'dropped'} ${chunk.score.toFixed(4)}  ${chunk.youtubeId} #${chunk.chunkIndex} @${seconds}s`,
  );
  console.log(`          ${chunk.text.slice(0, 160).replace(/\s+/g, ' ')}...\n`);
}

console.log(`${kept.length} of ${everything.length} chunks kept by the cutoff.`);
