import type { Transcript } from '../transcript/types.js';

/** A piece of transcript that is embedded and retrieved as one unit. */
export interface Chunk {
  /** Position of the chunk within its video, starting at 0. */
  index: number;
  text: string;
  /** Where the chunk starts and ends in the video, for citations and "jump to" links. */
  startMs: number;
  endMs: number;
}

/**
 * A chunking strategy. Every strategy takes a transcript and returns chunks with
 * timestamps, so strategies can be swapped and compared without changing the pipeline.
 */
export interface Chunker {
  readonly name: string;
  chunk(transcript: Transcript): Promise<Chunk[]>;
}
