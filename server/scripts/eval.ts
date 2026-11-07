// Score retrieval on the eval questions. Prints hit rate, recall and MRR.
//
//   npm run eval --workspace server
//   (or) npx tsx --env-file=../.env scripts/eval.ts
//
// Use scripts/eval-review.ts to look at individual questions and check the labels.
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
import { loadQuestions } from '../src/eval/questions.js';
import type { EvalQuestion } from '../src/eval/types.js';
import { EMBEDDING_DIMENSIONS, GeminiEmbedder } from '../src/rag/embeddings/embedder.js';
import {
  DEFAULT_MAX_SCORE_DROP,
  DEFAULT_TOP_K,
  keepNearBest,
} from '../src/rag/retrieval/retriever.js';
import { QdrantChunkStore, type ChunkPayload } from '../src/rag/vectorstore/qdrantChunkStore.js';

const questions = await loadQuestions(new URL('../eval/questions.json', import.meta.url).pathname);

const store = new QdrantChunkStore(
  new QdrantClient({ url: config.QDRANT_URL }),
  `chunks_${new RecursiveChunker().name}`,
  EMBEDDING_DIMENSIONS,
);
const embedder = new GeminiEmbedder(config.GOOGLE_API_KEY);

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
  const ranked = await store.search(
    await embedder.embedQuery(question.question),
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

  const kept = keepNearBest(ranked.slice(0, DEFAULT_TOP_K), DEFAULT_MAX_SCORE_DROP);

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
  `Settings: topK ${DEFAULT_TOP_K}, margin ${DEFAULT_MAX_SCORE_DROP}, chunking recursive 1000/200\n`,
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
