// RAG block 3: look at embeddings before storing anything.
//   npx tsx --env-file=../.env scripts/inspect-embeddings.ts [youtube-id]
import { RecursiveChunker } from '../src/rag/chunking/recursiveChunker.js';
import { GeminiEmbedder } from '../src/rag/embeddings/embedder.js';
import { cosineSimilarity } from '../src/rag/similarity.js';
import { YoutubeTranscriptProvider } from '../src/rag/transcript/youtubeProvider.js';

const youtubeId = process.argv[2] ?? 'JljlsOJmlCA';

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

const transcript = await new YoutubeTranscriptProvider().getTranscript(youtubeId);
const chunks = await new RecursiveChunker().chunk(transcript);
const embedder = new GeminiEmbedder(process.env.GOOGLE_API_KEY);

console.log(`Embedding ${chunks.length} chunks...`);
const vectors = await embedder.embedDocuments(chunks.map((chunk) => chunk.text));

// 1. What an embedding looks like
const first = vectors[0]!;
console.log('\n=== 1. One embedding ===');
console.log('numbers in the vector:', first.length);
console.log(
  'first 8 numbers:      ',
  first
    .slice(0, 8)
    .map((n) => n.toFixed(4))
    .join(', '),
);

// 2. Similarity between chunks
const last = chunks.length - 1;
console.log('\n=== 2. Chunk vs chunk (cosine similarity) ===');
console.log(
  'chunk 0 vs chunk 1 (neighbours, overlapping):',
  cosineSimilarity(first, vectors[1]!).toFixed(3),
);
console.log(
  'chunk 0 vs chunk 2 (two steps away):         ',
  cosineSimilarity(first, vectors[2]!).toFixed(3),
);
console.log(
  `chunk 0 vs chunk ${last} (start vs end of video):`,
  cosineSimilarity(first, vectors[last]!).toFixed(3),
);

// 3. Questions against all chunks (a preview of retrieval)
const questions = [
  'Does he recommend Supabase?',
  'Why not send the whole transcript to the LLM every time?',
  'What is the weather like today?',
];

console.log('\n=== 3. Questions vs chunks: top 3 matches ===');
for (const question of questions) {
  const queryVector = await embedder.embedQuery(question);
  const ranked = vectors
    .map((vector, i) => ({ chunk: chunks[i]!, score: cosineSimilarity(queryVector, vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  console.log(`\nQ: ${question}`);
  for (const { chunk, score } of ranked) {
    const preview = chunk.text.slice(0, 110).replace(/\s+/g, ' ');
    console.log(`  ${score.toFixed(3)}  [${formatTime(chunk.startMs)}]  ${preview}...`);
  }
}
