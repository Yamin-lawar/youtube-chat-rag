import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { EMBEDDING_MODEL, type Embedder } from './embedder.js';

/**
 * Remembers the embedding of every question in a file, so asking the same question again costs
 * no API call. The eval asks the same 86 questions every run, and the Gemini free tier allows
 * only 1000 embedding requests a day, so without this a dozen experiments use the whole quota.
 *
 * Only questions are cached. Documents are embedded once at ingest and stored in Qdrant, so
 * `embedDocuments` goes straight through. The key includes the model and vector size, so
 * changing either starts a fresh cache and never returns vectors of the wrong kind.
 */
export class CachingEmbedder implements Embedder {
  private cache: Map<string, number[]> | undefined;

  constructor(
    private readonly inner: Embedder,
    private readonly path: string,
    private readonly model: string = EMBEDDING_MODEL,
  ) {}

  get dimensions(): number {
    return this.inner.dimensions;
  }

  embedDocuments(texts: string[]): Promise<number[][]> {
    return this.inner.embedDocuments(texts);
  }

  /** How many of these questions are not cached yet, so each would use one embedding request. */
  async countMissing(texts: string[]): Promise<number> {
    const cache = await this.load();
    return new Set(texts.filter((text) => !cache.has(this.keyFor(text)))).size;
  }

  async embedQuery(text: string): Promise<number[]> {
    const cache = await this.load();
    const key = this.keyFor(text);

    const known = cache.get(key);
    if (known) return known;

    const vector = await this.inner.embedQuery(text);
    cache.set(key, vector);
    // Saved after every new question, so a run that hits a quota error halfway keeps its work.
    await this.save(cache);
    return vector;
  }

  private keyFor(text: string): string {
    return `${this.model}:${this.inner.dimensions}:${text}`;
  }

  private async load(): Promise<Map<string, number[]>> {
    if (this.cache) return this.cache;
    try {
      const entries = JSON.parse(await readFile(this.path, 'utf8')) as Record<string, number[]>;
      this.cache = new Map(Object.entries(entries));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.cache = new Map();
    }
    return this.cache;
  }

  private async save(cache: Map<string, number[]>): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    // Written to a temporary file and renamed, so an interrupted write cannot leave a broken cache.
    const temporary = `${this.path}.tmp`;
    await writeFile(temporary, JSON.stringify(Object.fromEntries(cache)));
    await rename(temporary, this.path);
  }
}
