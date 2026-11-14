import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { QueryExpander } from './types.js';

/**
 * Remembers what the model wrote for each question in a file. The eval asks the same questions
 * every run, the free answer models have small daily limits, and an expansion written once
 * means every later run (and every comparison) searches with exactly the same text.
 * Only successful expansions are saved, so a failure is retried next time.
 */
export class CachingQueryExpander implements QueryExpander {
  private cache: Map<string, string[]> | undefined;

  constructor(
    private readonly inner: QueryExpander,
    private readonly path: string,
  ) {}

  get id(): string {
    return this.inner.id;
  }

  /** How many of these questions are not cached yet, so each would cost one model call. */
  async countMissing(questions: string[]): Promise<number> {
    const cache = await this.load();
    return new Set(questions.filter((q) => !cache.has(this.keyFor(q)))).size;
  }

  async expand(question: string): Promise<string[]> {
    const cache = await this.load();
    const key = this.keyFor(question);

    const known = cache.get(key);
    if (known) return known;

    const texts = await this.inner.expand(question);
    cache.set(key, texts);
    await this.save(cache);
    return texts;
  }

  private keyFor(question: string): string {
    return createHash('sha256').update(`${this.inner.id}\n${question}`).digest('hex');
  }

  private async load(): Promise<Map<string, string[]>> {
    if (this.cache) return this.cache;
    try {
      const saved = JSON.parse(await readFile(this.path, 'utf8')) as Record<string, string[]>;
      this.cache = new Map(Object.entries(saved));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.cache = new Map();
    }
    return this.cache;
  }

  private async save(cache: Map<string, string[]>): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    await writeFile(temporary, JSON.stringify(Object.fromEntries(cache)));
    await rename(temporary, this.path);
  }
}
