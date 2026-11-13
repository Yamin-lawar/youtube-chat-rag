// Answer-level eval: does the whole pipeline (retrieve, then answer) behave, and does it refuse
// the questions the videos cannot answer? Retrieval scores (scripts/eval.ts) say where the right
// chunk ranks. They do not say what the answer model does with the chunks it is given.
//
//   npm run eval:answers --workspace server -- --label dense
//   npm run eval:answers --workspace server -- --reranker bge-m3 --label dense-bge-m3
//   npm run eval:answers --workspace server -- --only q24,q25 --dry-run      only count the calls
//
// Per question it records whether the answer refused, and, for answerable questions, whether
// it cites a passage that really holds the labelled quote. There is no LLM judge: both checks
// are deterministic, so a re-run on cached answers gives the same numbers. Read the answers
// (they are in the saved run file) before trusting a refusal or citation count.
import { parseArgs } from 'node:util';
import { QdrantClient } from '@qdrant/js-client-rest';
import { RecursiveChunker } from '../src/rag/chunking/recursiveChunker.js';
import { config } from '../src/config.js';
import { AnswerCache, answerKey } from '../src/eval/answerCache.js';
import { citationPrecision, citesEvidence, isRefusal } from '../src/eval/answerChecks.js';
import { findEvidenceSpans } from '../src/eval/evidence.js';
import { mean } from '../src/eval/metrics.js';
import { loadQuestions, selectQuestions } from '../src/eval/questions.js';
import { parseRateLimit } from '../src/eval/rateLimit.js';
import type { EvalQuestion } from '../src/eval/types.js';
import { CachingEmbedder } from '../src/rag/embeddings/cachingEmbedder.js';
import { EMBEDDING_DIMENSIONS, GeminiEmbedder } from '../src/rag/embeddings/embedder.js';
import { NOT_FOUND_ANSWER } from '../src/rag/generation/chatModelGenerator.js';
import { SYSTEM_PROMPT, buildUserPrompt } from '../src/rag/generation/prompt.js';
import { createGenerator } from '../src/rag/generation/providers.js';
import { createReranker } from '../src/rag/rerank/models.js';
import { RERANKER_NAMES, type RerankerName } from '../src/rag/rerank/names.js';
import { retrieveChunks } from '../src/rag/retrieval/retriever.js';
import { createSearch } from '../src/rag/search/createSearch.js';
import { QdrantChunkStore, type ScoredChunk } from '../src/rag/vectorstore/qdrantChunkStore.js';
import { currentCommit } from '../src/eval/runStore.js';
import { mkdir, writeFile } from 'node:fs/promises';

const { values: args } = parseArgs({
  options: {
    label: { type: 'string', default: 'run' },
    reranker: { type: 'string' },
    only: { type: 'string' },
    provider: { type: 'string', default: 'groq' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const rerankerName = (args.reranker ?? config.RERANKER) as RerankerName;
if (!RERANKER_NAMES.includes(rerankerName)) {
  console.error(`Unknown reranker "${rerankerName}". Use one of: ${RERANKER_NAMES.join(', ')}`);
  process.exit(1);
}
if (args.provider !== 'groq' && args.provider !== 'gemini') {
  console.error(`--provider must be groq or gemini, got "${args.provider}"`);
  process.exit(1);
}

// One provider only, on purpose. The app falls back from Groq to Gemini, but in an eval a
// switch halfway would compare two different models and call the difference a retrieval effect.
const generator = createGenerator(
  args.provider === 'groq'
    ? { groqApiKey: config.GROQ_API_KEY }
    : { googleApiKey: config.GOOGLE_API_KEY },
);

const evalDir = new URL('../eval/', import.meta.url).pathname;
const allQuestions = await loadQuestions(`${evalDir}questions.json`);
const questions = args.only ? selectQuestions(allQuestions, args.only) : allQuestions;

const store = new QdrantChunkStore(
  new QdrantClient({ url: config.QDRANT_URL }),
  `chunks_${new RecursiveChunker().name}`,
  EMBEDDING_DIMENSIONS,
);
const embedder = new CachingEmbedder(
  new GeminiEmbedder(config.GOOGLE_API_KEY),
  `${evalDir}cache/query-embeddings.json`,
);
const search = createSearch(config.SEARCH_STRATEGY, {
  embedder,
  store,
  sparseWeight: config.HYBRID_SPARSE_WEIGHT,
  reranker: createReranker(rerankerName),
});

const missing = await embedder.countMissing(questions.map((q) => q.question));
if (missing > 0) {
  console.log(`Question embeddings: ${missing} not cached, they use Gemini embedding requests.`);
}

const stored = (
  await Promise.all(
    [...new Set(questions.flatMap((q) => q.youtubeIds))].map((id) => store.sampleChunks(id, 1000)),
  )
).flat();

// 1. Retrieve exactly as the app does, for every question, before any answer is written.
interface Prepared {
  question: EvalQuestion;
  chunks: ScoredChunk[];
  key: string;
  prompt: string;
}
const prepared: Prepared[] = [];
for (const question of questions) {
  const chunks = await retrieveChunks(
    question.question,
    { search },
    { youtubeIds: question.youtubeIds },
  );
  const prompt = buildUserPrompt(question.question, chunks);
  prepared.push({
    question,
    chunks,
    prompt,
    key: answerKey(generator.name, SYSTEM_PROMPT, prompt),
  });
}

// 2. Say what this run will cost before spending it.
const cache = new AnswerCache(`${evalDir}cache/answers.json`);
const toWrite: Prepared[] = [];
for (const item of prepared) {
  if (item.chunks.length > 0 && !(await cache.has(item.key))) toWrite.push(item);
}
// About 4 characters per token, a rough count that is enough to compare with a daily limit.
const inputTokens = Math.round(
  toWrite.reduce((sum, item) => sum + (SYSTEM_PROMPT.length + item.prompt.length) / 4, 0),
);
console.log(
  `Answers: ${prepared.length - toWrite.length} cached, ${toWrite.length} to write with ${generator.name} ` +
    `(about ${inputTokens.toLocaleString()} input tokens, plus the answers).`,
);
if (args['dry-run']) process.exit(0);

const MAX_MINUTE_WAITS = 8;

/** Writes one answer. A per-minute limit or a short overload is waited out, anything else is thrown. */
async function writeAnswer(item: Prepared) {
  for (let waits = 0; ; waits++) {
    try {
      return await generator.generate(item.question.question, item.chunks);
    } catch (error) {
      const limit = parseRateLimit(error instanceof Error ? error.message : String(error));
      if (limit?.window !== 'minute' || waits >= MAX_MINUTE_WAITS) throw error;
      const seconds = Math.ceil(limit.waitSeconds) + 1;
      console.log(`  provider busy or rate limited (per minute), waiting ${seconds}s`);
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    }
  }
}

// 3. Write the missing answers one by one, saving each, and stop cleanly on the first failure.
for (const [i, item] of toWrite.entries()) {
  try {
    const answer = await writeAnswer(item);
    await cache.set(item.key, { text: answer.text, model: answer.model });
    console.log(`  [${i + 1}/${toWrite.length}] ${item.question.id} done`);
  } catch (error) {
    console.error(
      `\nStopped at ${item.question.id} (${i} of ${toWrite.length} written, all saved). ` +
        `Run the same command again to continue.\n${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

// 4. Score.
interface Row {
  id: string;
  type: EvalQuestion['type'];
  question: string;
  chunkCount: number;
  model: string;
  refused: boolean;
  /** Only for answerable questions that were answered. */
  citedEvidence: boolean | null;
  /** Share of the cited excerpts that hold the evidence. Same cases as `citedEvidence`. */
  citationPrecision: number | null;
  answer: string;
}
const rows: Row[] = [];
for (const { question, chunks, key } of prepared) {
  const cached = await cache.get(key);
  const answer = cached ?? { text: NOT_FOUND_ANSWER, model: 'no-chunks' };
  const refused = isRefusal(answer.text);

  let citedEvidence: boolean | null = null;
  let precision: number | null = null;
  if (question.evidence.length > 0 && !refused) {
    const spans = question.evidence.map((item) => {
      const found = findEvidenceSpans(stored, item);
      if (found.length === 0) throw new Error(`${question.id}: quote not found: "${item.quote}"`);
      return found;
    });
    citedEvidence = citesEvidence(answer.text, chunks, spans);
    precision = citationPrecision(answer.text, chunks, spans);
  }

  rows.push({
    id: question.id,
    type: question.type,
    question: question.question,
    chunkCount: chunks.length,
    model: answer.model,
    refused,
    citedEvidence,
    citationPrecision: precision,
    answer: answer.text,
  });
}

const unanswerable = rows.filter((r) => r.type === 'unanswerable');
const answerable = rows.filter((r) => r.type !== 'unanswerable');
const answered = answerable.filter((r) => !r.refused);
const good = answered.filter((r) => r.citedEvidence);
const share = (n: number, of: number) => (of === 0 ? 'n/a' : `${((n / of) * 100).toFixed(0)}%`);
const chunkAverage = rows.reduce((sum, r) => sum + r.chunkCount, 0) / Math.max(rows.length, 1);

console.log(
  `\nAnswer eval: ${answerable.length} answerable, ${unanswerable.length} unanswerable questions`,
);
console.log(
  `Settings: search ${search.name}, reranker ${rerankerName}, answers by ${[...new Set(rows.map((r) => r.model))].join(', ')}, ` +
    `${chunkAverage.toFixed(1)} chunks per question on average\n`,
);
console.log(
  `  Unanswerable, correctly refused   ${unanswerable.filter((r) => r.refused).length} of ${unanswerable.length}`,
);
console.log(
  `  Answerable, wrongly refused       ${answerable.length - answered.length} of ${answerable.length} (${share(answerable.length - answered.length, answerable.length)})`,
);
console.log(
  `  Answerable, answered and cited the right passage   ${good.length} of ${answerable.length} (${share(good.length, answerable.length)})`,
);
console.log(
  `  Answered, but cited no passage with the evidence   ${answered.length - good.length} of ${answered.length}`,
);
const precisions = answered.flatMap((r) =>
  r.citationPrecision === null ? [] : [r.citationPrecision],
);
console.log(
  `  Citation precision (cited excerpts that hold the evidence)   ${
    precisions.length === 0 ? 'n/a' : mean(precisions).toFixed(2)
  }`,
);

const list = (title: string, items: Row[]) => {
  if (items.length === 0) return;
  console.log(`\n${title} (${items.length}):`);
  for (const r of items) console.log(`  ${r.id} [${r.type}] ${r.question}`);
};
list(
  'Unanswerable questions that got an answer',
  unanswerable.filter((r) => !r.refused),
);
list(
  'Answerable questions that were refused',
  answerable.filter((r) => r.refused),
);
list(
  'Answered without citing the evidence',
  answered.filter((r) => !r.citedEvidence),
);

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const outDir = `${evalDir}answers/`;
await mkdir(outDir, { recursive: true });
const path = `${outDir}${stamp}-${args.label?.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
await writeFile(
  path,
  JSON.stringify(
    {
      label: args.label,
      commit: currentCommit(),
      settings: { search: search.name, reranker: rerankerName, generator: generator.name },
      summary: {
        unanswerableRefused: unanswerable.filter((r) => r.refused).length,
        unanswerable: unanswerable.length,
        answerableRefused: answerable.length - answered.length,
        answerable: answerable.length,
        answeredWithEvidence: good.length,
        citationPrecision: precisions.length === 0 ? null : mean(precisions),
      },
      rows,
    },
    null,
    2,
  ) + '\n',
);
console.log(`\nSaved this run (with every answer): ${path}`);
