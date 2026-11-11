// RAG block 5: ask a question and see which chunks retrieval returns.
//   npx tsx --env-file=../.env scripts/search.ts "your question" <youtube-id>[,<youtube-id>...]
import { QdrantClient } from '@qdrant/js-client-rest';
import { RecursiveChunker } from '../src/rag/chunking/recursiveChunker.js';
import { config } from '../src/config.js';
import { EMBEDDING_DIMENSIONS, GeminiEmbedder } from '../src/rag/embeddings/embedder.js';
import { DEFAULT_TOP_K, retrieveChunks } from '../src/rag/retrieval/retriever.js';
import { createSearch } from '../src/rag/search/createSearch.js';
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
// SEARCH_STRATEGY=hybrid npx tsx ... switches the strategy for one run.
const search = createSearch(config.SEARCH_STRATEGY, { embedder, store });

// Look at a few more candidates than retrieval keeps, so you can see what falls outside it.
const EXTRA_CANDIDATES = 8;
const everything = await search.search(question, youtubeIds, DEFAULT_TOP_K + EXTRA_CANDIDATES);
const kept = await retrieveChunks(question, { search }, { youtubeIds });

console.log(`Question: ${question}`);
console.log(`Videos:   ${youtubeIds.join(', ')}`);
console.log(
  `Settings: search ${search.name}, topK ${DEFAULT_TOP_K}, margin ${search.maxScoreDrop}\n`,
);

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

console.log(`${kept.length} chunks kept (of ${everything.length} candidates shown).`);
