// Experiment: do cosine, dot product and Euclidean distance rank chunks differently?
//   npx tsx --env-file=../.env scripts/compare-metrics.ts [youtube-id]
//
// Embeddings are cached in server/.cache so you can rerun this (and change the
// questions below) without using up the Gemini free-tier quota.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { RecursiveChunker } from '../src/rag/chunking/recursiveChunker.js';
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  GeminiEmbedder,
} from '../src/rag/embeddings/embedder.js';
import {
  cosineSimilarity,
  dotProduct,
  euclideanDistance,
  vectorLength,
} from '../src/rag/similarity.js';
import { YoutubeTranscriptProvider } from '../src/rag/transcript/youtubeProvider.js';

const youtubeId = process.argv[2] ?? 'JljlsOJmlCA';
const TOP_K = 5;

// Edit these and rerun. Only new questions cost embedding quota.
const questions = [
  'Does he recommend Supabase?',
  'Why not send the whole transcript to the LLM every time?',
  'How does the chunk overlap work?',
  'What is a vector database?',
  'How do you keep the conversation history?',
];

// ---------- cache ----------
const cacheFile = `.cache/embeddings-${youtubeId}-${EMBEDDING_MODEL}-${EMBEDDING_DIMENSIONS}.json`;
interface Cache {
  chunks: Record<string, number[]>;
  queries: Record<string, number[]>;
}
const cache: Cache = existsSync(cacheFile)
  ? (JSON.parse(readFileSync(cacheFile, 'utf8')) as Cache)
  : { chunks: {}, queries: {} };

function saveCache(): void {
  mkdirSync('.cache', { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(cache));
}

// ---------- data ----------
const log = console.log;
console.log = () => {}; // silences leftover debug logging inside the chunker
const transcript = await new YoutubeTranscriptProvider().getTranscript(youtubeId);
const chunks = await new RecursiveChunker().chunk(transcript);
console.log = log;

const embedder = new GeminiEmbedder(process.env.GOOGLE_API_KEY);

const missingChunks = chunks.filter((chunk) => !cache.chunks[chunk.text]);
if (missingChunks.length > 0) {
  log(`Embedding ${missingChunks.length} new chunks (cached afterwards)...`);
  const vectors = await embedder.embedDocuments(missingChunks.map((chunk) => chunk.text));
  missingChunks.forEach((chunk, i) => (cache.chunks[chunk.text] = vectors[i]!));
  saveCache();
}
for (const question of questions) {
  if (!cache.queries[question]) {
    cache.queries[question] = await embedder.embedQuery(question);
    saveCache();
  }
}

const chunkVectors = chunks.map((chunk) => cache.chunks[chunk.text]!);

// ---------- 1. are the vectors normalized? ----------
const lengths = [...chunkVectors, ...questions.map((q) => cache.queries[q]!)].map(vectorLength);
log('=== 1. Vector lengths (1.0 means normalized) ===');
log(
  `min ${Math.min(...lengths).toFixed(4)} | avg ${(lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(4)} | max ${Math.max(...lengths).toFixed(4)}`,
);

// ---------- 2. rank under each metric ----------
type Ranking = { index: number; score: number }[];

function rank(
  query: number[],
  score: (a: number[], b: number[]) => number,
  higherIsBetter: boolean,
): Ranking {
  return chunkVectors
    .map((vector, index) => ({ index, score: score(query, vector) }))
    .sort((a, b) => (higherIsBetter ? b.score - a.score : a.score - b.score))
    .slice(0, TOP_K);
}

let sameTop1Dot = 0;
let sameTop1Euclid = 0;
let overlapDot = 0;
let overlapEuclid = 0;

for (const question of questions) {
  const query = cache.queries[question]!;
  const cosine = rank(query, cosineSimilarity, true);
  const dot = rank(query, dotProduct, true);
  const euclid = rank(query, euclideanDistance, false);

  log(`\n=== Q: ${question} ===`);
  log('rank | cosine (higher=closer) | dot product (higher=closer) | euclidean (LOWER=closer)');
  for (let i = 0; i < TOP_K; i++) {
    const cell = (r: Ranking) => `#${String(r[i]!.index).padEnd(2)} ${r[i]!.score.toFixed(3)}`;
    log(`  ${i + 1}  | ${cell(cosine).padEnd(22)} | ${cell(dot).padEnd(27)} | ${cell(euclid)}`);
  }

  const cosineSet = new Set(cosine.map((r) => r.index));
  const dotOverlap = dot.filter((r) => cosineSet.has(r.index)).length;
  const euclidOverlap = euclid.filter((r) => cosineSet.has(r.index)).length;
  overlapDot += dotOverlap;
  overlapEuclid += euclidOverlap;
  if (dot[0]!.index === cosine[0]!.index) sameTop1Dot++;
  if (euclid[0]!.index === cosine[0]!.index) sameTop1Euclid++;
  log(
    `top-${TOP_K} shared with cosine -> dot: ${dotOverlap}/${TOP_K}, euclidean: ${euclidOverlap}/${TOP_K}`,
  );
}

// ---------- 3. summary ----------
const total = questions.length;
log('\n=== 3. Summary versus cosine ===');
log(`same #1 chunk:        dot ${sameTop1Dot}/${total}   euclidean ${sameTop1Euclid}/${total}`);
log(
  `avg top-${TOP_K} overlap:    dot ${(overlapDot / total).toFixed(1)}/${TOP_K}   euclidean ${(overlapEuclid / total).toFixed(1)}/${TOP_K}`,
);
