// RAG block 7: watch the answer stream in, token by token.
//   npx tsx --env-file=../.env scripts/stream.ts "your question" <youtube-id>[,<youtube-id>...]
import { QdrantClient } from '@qdrant/js-client-rest';
import { RecursiveChunker } from '../src/rag/chunking/recursiveChunker.js';
import { config } from '../src/config.js';
import { EMBEDDING_DIMENSIONS, GeminiEmbedder } from '../src/rag/embeddings/embedder.js';
import { createGenerator } from '../src/rag/generation/providers.js';
import { retrieveChunks } from '../src/rag/retrieval/retriever.js';
import { QdrantChunkStore } from '../src/rag/vectorstore/qdrantChunkStore.js';

const question = process.argv[2];
const youtubeIds = (process.argv[3] ?? '').split(',').filter(Boolean);

if (!question || youtubeIds.length === 0) {
  console.error('Usage: scripts/stream.ts "question" <youtube-id>[,<youtube-id>...]');
  process.exit(1);
}

const store = new QdrantChunkStore(
  new QdrantClient({ url: config.QDRANT_URL }),
  `chunks_${new RecursiveChunker().name}`,
  EMBEDDING_DIMENSIONS,
);
const embedder = new GeminiEmbedder(config.GOOGLE_API_KEY);
const generator = createGenerator({
  googleApiKey: config.GOOGLE_API_KEY,
  groqApiKey: config.GROQ_API_KEY,
});

const chunks = await retrieveChunks(question, { embedder, store }, { youtubeIds });

const startedAt = Date.now();
const answer = await generator.stream(question, chunks);
console.log(`Started after ${Date.now() - startedAt} ms, written by ${answer.model}\n`);

let tokenCount = 0;
let firstTokenAt: number | undefined;
for await (const token of answer.tokens) {
  firstTokenAt ??= Date.now() - startedAt;
  tokenCount++;
  process.stdout.write(token);
}

console.log(
  `\n\n${tokenCount} tokens, first after ${firstTokenAt} ms, finished after ${Date.now() - startedAt} ms`,
);
