// Score retrieval on the eval questions. Prints hit rate, recall and MRR.
//
//   npm run eval --workspace server
//   npm run eval --workspace server -- --label hybrid      name the run
//   npm run eval --workspace server -- --save-baseline     keep this run as the one to beat
//   npm run eval --workspace server -- --strategy hybrid   dense (default) or hybrid
//   npm run eval --workspace server -- --strategy hybrid --sparse-weight 0.5   hybrid, keyword list counts half
//   npm run eval --workspace server -- --reranker minilm    re-order the results with a local model (minilm, bge-m3)
//   npm run eval --workspace server -- --only q42-q86      score only some questions (ids and ranges)
//   (or) npx tsx --env-file=../.env scripts/eval.ts
//
// Every run is saved in eval/runs/ and compared with eval/baseline.json (use --against <file>
// to compare with another saved run). Use scripts/eval-review.ts to check the labels.
import { parseArgs } from 'node:util';
import { QdrantClient } from '@qdrant/js-client-rest';
import { RecursiveChunker } from '../src/rag/chunking/recursiveChunker.js';
import { config } from '../src/config.js';
import { chunkCoversSpan, findEvidenceSpans } from '../src/eval/evidence.js';
import {
  CUTOFFS,
  evidenceRecall,
  mean,
  randomHitAtK,
  scoreQuestion,
  type QuestionScore,
} from '../src/eval/metrics.js';
import { compareRuns, formatComparison } from '../src/eval/compare.js';
import { loadQuestions, selectQuestions } from '../src/eval/questions.js';
import { buildRunRecord } from '../src/eval/runRecord.js';
import { currentCommit, loadRun, saveRun, writeRun } from '../src/eval/runStore.js';
import type { EvalQuestion } from '../src/eval/types.js';
import { CachingEmbedder } from '../src/rag/embeddings/cachingEmbedder.js';
import { EMBEDDING_DIMENSIONS, GeminiEmbedder } from '../src/rag/embeddings/embedder.js';
import { DEFAULT_TOP_K, keepNearBest } from '../src/rag/retrieval/retriever.js';
import { createReranker } from '../src/rag/rerank/models.js';
import { RERANKER_NAMES, type RerankerName } from '../src/rag/rerank/names.js';
import { createSearch } from '../src/rag/search/createSearch.js';
import { RERANK_CANDIDATES } from '../src/rag/search/rerankedSearch.js';
import { SEARCH_STRATEGIES, type SearchStrategyName } from '../src/rag/search/types.js';
import { QdrantChunkStore, type ChunkPayload } from '../src/rag/vectorstore/qdrantChunkStore.js';

const { values: args } = parseArgs({
  options: {
    label: { type: 'string', default: 'run' },
    'save-baseline': { type: 'boolean', default: false },
    against: { type: 'string' },
    strategy: { type: 'string' },
    'sparse-weight': { type: 'string' },
    only: { type: 'string' },
    reranker: { type: 'string' },
  },
});

const strategyName = (args.strategy ?? config.SEARCH_STRATEGY) as SearchStrategyName;
if (!SEARCH_STRATEGIES.includes(strategyName)) {
  console.error(`Unknown strategy "${strategyName}". Use one of: ${SEARCH_STRATEGIES.join(', ')}`);
  process.exit(1);
}
const rerankerName = (args.reranker ?? config.RERANKER) as RerankerName;
if (!RERANKER_NAMES.includes(rerankerName)) {
  console.error(`Unknown reranker "${rerankerName}". Use one of: ${RERANKER_NAMES.join(', ')}`);
  process.exit(1);
}
const sparseWeight = args['sparse-weight']
  ? Number(args['sparse-weight'])
  : config.HYBRID_SPARSE_WEIGHT;
if (!Number.isFinite(sparseWeight) || sparseWeight < 0) {
  console.error(
    `--sparse-weight must be a number that is 0 or more, got "${args['sparse-weight']}"`,
  );
  process.exit(1);
}
const evalDir = new URL('../eval/', import.meta.url).pathname;
const baselinePath = `${evalDir}baseline.json`;

if (args.only && args['save-baseline']) {
  console.error(
    'A baseline must cover every question, so --save-baseline cannot be used with --only.',
  );
  process.exit(1);
}
const allQuestions = await loadQuestions(`${evalDir}questions.json`);
const questions = args.only ? selectQuestions(allQuestions, args.only) : allQuestions;
if (args.only)
  console.log(
    `Scoring ${questions.length} of ${allQuestions.length} questions (--only ${args.only})`,
  );

const store = new QdrantChunkStore(
  new QdrantClient({ url: config.QDRANT_URL }),
  `chunks_${new RecursiveChunker().name}`,
  EMBEDDING_DIMENSIONS,
);
// The eval asks the same questions every run, so their embeddings are kept in a file (git-ignored).
const embedder = new CachingEmbedder(
  new GeminiEmbedder(config.GOOGLE_API_KEY),
  `${evalDir}cache/query-embeddings.json`,
);
const search = createSearch(strategyName, {
  embedder,
  store,
  sparseWeight,
  reranker: createReranker(rerankerName),
});

const missing = await embedder.countMissing(questions.map((q) => q.question));
console.log(
  missing === 0
    ? `Question embeddings: all ${questions.length} cached, no Gemini requests needed.`
    : `Question embeddings: ${questions.length - missing} cached, ${missing} to fetch ` +
        `(uses ${missing} of the 1000 free Gemini requests a day).`,
);

const stored: ChunkPayload[] = [];
for (const youtubeId of new Set(questions.flatMap((q) => q.youtubeIds))) {
  stored.push(...(await store.sampleChunks(youtubeId, 1000)));
}

interface Result {
  question: EvalQuestion;
  score: QuestionScore;
  randomHit: Record<number, number>;
  topScore: number;
  /** Share of the correct passages inside the chunks the app really sends to the model. */
  keptRecall: number;
  keptCount: number;
  poolSize: number;
}

const answerable: Result[] = [];
const unanswerableTopScores: number[] = [];

for (const question of questions) {
  // Same call as the app's retrieval, but we keep the whole ranked list (no margin) so that
  // recall@1, @3, @5 mean what they say. The margin is judged separately, below.
  const ranked = await search.search(
    question.question,
    question.youtubeIds,
    Math.max(DEFAULT_TOP_K, ...CUTOFFS),
  );
  const topScore = ranked[0]?.score ?? 0;

  if (question.evidence.length === 0) {
    unanswerableTopScores.push(topScore);
    continue;
  }

  const evidence = question.evidence.map((item) => {
    const spans = findEvidenceSpans(stored, item);
    if (spans.length === 0) throw new Error(`${question.id}: quote not found: "${item.quote}"`);
    return spans;
  });

  const pool = stored.filter((chunk) => question.youtubeIds.includes(chunk.youtubeId));
  const relevant = pool.filter((chunk) =>
    evidence.some((passage) => passage.some((span) => chunkCoversSpan(chunk, span))),
  ).length;

  const kept = keepNearBest(ranked.slice(0, DEFAULT_TOP_K), search.maxScoreDrop);

  answerable.push({
    question,
    score: scoreQuestion(ranked, evidence, relevant),
    randomHit: Object.fromEntries(CUTOFFS.map((k) => [k, randomHitAtK(pool.length, relevant, k)])),
    topScore,
    keptRecall: evidenceRecall(kept, evidence),
    keptCount: kept.length,
    poolSize: pool.length,
  });
}

const pct = (value: number) => `${(value * 100).toFixed(0)}%`.padStart(5);
const row = (label: string, values: string[]) => `  ${label.padEnd(26)}${values.join('  ')}`;

console.log(
  `\nRetrieval eval: ${answerable.length} answerable questions, ${unanswerableTopScores.length} unanswerable`,
);
console.log(
  `Settings: search ${search.name}${search.name === 'hybrid' ? ` (sparse weight ${sparseWeight})` : ''}${rerankerName !== 'none' ? `, reranker ${rerankerName} on ${RERANK_CANDIDATES} candidates` : ''}, topK ${DEFAULT_TOP_K}, margin ${search.maxScoreDrop}, chunking recursive 1000/200\n`,
);

const atEachK = (pick: (r: Result, k: number) => number) =>
  CUTOFFS.map((k) => pct(mean(answerable.map((r) => pick(r, k)))));

console.log(
  row(
    '',
    CUTOFFS.map((k) => `top ${k}`.padStart(5)),
  ),
);
console.log(
  row(
    'Hit rate',
    atEachK((r, k) => r.score.hitAt[k] ?? 0),
  ),
);
console.log(
  row(
    'Recall@k',
    atEachK((r, k) => r.score.recallAt[k] ?? 0),
  ),
);
console.log(
  row(
    'Precision@k',
    atEachK((r, k) => r.score.precisionAt[k] ?? 0),
  ),
);
console.log(
  row(
    '  best possible precision',
    atEachK((r, k) => r.score.bestPrecisionAt[k] ?? 0),
  ),
);
console.log(
  row(
    'nDCG@k',
    atEachK((r, k) => r.score.ndcgAt[k] ?? 0),
  ),
);
console.log(
  row(
    'Random guessing (hit rate)',
    atEachK((r, k) => r.randomHit[k] ?? 0),
  ),
);
console.log(`\n  MRR: ${mean(answerable.map((r) => r.score.reciprocalRank)).toFixed(3)}`);

console.log('\nBy question type (MRR, recall@5, precision@5, nDCG@5):');
for (const type of new Set(answerable.map((r) => r.question.type))) {
  const group = answerable.filter((r) => r.question.type === type);
  console.log(
    row(`${type} (${group.length})`, [
      mean(group.map((r) => r.score.reciprocalRank))
        .toFixed(3)
        .padStart(5),
      pct(mean(group.map((r) => r.score.recallAt[5] ?? 0))),
      pct(mean(group.map((r) => r.score.precisionAt[5] ?? 0))),
      pct(mean(group.map((r) => r.score.ndcgAt[5] ?? 0))),
    ]),
  );
}

console.log('\nWhat the model really receives (top-k and margin applied):');
console.log(
  `  evidence recall ${pct(mean(answerable.map((r) => r.keptRecall)))}, ` +
    `${mean(answerable.map((r) => r.keptCount)).toFixed(1)} chunks kept on average ` +
    `(of ${mean(answerable.map((r) => r.poolSize)).toFixed(1)} in the selected videos)`,
);

const missed = answerable.filter((r) => r.score.firstRank !== 1);
console.log(`\nQuestions where the first correct chunk was not rank 1 (${missed.length}):`);
for (const { question, score } of missed) {
  console.log(`  ${question.id} rank ${score.firstRank ?? 'none'}  ${question.question}`);
}

const answerableTops = answerable.map((r) => r.topScore);
console.log('\nCan the top score tell "answer exists" from "no answer"?');
console.log(
  `  answerable: lowest top score ${Math.min(...answerableTops).toFixed(3)}, average ${mean(answerableTops).toFixed(3)}`,
);
console.log(
  `  unanswerable: highest top score ${Math.max(...unanswerableTopScores).toFixed(3)}, average ${mean(unanswerableTopScores).toFixed(3)}`,
);

// Keep this run, and compare it with the baseline (or the file given with --against).
const record = buildRunRecord(
  {
    label: args['save-baseline'] ? 'baseline' : (args.label ?? 'run'),
    commit: currentCommit(),
    settings: {
      search: search.name,
      topK: DEFAULT_TOP_K,
      // JSON cannot store Infinity, so "no margin" is saved as null.
      maxScoreDrop: Number.isFinite(search.maxScoreDrop) ? search.maxScoreDrop : null,
      chunking: new RecursiveChunker().name,
      ...(search.name === 'hybrid' ? { sparseWeight } : {}),
      ...(rerankerName !== 'none'
        ? { reranker: rerankerName, rerankCandidates: RERANK_CANDIDATES }
        : {}),
    },
  },
  answerable.map((r) => ({
    id: r.question.id,
    question: r.question.question,
    type: r.question.type,
    score: r.score,
    topScore: r.topScore,
    keptRecall: r.keptRecall,
    keptCount: r.keptCount,
  })),
  unanswerableTopScores,
);

console.log(`\nSaved this run: ${await saveRun(record, `${evalDir}runs`)}`);

if (args['save-baseline']) {
  await writeRun(record, baselinePath);
  console.log(`Saved as the baseline: ${baselinePath}`);
} else {
  const againstPath = args.against ?? baselinePath;
  try {
    console.log(
      `\n${'='.repeat(78)}\n${formatComparison(compareRuns(await loadRun(againstPath), record))}`,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    console.log(`\nNo ${againstPath} to compare with. Run with --save-baseline to create one.`);
  }
}
