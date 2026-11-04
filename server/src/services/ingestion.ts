import { prisma } from '../db/client.js';
import { ingestVideo } from '../rag/ingest.js';
import { getRagServices } from '../rag/services.js';
import { JobQueue } from './jobQueue.js';

const MAX_ERROR_LENGTH = 500;

async function ingestAndRecord(youtubeId: string): Promise<void> {
  try {
    const result = await ingestVideo(youtubeId, getRagServices());
    await prisma.video.update({
      where: { youtubeId },
      data: { status: 'ready', chunkCount: result.chunkCount, errorMessage: null },
    });
    console.log(`Ingested ${youtubeId}: ${result.chunkCount} chunks`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Ingesting ${youtubeId} failed:`, message);
    await prisma.video.update({
      where: { youtubeId },
      data: { status: 'failed', errorMessage: message.slice(0, MAX_ERROR_LENGTH) },
    });
  }
}

const queue = new JobQueue(ingestAndRecord);

/** Starts ingesting in the background. The video's status tells the UI how it is going. */
export function queueIngestion(youtubeId: string): void {
  queue.add(youtubeId);
}

/**
 * Called once at startup. Anything that was in progress when the server stopped is lost
 * (the queue lives in memory), so we put unfinished videos back in the queue and mark
 * answers that were mid-stream as failed instead of leaving them "streaming" forever.
 */
export async function recoverUnfinishedWork(): Promise<void> {
  const unfinished = await prisma.video.findMany({
    where: { status: 'processing' },
    select: { youtubeId: true },
  });
  for (const { youtubeId } of unfinished) queueIngestion(youtubeId);

  const { count } = await prisma.message.updateMany({
    where: { status: 'streaming' },
    data: { status: 'failed' },
  });

  if (unfinished.length > 0 || count > 0) {
    console.log(`Recovered: ${unfinished.length} video(s) re-queued, ${count} message(s) failed`);
  }
}
