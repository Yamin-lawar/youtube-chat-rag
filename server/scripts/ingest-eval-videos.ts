// Ingest every video the eval questions use into the collection of one chunking variant.
//
//   npm run ingest:eval --workspace server -- --chunking 500/100 --dry-run   only count the chunks
//   npm run ingest:eval --workspace server -- --chunking 500/100             write the collection
//
// Each variant gets its own Qdrant collection (chunks_recursive-500-100), so the one the app
// uses (chunks_recursive, 1000/200) is never touched. Every chunk is embedded with Gemini and
// every chunk is one request of the 1000 a day on the free tier, so the script says how many it
// needs before it starts. A video that is already in the collection is skipped, so a run that
// stops on the daily limit can be repeated the next day and carries on where it stopped.
import { parseArgs } from 'node:util';
import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../src/config.js';
import { createChunker } from '../src/rag/chunking/createChunker.js';
import { EMBEDDING_DIMENSIONS, GeminiEmbedder } from '../src/rag/embeddings/embedder.js';
import { loadQuestions } from '../src/eval/questions.js';
import { ingestVideo } from '../src/rag/ingest.js';
import { CachingTranscriptProvider } from '../src/rag/transcript/cachingTranscriptProvider.js';
import { YoutubeTranscriptProvider } from '../src/rag/transcript/youtubeProvider.js';
import { QdrantChunkStore } from '../src/rag/vectorstore/qdrantChunkStore.js';

const { values: args } = parseArgs({
  options: {
    chunking: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
  },
});

const chunker = createChunker(args.chunking);
const evalDir = new URL('../eval/', import.meta.url).pathname;
const questions = await loadQuestions(`${evalDir}questions.json`);
const youtubeIds = [...new Set(questions.flatMap((q) => q.youtubeIds))];

const transcripts = new CachingTranscriptProvider(
  new YoutubeTranscriptProvider(),
  `${evalDir}cache/transcripts`,
);

// 1. Cut every transcript, which costs nothing, to know how many chunks this variant makes.
const chunkCounts = new Map<string, number>();
for (const id of youtubeIds) {
  const chunks = await chunker.chunk(await transcripts.getTranscript(id));
  chunkCounts.set(id, chunks.length);
}
const totalChunks = [...chunkCounts.values()].reduce((sum, n) => sum + n, 0);
console.log(`Chunking ${chunker.name}: ${totalChunks} chunks from ${youtubeIds.length} videos.`);
for (const [id, count] of chunkCounts) console.log(`  ${id}  ${count} chunks`);

if (args['dry-run']) {
  console.log(
    `\nWriting all of them would use ${totalChunks} of the 1000 free Gemini requests a day.`,
  );
  process.exit(0);
}

// 2. Skip the videos that are already stored, then say what is left to embed.
const store = new QdrantChunkStore(
  new QdrantClient({ url: config.QDRANT_URL }),
  `chunks_${chunker.name}`,
  EMBEDDING_DIMENSIONS,
);
await store.ensureCollection();

const todo: string[] = [];
for (const id of youtubeIds) {
  if (args.force || (await store.countChunks(id)) === 0) todo.push(id);
}
const toEmbed = todo.reduce((sum, id) => sum + (chunkCounts.get(id) ?? 0), 0);
console.log(
  `\n${youtubeIds.length - todo.length} videos already in "chunks_${chunker.name}", ` +
    `${todo.length} to write (${toEmbed} Gemini requests).`,
);

// 3. Write them one video at a time. A video is replaced as a whole, so a stop leaves no half video.
const embedder = new GeminiEmbedder(config.GOOGLE_API_KEY);
for (const [i, id] of todo.entries()) {
  try {
    const result = await ingestVideo(id, {
      transcriptProvider: transcripts,
      chunker,
      embedder,
      store,
    });
    console.log(`  [${i + 1}/${todo.length}] ${id} ${result.chunkCount} chunks stored`);
  } catch (error) {
    console.error(
      `\nStopped at ${id} (${i} of ${todo.length} videos written). Run the same command again to ` +
        `carry on.\n${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}
console.log(`\nDone. Collection "chunks_${chunker.name}" has all ${youtubeIds.length} videos.`);
