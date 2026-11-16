import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Transcript, TranscriptProvider } from './types.js';

/**
 * Keeps each transcript in a file, so one video is downloaded once. A chunking experiment
 * cuts the same transcript several ways, and every variant must start from exactly the same
 * text (captions on YouTube can change, and a failed download should not stop a run).
 */
export class CachingTranscriptProvider implements TranscriptProvider {
  constructor(
    private readonly inner: TranscriptProvider,
    private readonly directory: string,
  ) {}

  async getTranscript(youtubeId: string): Promise<Transcript> {
    // Video ids are letters, digits, "-" and "_". Anything else must not become part of a path.
    if (!/^[\w-]+$/.test(youtubeId)) throw new Error(`Not a YouTube video id: "${youtubeId}"`);
    const path = join(this.directory, `${youtubeId}.json`);

    try {
      return JSON.parse(await readFile(path, 'utf8')) as Transcript;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    const transcript = await this.inner.getTranscript(youtubeId);
    await mkdir(this.directory, { recursive: true });
    await writeFile(path, JSON.stringify(transcript));
    return transcript;
  }
}
