import type { ScoredChunk } from '../vectorstore/qdrantChunkStore.js';
import type { Answer, AnswerStream, Generator } from './types.js';

/** Tries each generator in order and uses the first one that succeeds. */
export class FallbackGenerator implements Generator {
  readonly name: string;

  constructor(private readonly generators: Generator[]) {
    if (generators.length === 0) throw new Error('FallbackGenerator needs at least one generator');
    this.name = generators.map((generator) => generator.name).join(' -> ');
  }

  /**
   * Switching is only possible before the first token. Once a provider has started
   * answering, text is already on the user's screen and cannot be swapped for another
   * model's answer, so a later failure is passed on to the caller.
   */
  stream(question: string, chunks: ScoredChunk[]): Promise<AnswerStream> {
    return this.firstThatWorks((generator) => generator.stream(question, chunks));
  }

  generate(question: string, chunks: ScoredChunk[]): Promise<Answer> {
    return this.firstThatWorks((generator) => generator.generate(question, chunks));
  }

  private async firstThatWorks<T>(attempt: (generator: Generator) => Promise<T>): Promise<T> {
    const errors: string[] = [];

    for (const generator of this.generators) {
      try {
        return await attempt(generator);
      } catch (error) {
        errors.push(`${generator.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new Error(`All generators failed.\n${errors.join('\n')}`);
  }
}
