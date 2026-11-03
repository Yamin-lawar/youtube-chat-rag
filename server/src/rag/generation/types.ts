import type { ScoredChunk } from '../vectorstore/qdrantChunkStore.js';

/** A passage the answer was based on. `number` is the [n] used in the answer text. */
export interface Source {
  number: number;
  youtubeId: string;
  startMs: number;
  endMs: number;
}

export interface Answer {
  text: string;
  sources: Source[];
  /** Which provider and model wrote the answer, for debugging and for the saved message. */
  model: string;
}

/** The generation step: question + retrieved chunks -> an answer that cites its sources. */
export interface Generator {
  readonly name: string;
  generate(question: string, chunks: ScoredChunk[]): Promise<Answer>;
}
