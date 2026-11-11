// RAG block 6: the full question-answering path (retrieve, then generate).
//   npx tsx --env-file=../.env scripts/ask.ts "your question" <youtube-id>[,<youtube-id>...]
import { QdrantClient } from '@qdrant/js-client-rest';
import { RecursiveChunker } from '../src/rag/chunking/recursiveChunker.js';
import { config } from '../src/config.js';
import { EMBEDDING_DIMENSIONS, GeminiEmbedder } from '../src/rag/embeddings/embedder.js';
import { createGenerator } from '../src/rag/generation/providers.js';
import { buildUserPrompt, formatTimestamp } from '../src/rag/generation/prompt.js';
import { retrieveChunks } from '../src/rag/retrieval/retriever.js';
import { createSearch } from '../src/rag/search/createSearch.js';
import { QdrantChunkStore } from '../src/rag/vectorstore/qdrantChunkStore.js';

const question = process.argv[2];
const youtubeIds = (process.argv[3] ?? '').split(',').filter(Boolean);

if (!question || youtubeIds.length === 0) {
  console.error('Usage: scripts/ask.ts "question" <youtube-id>[,<youtube-id>...]');
  process.exit(1);
}

const store = new QdrantChunkStore(
  new QdrantClient({ url: config.QDRANT_URL }),
  `chunks_${new RecursiveChunker().name}`,
  EMBEDDING_DIMENSIONS,
);
const embedder = new GeminiEmbedder(config.GOOGLE_API_KEY);

const search = createSearch(config.SEARCH_STRATEGY, { embedder, store });
const chunks = await retrieveChunks(question, { search }, { youtubeIds });

console.log('--- The prompt sent to Gemini (user message) ---\n');
console.log(buildUserPrompt(question, chunks));

const answer = await createGenerator({
  googleApiKey: config.GOOGLE_API_KEY,
  groqApiKey: config.GROQ_API_KEY,
}).generate(question, chunks);

console.log(`\n--- Answer (written by ${answer.model}) ---\n`);
console.log(answer.text);

console.log('\n--- Sources ---');
for (const source of answer.sources) {
  console.log(`[${source.number}] ${source.youtubeId} at ${formatTimestamp(source.startMs)}`);
}
