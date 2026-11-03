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

/**
 * An answer that is still being written. The sources are known up front, because they come
 * from retrieval, so the UI can show them while the text is still arriving.
 */
export interface AnswerStream {
  sources: Source[];
  model: string;
  tokens: AsyncIterable<string>;
}

/** The generation step: question + retrieved chunks -> an answer that cites its sources. */
export interface Generator {
  readonly name: string;
  /**
   * Starts the answer and resolves once the first piece of text has arrived, so a provider
   * that is down fails here, before anything is sent to the user. A failure after that
   * point surfaces while reading `tokens`.
   */
  stream(question: string, chunks: ScoredChunk[]): Promise<AnswerStream>;
  /** The whole answer at once, for callers that do not stream. */
  generate(question: string, chunks: ScoredChunk[]): Promise<Answer>;
}
