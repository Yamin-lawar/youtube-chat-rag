import type { ScoredChunk } from '../vectorstore/qdrantChunkStore.js';
import type { Answer, Generator } from './types.js';

/** Tries each generator in order and returns the first answer that succeeds. */
export class FallbackGenerator implements Generator {
  readonly name: string;

  constructor(private readonly generators: Generator[]) {
    if (generators.length === 0) throw new Error('FallbackGenerator needs at least one generator');
    this.name = generators.map((generator) => generator.name).join(' -> ');
  }

  async generate(question: string, chunks: ScoredChunk[]): Promise<Answer> {
    const errors: string[] = [];

    for (const generator of this.generators) {
      try {
        return await generator.generate(question, chunks);
      } catch (error) {
        errors.push(`${generator.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new Error(`All generators failed.\n${errors.join('\n')}`);
  }
}
