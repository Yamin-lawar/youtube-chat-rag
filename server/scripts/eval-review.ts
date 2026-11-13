// Check the eval questions before trusting any score.
//
//   npx tsx --env-file=../.env scripts/eval-review.ts          all questions
//   npx tsx --env-file=../.env scripts/eval-review.ts q04 q11  only these
//
// For each question it shows (1) where the answer is, found from the quotes in
// eval/questions.json, and (2) what retrieval returns, marking every chunk that covers a
// correct passage. Read it like a teacher marking homework: are the labels right, and is
// retrieval finding them?
import { QdrantClient } from '@qdrant/js-client-rest';
import { RecursiveChunker } from '../src/rag/chunking/recursiveChunker.js';
import { config } from '../src/config.js';
import { chunkCoversSpan, findEvidenceSpans } from '../src/eval/evidence.js';
import { loadQuestions } from '../src/eval/questions.js';
import type { TimeSpan } from '../src/eval/types.js';
import { CachingEmbedder } from '../src/rag/embeddings/cachingEmbedder.js';
import { EMBEDDING_DIMENSIONS, GeminiEmbedder } from '../src/rag/embeddings/embedder.js';
import { formatTimestamp } from '../src/rag/generation/prompt.js';
import { DEFAULT_TOP_K, retrieveChunks } from '../src/rag/retrieval/retriever.js';
import { createReranker } from '../src/rag/rerank/models.js';
import { createSearch } from '../src/rag/search/createSearch.js';
import { QdrantChunkStore, type ChunkPayload } from '../src/rag/vectorstore/qdrantChunkStore.js';

const wanted = new Set(process.argv.slice(2));
const all = await loadQuestions(new URL('../eval/questions.json', import.meta.url).pathname);
const questions = wanted.size > 0 ? all.filter((q) => wanted.has(q.id)) : all;

const store = new QdrantChunkStore(
  new QdrantClient({ url: config.QDRANT_URL }),
  `chunks_${new RecursiveChunker().name}`,
  EMBEDDING_DIMENSIONS,
);
// Shares the eval's cache of question embeddings, so reviewing a label costs no API call.
const embedder = new CachingEmbedder(
  new GeminiEmbedder(config.GOOGLE_API_KEY),
  new URL('../eval/cache/query-embeddings.json', import.meta.url).pathname,
);
// SEARCH_STRATEGY=hybrid npx tsx ... reviews another strategy.
const search = createSearch(config.SEARCH_STRATEGY, {
  embedder,
  store,
  sparseWeight: config.HYBRID_SPARSE_WEIGHT,
  reranker: createReranker(config.RERANKER),
});

// All stored chunks of the videos used, to look the quotes up in.
const stored: ChunkPayload[] = [];
for (const youtubeId of new Set(questions.flatMap((q) => q.youtubeIds))) {
  stored.push(...(await store.sampleChunks(youtubeId, 1000)));
}

const range = (s: TimeSpan) => `${formatTimestamp(s.startMs)}-${formatTimestamp(s.endMs)}`;
let problems = 0;

console.log(
  `Settings: search ${search.name}, topK ${DEFAULT_TOP_K}, margin ${search.maxScoreDrop}\n`,
);

for (const q of questions) {
  console.log('='.repeat(78));
  console.log(`${q.id} [${q.type}] ${q.question}`);
  console.log(`videos: ${q.youtubeIds.join(', ')}`);

  // 1. Where is the answer?
  const gold = q.evidence.map((item) => ({ item, spans: findEvidenceSpans(stored, item) }));
  for (const { item, spans } of gold) {
    const where = spans.length === 0 ? 'NOT FOUND' : spans.map(range).join(' and ');
    console.log(`  GOLD  ${item.youtubeId} ${where}`);
    console.log(`        "${item.quote}"`);
    if (spans.length === 0) {
      problems++;
      console.log('        ^^ the quote does not appear in the stored chunks, fix it');
    } else if (spans.length > 1) {
      problems++;
      console.log('        ^^ the quote is said in more than one place, make it more specific');
    }
  }

  // 2. What does retrieval return?
  const kept = await retrieveChunks(q.question, { search }, { youtubeIds: q.youtubeIds });
  console.log(`  RETRIEVED ${kept.length} chunks:`);
  kept.forEach((chunk, i) => {
    const covers = gold.some(({ spans }) => spans.some((span) => chunkCoversSpan(chunk, span)));
    console.log(
      `   ${String(i + 1).padStart(2)} ${covers ? 'GOLD' : '    '} ${chunk.score.toFixed(3)} ${chunk.youtubeId} #${chunk.chunkIndex} @${formatTimestamp(chunk.startMs)}`,
    );
  });

  // 3. A quick verdict per piece of evidence.
  if (gold.length > 0) {
    const found = gold.filter(({ spans }) =>
      kept.some((chunk) => spans.some((span) => chunkCoversSpan(chunk, span))),
    ).length;
    const firstRank =
      kept.findIndex((chunk) =>
        gold.some(({ spans }) => spans.some((span) => chunkCoversSpan(chunk, span))),
      ) + 1;
    console.log(
      `  => found ${found} of ${gold.length} evidence, first correct chunk at rank ${firstRank || 'none'}`,
    );
  } else {
    console.log(
      '  => no answer exists; a good system should score low here (see the scores above)',
    );
  }
  console.log();
}

console.log(`${questions.length} questions shown, ${problems} label problem(s).`);
