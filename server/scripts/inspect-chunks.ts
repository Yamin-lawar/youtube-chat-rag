// RAG block 2: look at the chunks before embedding anything.
//   npx tsx scripts/inspect-chunks.ts [youtube-id] [chunkSize] [chunkOverlap]
import { RecursiveChunker } from '../src/rag/chunking/recursiveChunker.js';
import { YoutubeTranscriptProvider } from '../src/rag/transcript/youtubeProvider.js';

const youtubeId = process.argv[2] ?? 'JljlsOJmlCA';
const chunkSize = Number(process.argv[3] ?? 1000);
const chunkOverlap = Number(process.argv[4] ?? 200);

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

const transcript = await new YoutubeTranscriptProvider().getTranscript(youtubeId);
const chunks = await new RecursiveChunker({ chunkSize, chunkOverlap }).chunk(transcript);

const sizes = chunks.map((chunk) => chunk.text.length);
const average = Math.round(sizes.reduce((sum, size) => sum + size, 0) / sizes.length);

console.log(`settings:  chunkSize=${chunkSize}  chunkOverlap=${chunkOverlap}`);
console.log(`segments:  ${transcript.segments.length}  ->  chunks: ${chunks.length}`);
console.log(
  `size:      min ${Math.min(...sizes)} | avg ${average} | max ${Math.max(...sizes)} chars`,
);

for (const chunk of chunks.slice(0, 3)) {
  console.log(
    `\n--- chunk ${chunk.index}  [${formatTime(chunk.startMs)} - ${formatTime(chunk.endMs)}]  ${chunk.text.length} chars`,
  );
  console.log(chunk.text);
}

// The overlap, made visible: the end of chunk 0 should reappear at the start of chunk 1.
const [first, second] = chunks;
if (first && second) {
  console.log('\n=== overlap between chunk 0 and chunk 1 ===');
  console.log('end of chunk 0:   ...' + first.text.slice(-120));
  console.log('start of chunk 1: ' + second.text.slice(0, 120) + '...');
}
